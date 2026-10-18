/**
 * Pins the HTTP security headers in vercel.json (the production host). A
 * header silently dropped or loosened here is a regression on a live payment
 * site, so every guarantee below is asserted explicitly. See
 * docs/security-hardening.md for how the CSP was derived and how to flip it
 * from report-only to enforcing.
 */
import fs from 'fs';
import path from 'path';

type Header = { key: string; value: string };
const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const allRoutes = (vercel.headers as { source: string; headers: Header[] }[]).find(h => h.source === '/(.*)');
const header = (key: string) => allRoutes?.headers.find(h => h.key.toLowerCase() === key.toLowerCase())?.value;

// "script-src a b c" → ['a','b','c'] for one directive of a policy string.
const directive = (policy: string, name: string) =>
  (policy.split(';').map(d => d.trim().split(/\s+/)).find(([n]) => n === name) ?? []).slice(1);

describe('vercel.json security headers', () => {
  it('applies one header block to every route', () => {
    expect(allRoutes).toBeDefined();
  });

  it('forces HTTPS for two years, subdomains included', () => {
    expect(header('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload');
  });

  it('blocks clickjacking with BOTH X-Frame-Options and an ENFORCED frame-ancestors', () => {
    expect(header('X-Frame-Options')).toBe('DENY');
    // Enforced now, independent of the report-only rollout of the full policy.
    const enforced = header('Content-Security-Policy') ?? '';
    expect(directive(enforced, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(enforced, 'object-src')).toEqual(["'none'"]);
    expect(directive(enforced, 'base-uri')).toEqual(["'self'"]);
  });

  it('sets nosniff and a strict referrer policy', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('keeps the camera for the admin QR scanner (self only) and disables unused features', () => {
    const pp = header('Permissions-Policy') ?? '';
    expect(pp).toContain('camera=(self)');
    for (const off of ['microphone=()', 'geolocation=()', 'usb=()', 'display-capture=()']) {
      expect(pp).toContain(off);
    }
  });

  describe('full CSP', () => {
    // Whichever header currently carries the full policy (report-only during
    // rollout, enforcing after) must keep these properties.
    const full = header('Content-Security-Policy-Report-Only')
      ?? header('Content-Security-Policy') ?? '';

    it('allows no inline / eval script (one pinned PayPal SDK hash only)', () => {
      const script = directive(full, 'script-src');
      expect(script).toContain("'self'");
      expect(script).not.toContain("'unsafe-inline'");
      expect(script).not.toContain("'unsafe-eval'");
      expect(script.filter(s => s.startsWith("'sha256-"))).toHaveLength(1);
      expect(script.some(s => s === '*' || s === 'https:')).toBe(false);
    });

    it('covers the app’s real third parties and nothing broader', () => {
      expect(directive(full, 'connect-src')).toEqual(expect.arrayContaining([
        'https://amwzkqlhskicfbuikzpl.supabase.co', 'wss://amwzkqlhskicfbuikzpl.supabase.co',
      ]));
      expect(directive(full, 'frame-src')).toEqual(expect.arrayContaining([
        'https://www.youtube-nocookie.com', 'https://*.paypal.com',
      ]));
      expect(directive(full, 'script-src')).toEqual(expect.arrayContaining(['https://*.paypal.com']));
      expect(directive(full, 'style-src')).toEqual(expect.arrayContaining(['https://fonts.googleapis.com']));
      expect(directive(full, 'font-src')).toEqual(expect.arrayContaining(['https://fonts.gstatic.com']));
      expect(directive(full, 'default-src')).toEqual(["'self'"]);
      expect(directive(full, 'object-src')).toEqual(["'none'"]);
      expect(directive(full, 'frame-ancestors')).toEqual(["'none'"]);
    });

    it('reports violations to the csp-report function', () => {
      expect(directive(full, 'report-uri')).toEqual(['https://amwzkqlhskicfbuikzpl.supabase.co/functions/v1/csp-report']);
      expect(directive(full, 'report-to')).toEqual(['csp']);
      expect(header('Reporting-Endpoints')).toBe('csp="https://amwzkqlhskicfbuikzpl.supabase.co/functions/v1/csp-report"');
    });
  });
});
