/**
 * Client half of the abuse controls (docs/security-hardening.md §3):
 * CAPTCHA is OFF unless a Turnstile site key is built in (so nothing blocks a
 * form until the backend secret is also configured), and the visitor sees the
 * server's own rate-limit / validation message instead of a generic error.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import TurnstileWidget from '../src/components/TurnstileWidget';
import { captchaPending, isCaptchaEnabled, TURNSTILE_SITE_KEY } from '../src/lib/turnstile';
import { readFunctionError, userFacingFunctionError } from '../src/lib/functionError';

const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  context: new Response(JSON.stringify(body), { status }),
});

describe('Turnstile off by default', () => {
  it('has no site key in tests / native builds', () => {
    expect(TURNSTILE_SITE_KEY).toBe('');
    expect(isCaptchaEnabled()).toBe(false);
    expect(captchaPending(null)).toBe(false); // forms never wait for a token
  });

  it('renders nothing when disabled', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<TurnstileWidget onToken={() => {}} />); });
    expect(tree!.toJSON()).toBeNull();
  });
});

describe('Edge Function error messages', () => {
  it('surfaces a 429 rate-limit message as-is', async () => {
    const err = httpError(429, { error: 'Too many sign-ups from your connection. Please wait a few minutes and try again.' });
    expect(await userFacingFunctionError(err)).toMatch(/Too many sign-ups/);
  });

  it('surfaces a 400 validation / CAPTCHA message', async () => {
    expect(await userFacingFunctionError(httpError(400, { error: 'Please complete the verification and try again.', code: 'captcha' })))
      .toBe('Please complete the verification and try again.');
  });

  it('keeps 5xx and network failures generic', async () => {
    expect(await userFacingFunctionError(httpError(500, { error: 'insert failed: duplicate key' }))).toBeNull();
    expect(await userFacingFunctionError(new Error('Failed to fetch'))).toBeNull();
    expect(await readFunctionError(httpError(502, 'not json'))).toEqual({ status: 502, message: null });
  });
});
