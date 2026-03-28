/**
 * Section 27 — Rate Limiting
 * Tests: 27.1 – 27.4
 *
 * Strategy:
 *   - 27.1–27.3 test checkRateLimit() via vi.importActual (real sliding window logic).
 *   - 27.4 tests route-level 429 responses by mocking checkRateLimit to return blocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Top-level mocks needed for route imports ─────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { LOGIN: 'login', FAILED_LOGIN: 'failed_login', CREATE: 'create' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_k: string, fb: string) => fb),
}));
vi.mock('@/lib/validation', () => ({
  validateEmail: vi.fn().mockReturnValue(true),
  validatePassword: vi.fn().mockReturnValue({ isValid: true }),
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  generateToken: vi.fn().mockReturnValue('mock-token'),
  verifyToken: vi.fn(),
}));
vi.mock('@/models/User', () => ({
  default: { findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));
vi.mock('@/models/Subscription', () => ({
  default: { create: vi.fn() },
}));
vi.mock('@/models/SubscriptionPlan', () => ({
  default: { findOne: vi.fn() },
}));
// rate-limit is mocked for route-level tests; direct tests use importActual
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('10.0.0.1'),
}));

// ── Route-level imports ───────────────────────────────────────────────────────
import { checkRateLimit as mockCheckRateLimit } from '@/lib/rate-limit';

// ── Helper to create fake timers-aware real checkRateLimit ───────────────────
// The real function is imported fresh per describe block via vi.importActual.

const makeRequest = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 27.1  Login blocks after 10 attempts per 15-min window ──────────────────
describe('login rate limit: 10 per 15 min (27.1)', () => {
  let rl: (k: string, l: number, w: number) => { allowed: boolean; remaining: number; resetAfterMs: number };

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
    rl = actual.checkRateLimit;
  });

  it('allows the first 10 requests', () => {
    const k = `login:test:${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(rl(k, 10, 15 * 60 * 1000).allowed).toBe(true);
    }
  });

  it('blocks the 11th request', () => {
    const k = `login:block:${Math.random()}`;
    for (let i = 0; i < 10; i++) rl(k, 10, 15 * 60 * 1000);
    const result = rl(k, 10, 15 * 60 * 1000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('remaining decrements with each request', () => {
    const k = `login:rem:${Math.random()}`;
    const r1 = rl(k, 10, 15 * 60 * 1000);
    expect(r1.remaining).toBe(9); // 10 - 1
    const r2 = rl(k, 10, 15 * 60 * 1000);
    expect(r2.remaining).toBe(8);
  });

  it('resetAfterMs is positive when blocked', () => {
    const k = `login:reset:${Math.random()}`;
    for (let i = 0; i < 10; i++) rl(k, 10, 15 * 60 * 1000);
    const result = rl(k, 10, 15 * 60 * 1000);
    expect(result.resetAfterMs).toBeGreaterThan(0);
  });
});

// ── 27.2  Register blocks after 5 per hour ──────────────────────────────────
describe('register rate limit: 5 per hour (27.2)', () => {
  let rl: (k: string, l: number, w: number) => { allowed: boolean; remaining: number; resetAfterMs: number };

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
    rl = actual.checkRateLimit;
  });

  it('allows the first 5 requests', () => {
    const k = `register:test:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rl(k, 5, 60 * 60 * 1000).allowed).toBe(true);
    }
  });

  it('blocks the 6th request', () => {
    const k = `register:block:${Math.random()}`;
    for (let i = 0; i < 5; i++) rl(k, 5, 60 * 60 * 1000);
    const result = rl(k, 5, 60 * 60 * 1000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('remaining decrements correctly', () => {
    const k = `register:rem:${Math.random()}`;
    expect(rl(k, 5, 60 * 60 * 1000).remaining).toBe(4);
    expect(rl(k, 5, 60 * 60 * 1000).remaining).toBe(3);
  });
});

// ── 27.3  Rate limit resets after the window expires ────────────────────────
describe('rate limit resets after window expires (27.3)', () => {
  let rl: (k: string, l: number, w: number) => { allowed: boolean; remaining: number; resetAfterMs: number };

  beforeEach(async () => {
    vi.useFakeTimers();
    const actual = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit');
    rl = actual.checkRateLimit;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests allowed again after full window elapses', () => {
    const k = `reset:${Math.random()}`;
    const LIMIT = 3;
    const WINDOW = 60_000;

    for (let i = 0; i < LIMIT; i++) rl(k, LIMIT, WINDOW);
    expect(rl(k, LIMIT, WINDOW).allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW + 100);
    expect(rl(k, LIMIT, WINDOW).allowed).toBe(true);
  });

  it('sliding window: old timestamps fall off as time advances', () => {
    const k = `slide:${Math.random()}`;
    const LIMIT = 2;
    const WINDOW = 10_000;

    rl(k, LIMIT, WINDOW);           // t=0
    vi.advanceTimersByTime(5_000);   // t=5s
    rl(k, LIMIT, WINDOW);           // t=5s, now at limit
    expect(rl(k, LIMIT, WINDOW).allowed).toBe(false);

    vi.advanceTimersByTime(5_100);   // t=10.1s — first request (t=0) falls off
    expect(rl(k, LIMIT, WINDOW).allowed).toBe(true);
  });
});

// ── 27.4  Rate-limited response returns HTTP 429 ────────────────────────────
describe('rate-limited routes return 429 (27.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login route returns 429 when rate limit is exceeded', async () => {
    vi.mocked(mockCheckRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 60_000 });
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeRequest('/api/auth/login', { email: 'x@x.com', password: 'pass' }));
    expect(res.status).toBe(429);
  });

  it('register route returns 429 when rate limit is exceeded', async () => {
    vi.mocked(mockCheckRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 3600_000 });
    const { POST } = await import('@/app/api/auth/register/route');
    const res = await POST(makeRequest('/api/auth/register', {
      email: 'new@test.com', password: 'pass123', businessName: 'Biz',
    }));
    expect(res.status).toBe(429);
  });

  it('429 response includes Retry-After header', async () => {
    vi.mocked(mockCheckRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 30_000 });
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeRequest('/api/auth/login', { email: 'x@x.com', password: 'pass' }));
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});
