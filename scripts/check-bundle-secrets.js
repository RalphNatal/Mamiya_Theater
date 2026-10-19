#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Fails the build if a secret ever reaches the browser bundle.
//
// Runs after webpack in `npm run build` (so a bad Vercel deploy fails instead
// of shipping). The ONLY Supabase key allowed in dist/ is the publishable /
// anon key; Stripe, PayPal, Resend and Turnstile secrets live solely in the
// Edge Function env. Scans every text file under dist/ for:
//   • a Supabase service-role key — the literal "service_role", a JWT whose
//     payload role isn't "anon", or a new-style sb_secret_… key
//   • Stripe secret / restricted keys (sk_ / rk_) and webhook secrets (whsec_)
//   • Resend API keys (re_…), PEM private keys
//   • the exact VALUE of any secret-looking variable in the build environment
//     (…SECRET…, …SERVICE_ROLE…, …PRIVATE…, …PASSWORD…, …_TOKEN, …API_KEY) —
//     catches a secret wired into DefinePlugin by mistake, whatever its shape.
//
//   node scripts/check-bundle-secrets.js [distDir]
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const PATTERNS = [
  { name: 'Supabase service_role reference', re: /\bservice_role\b/ },
  { name: 'Supabase secret key (sb_secret_)', re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'Stripe secret key', re: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}/ },
  { name: 'Stripe restricted key', re: /\brk_(?:live|test)_[A-Za-z0-9]{10,}/ },
  { name: 'Stripe webhook secret', re: /\bwhsec_[A-Za-z0-9]{10,}/ },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{12,}/ },
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const SECRET_ENV = /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|_TOKEN$|API_KEY$)/i;

// JWTs (legacy anon / service_role keys are JWTs): only role "anon" may ship.
function jwtFindings(text) {
  const out = [];
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload && payload.role && payload.role !== 'anon') {
        out.push({ name: `JWT with role "${payload.role}"`, sample: m[0] });
      }
    } catch { /* not a JWT payload */ }
  }
  return out;
}

function scan(text, env = {}) {
  const findings = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) findings.push({ name: p.name, sample: m[0] });
  }
  findings.push(...jwtFindings(text));
  for (const [key, value] of Object.entries(env)) {
    if (SECRET_ENV.test(key) && typeof value === 'string' && value.length >= 12 && text.includes(value)) {
      findings.push({ name: `value of $${key}`, sample: value });
    }
  }
  return findings;
}

// Never print a whole secret into CI logs.
const redact = (s) => (s.length <= 12 ? s : `${s.slice(0, 8)}…(${s.length} chars)`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function main() {
  const dist = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
  if (!fs.existsSync(dist)) {
    console.error(`check-bundle-secrets: ${dist} does not exist — run the build first.`);
    process.exit(1);
  }
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const files = walk(dist).filter((f) => /\.(js|mjs|cjs|html|map|json|txt|css)$/i.test(f));
  let bad = 0;
  for (const f of files) {
    for (const hit of scan(fs.readFileSync(f, 'utf8'), process.env)) {
      bad++;
      console.error(`✗ ${path.relative(dist, f)}: ${hit.name} — ${redact(hit.sample)}`);
    }
  }
  if (bad) {
    console.error(`\ncheck-bundle-secrets: ${bad} secret(s) found in the browser bundle. Build FAILED.`);
    console.error('Only the publishable / anon Supabase key may be bundled; keep every other key in Edge Function secrets.');
    process.exit(1);
  }
  console.log(`check-bundle-secrets: ${files.length} file(s) clean — only publishable keys in dist/.`);
}

if (require.main === module) main();
module.exports = { scan };
