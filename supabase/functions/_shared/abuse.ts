// ─────────────────────────────────────────────────────────────────────────
// ABUSE CONTROLS for the anonymous form endpoints (contact-message,
// newsletter-subscribe): per-IP rate limits, an optional CAPTCHA, and input
// clean-up. See docs/security-hardening.md §3.
//
//   • Rate limits — public.consume_rate_limit (service_role only, migration
//     20261018120000) keeps salted-hash counters per IP. If that RPC fails
//     (migration not applied yet, DB hiccup) we fail OPEN and log: a broken
//     limiter must never take the contact form down.
//   • CAPTCHA — Cloudflare Turnstile, enforced only once the
//     TURNSTILE_SECRET_KEY secret is set (so the frontend, which sends the
//     token once TURNSTILE_SITE_KEY is built in, can ship first).
// ─────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AdminClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

// The caller's IP as Supabase's edge sees it: Cloudflare's cf-connecting-ip
// (not client-settable), else the first X-Forwarded-For hop. null if absent
// or not IP-shaped.
export function clientIp(req: Request): string | null {
  const raw = req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0] ??
    req.headers.get("x-real-ip") ?? "";
  const ip = raw.trim().toLowerCase();
  return ip && ip.length <= 45 && /^[0-9a-f:.]+$/.test(ip) ? ip : null;
}

export type Limit = { bucket: string; windowSeconds: number; max: number };

// true when the caller is OVER any of the limits (each allowed call counts once
// against every limit).
export async function isRateLimited(admin: AdminClient, ip: string | null, limits: Limit[]): Promise<boolean> {
  if (!ip) return false;
  for (const l of limits) {
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_bucket: l.bucket,
      p_key: ip,
      p_window_seconds: l.windowSeconds,
      p_limit: l.max,
    });
    if (error) {
      console.error(`rate limit check failed for ${l.bucket} (allowing):`, error.message);
      return false;
    }
    if (data === false) return true;
  }
  return false;
}

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Verifies a Turnstile token. Returns true when CAPTCHA is not configured.
export async function captchaOk(token: unknown, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY, { method: "POST", body: form });
    const out = await res.json();
    if (!out?.success) console.warn("turnstile rejected:", JSON.stringify(out?.["error-codes"] ?? []));
    return out?.success === true;
  } catch (err) {
    // Cloudflare unreachable: refuse (the form says "try again"); a bot must
    // not get through just because verification is down.
    console.error("turnstile verify failed:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

// Trim, drop control characters (keeping newlines / tabs where allowed), and
// collapse runs of blank lines. Returns null when longer than max AFTER
// cleaning, so callers can reject instead of silently truncating.
export function cleanText(value: unknown, max: number, { multiline = false } = {}): string | null {
  let s = String(value ?? "").normalize("NFC");
  // deno-lint-ignore no-control-regex
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "") : s.replace(/[\u0000-\u001F\u007F]/g, " ");
  s = s.replace(/[​-‏‪-‮⁦-⁩]/g, ""); // zero-width / bidi overrides
  if (multiline) s = s.replace(/\n{3,}/g, "\n\n");
  else s = s.replace(/\s{2,}/g, " ");
  s = s.trim();
  return s.length > max ? null : s;
}
