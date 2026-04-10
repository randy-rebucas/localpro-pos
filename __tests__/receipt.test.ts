process.env.JWT_SECRET = 'test-secret-32chars!!';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted stubs — must be before any vi.mock calls
// ---------------------------------------------------------------------------

const { mockFindOneAndUpdate } = vi.hoisted(() => ({
  mockFindOneAndUpdate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

/**
 * Mock only what lib/receipt.ts needs from mongoose:
 *   - mongoose.Schema (class)
 *   - mongoose.models  (registry — pre-populated with Counter)
 *   - mongoose.model   (factory — returns our Counter stub)
 *
 * Avoid spreading the real mongoose module because it pulls in native bindings
 * (kerberos, etc.) that can time out in the test environment.
 */
vi.mock('mongoose', () => {
  class MockSchema {
    constructor(_def: unknown) {}
    // lib/receipt.ts calls CounterSchema.index(...) — must not throw
    index() { return this; }
  }

  const CounterStub = { findOneAndUpdate: mockFindOneAndUpdate };

  return {
    default: {
      Schema: MockSchema,
      models: { Counter: CounterStub },
      model: vi.fn().mockReturnValue(CounterStub),
    },
    Schema: MockSchema,
    models: { Counter: CounterStub },
    model: vi.fn().mockReturnValue(CounterStub),
  };
});

// ---------------------------------------------------------------------------
// generateReceiptNumber
// ---------------------------------------------------------------------------

describe('generateReceiptNumber', () => {
  let generateReceiptNumber: typeof import('@/lib/receipt').generateReceiptNumber;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFindOneAndUpdate.mockResolvedValue({ seq: 1 });
    ({ generateReceiptNumber } = await import('@/lib/receipt'));
  });

  it('returns a string matching REC-YYYYMMDD-XXXXX format', async () => {
    const result = await generateReceiptNumber('tenant-1');
    expect(result).toMatch(/^REC-\d{8}-\d{5}$/);
  });

  it('zero-pads sequence number to 5 digits', async () => {
    mockFindOneAndUpdate.mockResolvedValue({ seq: 7 });
    const result = await generateReceiptNumber('tenant-1');
    expect(result).toMatch(/^REC-\d{8}-00007$/);
  });

  it('handles sequence numbers at boundary (99999)', async () => {
    mockFindOneAndUpdate.mockResolvedValue({ seq: 99999 });
    const result = await generateReceiptNumber('tenant-1');
    expect(result).toMatch(/^REC-\d{8}-99999$/);
  });

  it("includes today's date in the receipt number", async () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const result = await generateReceiptNumber('tenant-1');
    expect(result).toContain(`REC-${today}`);
  });

  it('calls findOneAndUpdate with upsert:true for atomic sequence', async () => {
    await generateReceiptNumber('tenant-abc');
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.stringContaining('tenant-abc') }),
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
  });

  it('uses a unique counter key per tenantId', async () => {
    await generateReceiptNumber('tenant-A');
    await generateReceiptNumber('tenant-B');
    const calls = mockFindOneAndUpdate.mock.calls;
    const keyA = calls[0][0]._id as string;
    const keyB = calls[1][0]._id as string;
    expect(keyA).toContain('tenant-A');
    expect(keyB).toContain('tenant-B');
    expect(keyA).not.toBe(keyB);
  });
});

// ---------------------------------------------------------------------------
// generateInvoiceNumber
// ---------------------------------------------------------------------------

describe('generateInvoiceNumber', () => {
  let generateInvoiceNumber: typeof import('@/lib/receipt').generateInvoiceNumber;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFindOneAndUpdate.mockResolvedValue({ seq: 1 });
    ({ generateInvoiceNumber } = await import('@/lib/receipt'));
  });

  it('returns a string matching INV-YYYYMMDD-XXXXX format', async () => {
    const result = await generateInvoiceNumber('tenant-1');
    expect(result).toMatch(/^INV-\d{8}-\d{5}$/);
  });

  it('zero-pads sequence to 5 digits', async () => {
    mockFindOneAndUpdate.mockResolvedValue({ seq: 42 });
    const result = await generateInvoiceNumber('tenant-1');
    expect(result).toMatch(/^INV-\d{8}-00042$/);
  });

  it('uses INV prefix, not REC', async () => {
    const result = await generateInvoiceNumber('tenant-1');
    expect(result.startsWith('INV-')).toBe(true);
  });
});
