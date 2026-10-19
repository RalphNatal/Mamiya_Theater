// ─────────────────────────────────────────────────────────────────────────
// ORIGIN ALLOW-LIST + CORS for every browser-facing Edge Function.
//
// Replaces the old `Access-Control-Allow-Origin: *`: the request Origin is
// echoed back ONLY when it is allow-listed, and a browser request from any
// other origin is refused with 403 before the handler runs. Requests with NO
// Origin (server-to-server: pg_cron's reminder call, curl, the payment
// providers) pass through untouched — CORS is a browser control, and every
// function keeps its own auth (verify_jwt, service-role checks, signatures).
//
// Allowed origins:
//   • http://localhost:3000             — `npm run web` (dev)
//   • https://mamiya-theater.vercel.app — production (default; works with no secrets)
//   • FRONTEND_URL                      — the canonical domain, if configured
//   • ALLOWED_ORIGINS                   — comma-separated extras, e.g. a staging
//     domain. An entry may contain `*` (one DNS label of [a-z0-9-]) to cover
//     Vercel preview deploys, e.g.
//       supabase secrets set ALLOWED_ORIGINS='https://mamiya-theater-*-<team-slug>.vercel.app'
//
// Wildcard entries are honoured for CORS only. TRUSTED_ORIGINS (exact entries)
// is what stripe-create-checkout may use as a payment return URL, so a pattern
// can never turn that into an open redirect.
// ─────────────────────────────────────────────────────────────────────────

export const DEV_ORIGIN = "http://localhost:3000";
export const PRODUCTION_ORIGIN = "https://mamiya-theater.vercel.app";

// Strip trailing slashes / whitespace so allow-list comparisons are exact.
export function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

const configured = [
  Deno.env.get("FRONTEND_URL") ?? "",
  ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(","),
].map(normalizeOrigin).filter(Boolean);

export const TRUSTED_ORIGINS = new Set([
  DEV_ORIGIN,
  PRODUCTION_ORIGIN,
  ...configured.filter((o) => !o.includes("*")),
]);

const ORIGIN_PATTERNS = configured
  .filter((o) => o.includes("*"))
  .map((p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+") + "$"));

export function isAllowedOrigin(origin: string): boolean {
  const o = normalizeOrigin(origin);
  return TRUSTED_ORIGINS.has(o) || ORIGIN_PATTERNS.some((re) => re.test(o));
}

const ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

function corsHeadersFor(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

type Handler = (req: Request) => Response | Promise<Response>;

// Wraps a Deno.serve handler: answers the preflight, refuses disallowed browser
// origins, and stamps the CORS headers onto whatever the handler returns.
export function withCors(handler: Handler): Handler {
  return async (req: Request) => {
    const origin = req.headers.get("origin");
    if (origin && !isAllowedOrigin(origin)) {
      console.warn(`CORS: refused origin ${origin.slice(0, 100)}`);
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", Vary: "Origin" },
      });
    }
    const cors: Record<string, string> = origin ? corsHeadersFor(origin) : { Vary: "Origin" };
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: cors });
    }
    const res = await handler(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
