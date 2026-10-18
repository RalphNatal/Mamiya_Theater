// Deno test for the form abuse controls (not run by Jest).
//   cd supabase/functions && npx -y deno test --no-config --allow-env _shared/abuse_test.ts
import { captchaOk, cleanText, clientIp, isRateLimited } from "./abuse.ts";

function eq(actual: unknown, expected: unknown, msg = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
const req = (h: Record<string, string>) => new Request("https://fn.example", { headers: h });

Deno.test("clientIp prefers cf-connecting-ip and rejects garbage", () => {
  eq(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4" })), "203.0.113.9", "cf first");
  eq(clientIp(req({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" })), "198.51.100.7", "first xff hop");
  eq(clientIp(req({ "x-forwarded-for": "2001:DB8::1" })), "2001:db8::1", "ipv6 lower-cased");
  eq(clientIp(req({ "x-forwarded-for": "<script>" })), null, "not ip-shaped");
  eq(clientIp(req({})), null, "absent");
});

Deno.test("cleanText strips control / bidi characters and enforces the cap", () => {
  eq(cleanText("  Ada\u0000 ‮Lovelace\r\nX  ", 50), "Ada Lovelace X", "single-line");
  eq(cleanText("Subject\nBcc: evil@example.com", 100), "Subject Bcc: evil@example.com", "no header newlines");
  eq(cleanText("line 1\r\n\r\n\r\n\r\nline 2\u0007", 50, { multiline: true }), "line 1\n\nline 2", "multiline");
  eq(cleanText("x".repeat(101), 100), null, "over cap → null");
  eq(cleanText(undefined, 10), "", "missing → empty");
});

Deno.test("captchaOk: open until a secret is configured, then verifies", async () => {
  Deno.env.delete("TURNSTILE_SECRET_KEY");
  eq(await captchaOk(undefined, null), true, "no secret");

  Deno.env.set("TURNSTILE_SECRET_KEY", "test-secret");
  const realFetch = globalThis.fetch;
  let sent: FormData | null = null;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    sent = init.body as FormData;
    const ok = (init.body as FormData).get("response") === "good-token";
    return Promise.resolve(new Response(JSON.stringify({ success: ok, "error-codes": ok ? [] : ["invalid-input-response"] })));
  }) as typeof fetch;
  try {
    eq(await captchaOk(undefined, null), false, "missing token");
    eq(await captchaOk("bad-token", "1.2.3.4"), false, "rejected token");
    eq(await captchaOk("good-token", "1.2.3.4"), true, "accepted token");
    eq((sent as FormData | null)?.get("remoteip"), "1.2.3.4", "remoteip forwarded");
    globalThis.fetch = (() => Promise.reject(new Error("down"))) as typeof fetch;
    eq(await captchaOk("good-token", null), false, "verification outage fails closed");
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("TURNSTILE_SECRET_KEY");
  }
});

Deno.test("isRateLimited: limited when any window refuses; fails open on RPC error", async () => {
  const calls: string[] = [];
  const admin = (answers: Record<string, unknown>, error: unknown = null) => ({
    rpc: (_fn: string, args: Record<string, unknown>) => {
      calls.push(String(args.p_bucket));
      return Promise.resolve({ data: answers[String(args.p_bucket)], error });
    },
  });
  const limits = [{ bucket: "a", windowSeconds: 600, max: 5 }, { bucket: "b", windowSeconds: 86400, max: 20 }];
  eq(await isRateLimited(admin({ a: true, b: true }), "1.2.3.4", limits), false, "both allow");
  eq(await isRateLimited(admin({ a: true, b: false }), "1.2.3.4", limits), true, "daily refuses");
  eq(await isRateLimited(admin({}, { message: "function does not exist" }), "1.2.3.4", limits), false, "rpc error → open");
  calls.length = 0;
  eq(await isRateLimited(admin({ a: false }), null, limits), false, "no ip → not limited");
  eq(calls.length, 0, "no rpc without an ip");
});
