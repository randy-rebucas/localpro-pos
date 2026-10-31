process.env.JWT_SECRET = 'test-secret-for-customer-otp-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// In-memory fake of the CustomerOTP collection (single tenant/phone)
// ---------------------------------------------------------------------------

interface FakeOtp {
  _id: string;
  tenantId: string;
  phone: string;
  otpHash: string;
  verified: boolean;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

let store: FakeOtp[] = [];

const mockOtpCreate = vi.fn();
const mockOtpDeleteOne = vi.fn();
const mockOtpFindOneAndUpdate = vi.fn();
// Returns undefined by default (use the in-memory fake); override per test.
const mockOtpFindOneOverride = vi.fn();

function matches(doc: FakeOtp, filter: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    const val = (doc as unknown as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const ops = v as Record<string, unknown>;
      if ('$lt' in ops && !((val as number) < (ops.$lt as number))) return false;
      if ('$gt' in ops && !((val as Date) > (ops.$gt as Date))) return false;
      if ('$gte' in ops && !((val as Date) >= (ops.$gte as Date))) return false;
      continue;
    }
    if (String(val) !== String(v)) return false;
  }
  return true;
}

vi.mock('@/models/CustomerOTP', async () => {
  const actual = await vi.importActual<typeof import('@/models/CustomerOTP')>('@/models/CustomerOTP');
  return {
    ...actual,
    default: {
      findOne: (filter: Record<string, unknown>) => mockOtpFindOneOverride(filter) ?? ({
        sort: () => ({
          lean: vi.fn().mockResolvedValue(
            store
              .filter((d) => matches(d, filter))
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .map((d) => ({ ...d }))[0] ?? null
          ),
        }),
      }),
      findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
        mockOtpFindOneAndUpdate(filter, update);
        const doc = store.find((d) => matches(d, filter));
        if (doc) {
          if (update.$inc) doc.attempts += update.$inc.attempts as number;
          if (update.$set) Object.assign(doc, update.$set);
        }
        return { lean: vi.fn().mockResolvedValue(doc ? { ...doc } : null) };
      },
      deleteOne: (filter: Record<string, unknown>) => {
        mockOtpDeleteOne(filter);
        store = store.filter((d) => !matches(d, filter));
        return Promise.resolve({ deletedCount: 1 });
      },
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
      create: (doc: Omit<FakeOtp, '_id' | 'createdAt'>) => {
        mockOtpCreate(doc);
        return Promise.resolve(doc);
      },
    },
  };
});

const { TENANT_ID, PHONE } = vi.hoisted(() => ({ TENANT_ID: 'tenant-1', PHONE: '09171234567' }));

vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: () => ({ lean: vi.fn().mockResolvedValue({ _id: TENANT_ID, slug: 'default', isActive: true }) }),
  },
}));

