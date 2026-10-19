// Deno test for the shared origin allow-list (not run by Jest).
//   cd supabase/functions && npx -y deno test --no-config --allow-env _shared/cors_test.ts
Deno.env.set("FRONTEND_URL", "https://tickets.example.org/");
Deno.env.set("ALLOWED_ORIGINS", "https://staging.example.org, https://mamiya-theater-*-team.vercel.app");

const { withCors, isAllowedOrigin, TRUSTED_ORIGINS } = await import("./cors.ts");

function assertEquals(actual: unknown, expected: unknown, msg = "") {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

const handler = withCors(() => new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }));
const call = (origin: string | null, method = "POST") =>
  handler(new Request("https://fn.example/x", { method, headers: origin ? { origin } : {} }));

Deno.test("allow-list: defaults, FRONTEND_URL, exact + wildcard ALLOWED_ORIGINS", () => {
  for (const o of ["http://localhost:3000", "https://mamiya-theater.vercel.app", "https://tickets.example.org",
    "https://staging.example.org", "https://mamiya-theater-git-main-team.vercel.app", "https://MAMIYA-THEATER.vercel.app/"]) {
    assertEquals(isAllowedOrigin(o), true, o);
  }
  for (const o of ["https://evil.example", "https://mamiya-theater.vercel.app.evil.example", "null",
    "https://mamiya-theater-x.evil-team.vercel.app", "https://a.b-team.vercel.app", "http://mamiya-theater.vercel.app"]) {
    assertEquals(isAllowedOrigin(o), false, o);
  }
});

Deno.test("wildcards never become trusted return URLs", () => {
  assertEquals([...TRUSTED_ORIGINS].some((o) => o.includes("*")), false, "pattern in TRUSTED_ORIGINS");
  assertEquals(TRUSTED_ORIGINS.has("https://tickets.example.org"), true, "FRONTEND_URL trusted");
});

Deno.test("allowed origin is echoed, never *", async () => {
  const res = await call("https://mamiya-theater.vercel.app");
  assertEquals(res.status, 200, "status");
  assertEquals(res.headers.get("access-control-allow-origin"), "https://mamiya-theater.vercel.app", "ACAO");
  assertEquals(res.headers.get("vary"), "Origin", "vary");
  assertEquals(res.headers.get("content-type"), "application/json", "handler headers kept");
  assertEquals((await res.json()).ok, true, "body");
});

Deno.test("preflight from an allowed origin", async () => {
  const res = await call("http://localhost:3000", "OPTIONS");
  assertEquals(res.status, 200, "status");
  assertEquals(res.headers.get("access-control-allow-methods"), "POST, OPTIONS", "methods");
});

Deno.test("disallowed browser origin is refused before the handler runs", async () => {
  let ran = false;
  const h = withCors(() => { ran = true; return new Response("x"); });
  const res = await h(new Request("https://fn.example/x", { method: "POST", headers: { origin: "https://evil.example" } }));
  assertEquals(res.status, 403, "status");
  assertEquals(res.headers.get("access-control-allow-origin"), null, "no ACAO");
  assertEquals(ran, false, "handler ran");
  const pre = await call("https://evil.example", "OPTIONS");
  assertEquals(pre.status, 403, "preflight status");
});

Deno.test("server-to-server (no Origin) passes through without CORS headers", async () => {
  const res = await call(null);
  assertEquals(res.status, 200, "status");
  assertEquals(res.headers.get("access-control-allow-origin"), null, "no ACAO");
});
