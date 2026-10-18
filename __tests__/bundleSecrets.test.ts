/**
 * The post-build secret scan (scripts/check-bundle-secrets.js) must catch every
 * kind of server secret, and must NOT flag what is meant to ship: the
 * publishable / anon Supabase key, the public PayPal client id, a Turnstile
 * site key.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { scan } = require('../scripts/check-bundle-secrets');

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role, exp: 2000000000 })}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;
const names = (text: string, env = {}) => scan(text, env).map((f: { name: string }) => f.name);

describe('check-bundle-secrets', () => {
  it('passes what is meant to ship', () => {
    const publicBundle = [
      'const SUPABASE_ANON_KEY = "sb_publishable_seBteIAFcchpUip_48uVcw_3BcLPIfx";',
      `const legacyAnon = "${jwt('anon')}";`,
      'const PAYPAL = "AWaH1YqBKfGHITAYxYPteEZgdCtOcsc9NCXRAVZPibXrmkvw8LuagoVFOJ22QNYJbVYLa_hEg1PwK3fo";',
      'const TURNSTILE = "0x4AAAAAAABkMYinukE8nzY";',
      'function mask_value(task_id){return disk_size}',
    ].join('\n');
    expect(names(publicBundle)).toEqual([]);
  });

  it.each([
    ['Supabase service_role reference', 'headers:{role:"service_role"}'],
    ['Supabase secret key (sb_secret_)', 'k="sb_secret_abcdefghijklmnop"'],
    ['Stripe secret key', 'k="sk_live_51Habcdefghijklmnop"'],
    ['Stripe restricted key', 'k="rk_test_51Habcdefghijklmnop"'],
    ['Stripe webhook secret', 'k="whsec_abcdefghijklmnop"'],
    ['Resend API key', 'k="re_123abc45_abcdefghijklmnopqr"'],
    ['PEM private key', '-----BEGIN PRIVATE KEY-----\nMIIE'],
  ])('flags a %s', (name, text) => {
    expect(names(text)).toContain(name);
  });

  it('flags a legacy service-role JWT by decoding its payload', () => {
    expect(names(`key="${jwt('service_role')}"`)).toEqual(expect.arrayContaining(['JWT with role "service_role"']));
  });

  it('flags the exact value of any secret-looking build env var, whatever its shape', () => {
    const env = { PAYPAL_SECRET: 'EJx9-not-a-known-pattern-123', TURNSTILE_SITE_KEY: 'public-site-key-value', SHORT_SECRET: 'abc' };
    const text = 'a="EJx9-not-a-known-pattern-123"; b="public-site-key-value"; c="abc"';
    expect(names(text, env)).toEqual(['value of $PAYPAL_SECRET']);
  });
});