vi.mock('@/models/Customer', () => ({
  default: {
    findOne: vi.fn().mockResolvedValue({
      _id: 'cust-1', firstName: 'A', lastName: 'B', phone: PHONE, isActive: true, save: vi.fn(),
    }),
    create: vi.fn(),
  },
}));

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_k: string, fallback: string) => fallback),
}));
vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: vi.fn() }));
vi.mock('@/lib/auth-customer', () => ({ generateCustomerToken: vi.fn().mockReturnValue('customer-jwt') }));
vi.mock('@/lib/notifications', () => ({ sendSMS: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { POST as verifyOtp } from '@/app/api/auth/customer/verify-otp/route';
import { hashOtp, otpMatches, MAX_OTP_ATTEMPTS } from '@/models/CustomerOTP';

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/auth/customer/verify-otp'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function seedOtp(code: string, attempts = 0) {
  store = [{
    _id: 'otp-1',
    tenantId: TENANT_ID,
    phone: PHONE,
    otpHash: hashOtp(code),
    verified: false,
    attempts,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: new Date(),
  }];
}

beforeEach(() => {
  vi.clearAllMocks();
  store = [];
});

describe('OTP hashing helpers', () => {
  it('hashOtp produces a keyed HMAC-SHA256 digest, not the code', () => {
    const h = hashOtp('123456');
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || '';
    expect(h).toBe(crypto.createHmac('sha256', secret).update('123456').digest('hex'));
    expect(h).not.toBe(crypto.createHash('sha256').update('123456').digest('hex'));
    expect(h).not.toContain('123456');
  });

  it('otpMatches compares correctly and rejects malformed hashes', () => {
    expect(otpMatches('123456', hashOtp('123456'))).toBe(true);
    expect(otpMatches('654321', hashOtp('123456'))).toBe(false);
    expect(otpMatches('123456', '123456')).toBe(false);
  });
});

describe('POST /api/auth/customer/send-otp', () => {
  it('stores only the hash of the generated code', async () => {
    // send-otp awaits findOne() directly for its 1-per-minute check
    mockOtpFindOneOverride.mockReturnValueOnce(Promise.resolve(null));
    const { POST: sendOtp } = await import('@/app/api/auth/customer/send-otp/route');
    const r = new NextRequest(new URL('http://localhost/api/auth/customer/send-otp'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: PHONE }),
    });
    const res = await sendOtp(r);
    expect(res.status).toBe(200);
    expect(mockOtpCreate).toHaveBeenCalledTimes(1);
    const saved = mockOtpCreate.mock.calls[0][0];
    expect(saved).not.toHaveProperty('otp');
    expect(saved.otpHash).toMatch(/^[0-9a-f]{64}$/);

    const { sendSMS } = await import('@/lib/notifications');
    const message = (sendSMS as unknown as { mock: { calls: Array<[{ message: string }]> } }).mock.calls[0][0].message;
    const code = /(\d{6})/.exec(message)![1];
    expect(saved.otpHash).toBe(hashOtp(code));
  });
});

describe('POST /api/auth/customer/verify-otp', () => {
  it('increments attempts on a wrong code and rejects', async () => {
    seedOtp('123456');
    const res = await verifyOtp(req({ phone: PHONE, otp: '000000' }));
    expect(res.status).toBe(401);
    expect(store[0].attempts).toBe(1);
    expect(store[0].verified).toBe(false);
    // the $inc is guarded so it can never exceed the max
    expect(mockOtpFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: { $lt: MAX_OTP_ATTEMPTS }, tenantId: TENANT_ID }),
      { $inc: { attempts: 1 } }
    );
  });

  it('locks out after 5 wrong guesses, even if the correct code is then supplied', async () => {
    seedOtp('123456');
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      const res = await verifyOtp(req({ phone: PHONE, otp: '000000' }));
      expect(res.status).toBe(401);
    }
    // OTP invalidated after the last allowed attempt
    expect(store).toHaveLength(0);
    expect(mockOtpDeleteOne).toHaveBeenCalled();

    const res = await verifyOtp(req({ phone: PHONE, otp: '123456' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('rejects with 429 and deletes an OTP that already reached max attempts', async () => {
    seedOtp('123456', MAX_OTP_ATTEMPTS);
    const res = await verifyOtp(req({ phone: PHONE, otp: '123456' }));
    expect(res.status).toBe(429);
    expect(store).toHaveLength(0);
  });

  it('accepts the correct code and marks it verified (single use)', async () => {
    seedOtp('123456', 2);
    const res = await verifyOtp(req({ phone: PHONE, otp: '123456' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(store[0].verified).toBe(true);
    expect(res.cookies.get('customer-auth-token')?.value).toBe('customer-jwt');

    const again = await verifyOtp(req({ phone: PHONE, otp: '123456' }));
    expect(again.status).toBe(401);
  });

  it('returns 401 when there is no outstanding OTP', async () => {
    const res = await verifyOtp(req({ phone: PHONE, otp: '123456' }));
    expect(res.status).toBe(401);
  });
});
