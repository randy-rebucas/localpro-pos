import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

describe('verifyCronAuth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadVerifyCronAuth() {
    const mod = await import('@/lib/automation-auth');
    return mod.verifyCronAuth;
  }

  function makeRequest(options: { authHeader?: string; url?: string } = {}) {
    const url = options.url || 'http://localhost:3000/api/automations/test';
    const headers: Record<string, string> = {};
    if (options.authHeader) {
      headers['authorization'] = options.authHeader;
    }
    return new NextRequest(url, { headers });
  }

  it('allows requests in development when CRON_SECRET is not set', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CRON_SECRET;
    const verifyCronAuth = await loadVerifyCronAuth();
    const result = verifyCronAuth(makeRequest(), null);
    expect(result).toBeNull(); // null = authorized
  });

  it('denies requests in production when CRON_SECRET is not set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CRON_SECRET;
    const verifyCronAuth = await loadVerifyCronAuth();
    const result = verifyCronAuth(makeRequest(), null);
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.success).toBe(false);
    expect(result!.status).toBe(503);
  });

  it('authorizes with correct Bearer token', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const verifyCronAuth = await loadVerifyCronAuth();
    const result = verifyCronAuth(
      makeRequest({ authHeader: 'Bearer my-secret' }),
      null
    );
    expect(result).toBeNull();
  });

  it('authorizes with correct provided secret', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const verifyCronAuth = await loadVerifyCronAuth();
    const result = verifyCronAuth(makeRequest(), 'my-secret');
    expect(result).toBeNull();
  });

  it('denies with wrong Bearer token and no provided secret', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const verifyCronAuth = await loadVerifyCronAuth();
    const result = verifyCronAuth(
      makeRequest({ authHeader: 'Bearer wrong' }),
      null
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('denies with wrong provided secret', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const verifyCronAuth = await loadVerifyCronAuth();
    const result = verifyCronAuth(makeRequest(), 'wrong-secret');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('denies when both auth methods fail', async () => {
    process.env.CRON_SECRET = 'my-secret';
    const verifyCronAuth = await loadVerifyCronAuth();
    const result = verifyCronAuth(
      makeRequest({ authHeader: 'Bearer wrong' }),
      'also-wrong'
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});
