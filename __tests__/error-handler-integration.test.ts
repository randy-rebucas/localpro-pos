// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-error-handler-tests-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { handleApiError } from '@/lib/error-handler';
import { ValidationException } from '@/lib/validation';

// Silence logger during these tests
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helper to parse a NextResponse produced by handleApiError
// ---------------------------------------------------------------------------
async function parseResponse(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = await response.json();
  return { status: response.status, body };
}

// ---------------------------------------------------------------------------
// ValidationException → 400 with errors array
// ---------------------------------------------------------------------------
describe('handleApiError — ValidationException', () => {
  it('returns 400 with field errors array for ValidationException', async () => {
    const error = new ValidationException([
      { field: 'email', message: 'Email is required' },
      { field: 'password', message: 'Password too short' },
    ]);

    const response = handleApiError(error);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.errors)).toBe(true);
    const errors = body.errors as Array<{ field: string; message: string }>;
    expect(errors).toHaveLength(2);
    expect(errors[0].field).toBe('email');
    expect(errors[1].field).toBe('password');
  });

  it('includes the errors array even for a single field error', async () => {
    const error = new ValidationException([{ field: 'name', message: 'Name is required' }]);
    const response = handleApiError(error);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    const errors = body.errors as Array<{ field: string; message: string }>;
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('name');
  });
});

// ---------------------------------------------------------------------------
// Prisma unique constraint violation (P2002) → 400 with DUPLICATE_KEY code
// ---------------------------------------------------------------------------
describe('handleApiError — Prisma unique constraint violation', () => {
  function makeP2002Error(target: string[]) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target },
    });
  }

  it('returns 400 with "email already exists" and DUPLICATE_KEY code', async () => {
    const response = handleApiError(makeP2002Error(['email']));
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('email already exists');
    expect(body.code).toBe('DUPLICATE_KEY');
  });

  it('uses the first key from the constraint target', async () => {
    const response = handleApiError(makeP2002Error(['slug']));
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('slug already exists');
    expect(body.code).toBe('DUPLICATE_KEY');
  });

  it('falls back to "field" when the target is absent', async () => {
    const response = handleApiError(makeP2002Error([]));
    const { status, body } = await parseResponse(response);

    expect(status).toBe(400);
    expect(body.error).toBe('field already exists');
    expect(body.code).toBe('DUPLICATE_KEY');
  });
});

// ---------------------------------------------------------------------------
// Prisma record-not-found (P2025) → 404
// ---------------------------------------------------------------------------
describe('handleApiError — Prisma record not found', () => {
  it('returns 404 with NOT_FOUND code', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '6.19.3',
    });

    const response = handleApiError(error);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Record not found');
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Unauthorized → 401
// ---------------------------------------------------------------------------
describe('handleApiError — Unauthorized', () => {
  it('returns 401 with UNAUTHORIZED code for "Unauthorized" message', async () => {
    const error = new Error('Unauthorized');

    const response = handleApiError(error);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
    expect(body.code).toBe('UNAUTHORIZED');
  });
});

// ---------------------------------------------------------------------------
// Forbidden → 403
// ---------------------------------------------------------------------------
describe('handleApiError — Forbidden', () => {
  it('returns 403 for "Forbidden" in message', async () => {
    const error = new Error('Forbidden: Insufficient permissions');

    const response = handleApiError(error);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 403 when message includes "permissions"', async () => {
    const error = new Error('User lacks the required permissions');

    const response = handleApiError(error);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// Custom statusCode on error object
// ---------------------------------------------------------------------------
describe('handleApiError — custom statusCode', () => {
  it('uses error.statusCode when provided', async () => {
    const error = Object.assign(new Error('Payment required'), { statusCode: 402 });

    const response = handleApiError(error);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(402);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Payment required');
  });
});

// ---------------------------------------------------------------------------
// Generic unknown error → 500
// ---------------------------------------------------------------------------
describe('handleApiError — generic / unknown error', () => {
  it('returns 500 for a plain Error without special fields', async () => {
    const error = new Error('Something went very wrong');

    const response = handleApiError(error);
    const { status, body } = await parseResponse(response);

    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Something went very wrong');
  });

  it('uses the defaultMessage when error.message is absent', async () => {
    // The error-handler reads error.message — pass an object with an empty
    // string so .includes() does not throw, simulating an object with no
    // useful message.
    const error = { message: '' };

    const response = handleApiError(error, 'Fallback message');
    const { status, body } = await parseResponse(response);

    expect(status).toBe(500);
    expect(body.success).toBe(false);
    // error.message is falsy (''), so the handler falls back to defaultMessage
    expect(body.error).toBe('Fallback message');
  });
});
