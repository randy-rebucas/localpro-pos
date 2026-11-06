import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from '@/lib/turnstile';

const fetchMock = vi.fn();
const respond = (body: unknown, ok = true, status = 200) => fetchMock.mockResolvedValue({ ok, status, json: async () => body });
const options = { action: 'login', onOutage: 'block' } as const;

describe('verifyTurnstile', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ['no keys', '', ''],
    ['only the secret, where no widget could render', 'secret', ''],
    ['only the site key', '', 'site'],
  ])('is not enforced with %s', async (_, secret, site) => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', secret);
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', site);
    await expect(verifyTurnstile(undefined, options)).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[undefined], [''], [42], ['x'.repeat(2049)]])('rejects an unusable token without calling Cloudflare', async (token) => {
    await expect(verifyTurnstile(token, options)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a valid token and sends the client IP', async () => {
    respond({ success: true, action: 'login' });
    await expect(verifyTurnstile('token', { ...options, ip: '203.0.113.9' })).resolves.toBe(true);
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('token');
    expect(body.get('remoteip')).toBe('203.0.113.9');
  });

  it('leaves out an unknown IP', async () => {
    respond({ success: true, action: 'login' });
    await verifyTurnstile('token', { ...options, ip: 'unknown' });
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).has('remoteip')).toBe(false);
  });

  it('rejects a token Cloudflare refuses, even when outages are allowed', async () => {
    respond({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    await expect(verifyTurnstile('token', { ...options, onOutage: 'allow' })).resolves.toBe(false);
  });

  it('rejects a token solved on another form', async () => {
    respond({ success: true, action: 'signup' });
    await expect(verifyTurnstile('token', { ...options, onOutage: 'allow' })).resolves.toBe(false);
  });

  it('rejects a token with no action unless it came from a test key', async () => {
    respond({ success: true });
    await expect(verifyTurnstile('token', options)).resolves.toBe(false);
    respond({ success: true, metadata: { result_with_testing_key: true } });
    await expect(verifyTurnstile('token', options)).resolves.toBe(true);
  });

  it.each([
    ['allow', true],
    ['block', false],
  ] as const)('follows onOutage=%s when Cloudflare is unreachable', async (onOutage, expected) => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(verifyTurnstile('token', { ...options, onOutage })).resolves.toBe(expected);
  });

  it('treats a Cloudflare server error as an outage', async () => {
    respond({}, false, 503);
    await expect(verifyTurnstile('token', { ...options, onOutage: 'allow' })).resolves.toBe(true);
    await expect(verifyTurnstile('token', options)).resolves.toBe(false);
  });
});
