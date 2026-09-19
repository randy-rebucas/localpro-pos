// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-error-handler-tests-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi } from 'vitest';
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
