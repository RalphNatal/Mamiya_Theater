import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withCors } from "../_shared/cors.ts";

// ─────────────────────────────────────────────────────────────────────────
// CSP VIOLATION SINK — where browsers POST Content-Security-Policy reports.
//
// vercel.json ships the full CSP as Content-Security-Policy-Report-Only, with
//   report-uri https://<project>.supabase.co/functions/v1/csp-report   (all browsers)
//   report-to  csp  +  Reporting-Endpoints: csp="…/csp-report"          (Chromium)
// so nothing is blocked yet; each would-be block lands here instead. Watch them
// in Supabase dashboard → Edge Functions → csp-report → Logs (filter "csp:").
// Once a full pass of the live site (checkout, Google sign-in, PayPal, YouTube,
// QR scanner) logs nothing unexpected, flip the header to enforcing — see
// docs/security-hardening.md.
//
// Browsers send no JWT, so verify_jwt = false (supabase/config.toml). Nothing
// is stored: each report is reduced to a one-line summary in the function log.
// Bodies are capped so the endpoint can't be used to flood the logs.
// ─────────────────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 32 * 1024;
const MAX_REPORTS_PER_REQUEST = 20;

type Summary = {
  directive: string;
  blocked: string;
  page: string;
  source: string;
  disposition: string;
  sample: string;
};

// Clip, strip query strings, and redact ids: a /ticket/<ref> path or a booking
// uuid is a capability (it opens the ticket), so it must never reach the logs.
function clean(value: unknown, max = 200): string {
  return String(value ?? "")
    .slice(0, 1000)
    .replace(/[?#].*$/, "")
    .replace(/\/ticket\/[^/]+/gi, "/ticket/:ref")
    .replace(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi, ":id")
    .slice(0, max);
}

// Legacy report-uri body: { "csp-report": { "violated-directive": … } }
function fromLegacy(r: Record<string, unknown>): Summary {
  return {
    directive: clean(r["effective-directive"] ?? r["violated-directive"], 60),
    blocked: clean(r["blocked-uri"]),
    page: clean(r["document-uri"]),
    source: clean(r["source-file"]) + (r["line-number"] ? `:${r["line-number"]}` : ""),
    disposition: clean(r["disposition"], 20),
    sample: String(r["script-sample"] ?? "").slice(0, 60),
  };
}

// Reporting API body: [{ type: "csp-violation", body: { effectiveDirective: … } }]
function fromReportingApi(r: Record<string, unknown>): Summary {
  return {
    directive: clean(r.effectiveDirective, 60),
    blocked: clean(r.blockedURL),
    page: clean(r.documentURL),
    source: clean(r.sourceFile) + (r.lineNumber ? `:${r.lineNumber}` : ""),
    disposition: clean(r.disposition, 20),
    sample: String(r.sample ?? "").slice(0, 60),
  };
}

// withCors answers the Reporting API preflight and refuses reports posted
// from origins other than our own (it stamps the CORS headers on each reply).
Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const summaries: Summary[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed.slice(0, MAX_REPORTS_PER_REQUEST)) {
      const r = item as Record<string, unknown>;
      if (r?.type === "csp-violation" && r.body && typeof r.body === "object") {
        summaries.push(fromReportingApi(r.body as Record<string, unknown>));
      }
    }
  } else if (parsed && typeof parsed === "object" && "csp-report" in parsed) {
    const r = (parsed as Record<string, unknown>)["csp-report"];
    if (r && typeof r === "object") summaries.push(fromLegacy(r as Record<string, unknown>));
  }

  for (const s of summaries) {
    // One greppable line per violation: "csp: <directive> blocked <uri> on <page>".
    console.warn(`csp: ${s.directive} blocked ${s.blocked || "(inline)"} on ${s.page}`, JSON.stringify(s));
  }

  return new Response(null, { status: 204 });
}));
