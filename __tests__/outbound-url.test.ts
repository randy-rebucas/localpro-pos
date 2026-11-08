import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLookup = vi.fn();
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => mockLookup(...args),
  default: { lookup: (...args: unknown[]) => mockLookup(...args) },
}));

import { assertPublicHttpUrl, isNonPublicAddress, safeFetch, UnsafeOutboundUrlError } from '@/lib/net/outbound-url';

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1',
  ])('blocks %s', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('rejects non-http protocols, credentials and localhost', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
    await expect(assertPublicHttpUrl('https://user:pass@shop.example.com')).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
    await expect(assertPublicHttpUrl('https://localhost:8080')).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
  });

  it('rejects private IP literals without a DNS lookup', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('public address');
    await expect(assertPublicHttpUrl('https://[::1]/')).rejects.toThrow('public address');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('rejects hostnames that resolve to any private address', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]);
    await expect(assertPublicHttpUrl('https://rebind.example.com')).rejects.toThrow('public address');
  });

  it('accepts hostnames that resolve only to public addresses', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const url = await assertPublicHttpUrl('https://shop.example.com/wp');
    expect(url.hostname).toBe('shop.example.com');
  });

  describe('in production', () => {
    const original = process.env.NODE_ENV;
    beforeEach(() => {
      (process.env as Record<string, string>).NODE_ENV = 'production';
    });
    afterEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = original;
    });

    it('requires https', async () => {
      await expect(assertPublicHttpUrl('http://8.8.8.8/')).rejects.toThrow('https');
    });

    it('ignores OUTBOUND_ALLOW_PRIVATE', async () => {
      process.env.OUTBOUND_ALLOW_PRIVATE = 'true';
      try {
        await expect(assertPublicHttpUrl('https://10.0.0.1/')).rejects.toThrow('public address');
      } finally {
        delete process.env.OUTBOUND_ALLOW_PRIVATE;
      }
    });
  });
});

describe('safeFetch', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    mockLookup.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a redirect to an internal address', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));

    await expect(safeFetch('https://8.8.8.8/push', { method: 'POST', body: '{}' })).rejects.toThrow('public address');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('follows a redirect to a public address', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://1.1.1.1/new' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const res = await safeFetch('https://8.8.8.8/old', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toBe('https://1.1.1.1/new');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'GET' });
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  });
});
