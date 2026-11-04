process.env.JWT_SECRET = 'test-secret-for-sales-routes-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: new Proxy({}, { get: (_target, key) => String(key) }),
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

vi.mock('@/lib/receipt', () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue('INV-1'),
}));

const mockRequireTenantAccess = vi.fn();
const mockGetTenantIdFromRequest = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
  getTenantIdFromRequest: (...args: unknown[]) => mockGetTenantIdFromRequest(...args),
}));

const mockGetCurrentUser = vi.fn();
const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: vi.fn().mockResolvedValue(true),
}));

const mockUpdateStock = vi.fn();
const mockInsertStockMovements = vi.fn();
vi.mock('@/lib/stock', () => ({
  STOCK_SNAPSHOT_FIELDS: 'stock',
  updateStock: (...args: unknown[]) => mockUpdateStock(...args),
  insertStockMovements: (...args: unknown[]) => mockInsertStockMovements(...args),
}));

const repos = {
  transactions: { findById: vi.fn() },
  customers: { findById: vi.fn() },
  tenants: { findById: vi.fn() },
  products: { list: vi.fn() },
  invoices: {
    listWithRefs: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findDetail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  payments: {
    listWithRefs: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    markRefunded: vi.fn(),
  },
  prescriptions: {
    list: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findLastNumber: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    dispenseItems: vi.fn(),
  },
  savedCarts: {
    listForUser: vi.fn(),
    findForUser: vi.fn(),
    create: vi.fn(),
    deactivate: vi.fn(),
  },
  stockMovements: { list: vi.fn(), listWithRefs: vi.fn(), count: vi.fn() },
  posSessions: { find: vi.fn(), update: vi.fn(), upsert: vi.fn() },
};

const TX = { driver: 'mongo' };
const mockRunInTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  getRepos: () => repos,
  runInTransaction: (fn: (tx: unknown) => Promise<unknown>) => mockRunInTransaction(fn),
  DuplicateKeyError: class DuplicateKeyError extends Error {},
  isDuplicateKeyError: () => false,
}));

import { GET as listInvoices, POST as createInvoice } from '@/app/api/invoices/route';
import { GET as getInvoice, PATCH as patchInvoice } from '@/app/api/invoices/[id]/route';
import { POST as invoiceFromTransaction } from '@/app/api/invoices/from-transaction/route';
import { GET as listPayments, POST as createPayment } from '@/app/api/payments/route';
import { POST as refundPayment } from '@/app/api/payments/[id]/refund/route';
import { GET as listPrescriptions, POST as createPrescription } from '@/app/api/prescriptions/route';
import { PUT as putPrescription, DELETE as deletePrescription } from '@/app/api/prescriptions/[id]/route';
import { POST as dispense } from '@/app/api/prescriptions/[id]/dispense/route';
import { GET as listCarts, POST as createCart } from '@/app/api/saved-carts/route';
import { GET as getCart, DELETE as deleteCart } from '@/app/api/saved-carts/[id]/route';
import { GET as getSession, POST as postSession } from '@/app/api/pos/session/[sessionId]/route';
import { GET as listMovements } from '@/app/api/stock-movements/route';
import { GET as realtime } from '@/app/api/inventory/realtime/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT = 'tenant-a';
const USER = { userId: 'user-1', tenantId: TENANT, role: 'owner' };

function req(url: string, method = 'GET', body?: unknown): NextRequest {
  const options: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { 'content-type': 'application/json' },
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const sessionParams = (sessionId: string) => ({ params: Promise.resolve({ sessionId }) });

function prescription(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'rx-1',
    status: 'pending',
    validUntil: new Date(Date.now() + 86_400_000),
    items: [
      { productId: 'prod-1', drugName: 'Amoxicillin', quantity: 2, dispensed: false },
      { drugName: 'Manual item', quantity: 1, dispensed: false },
    ],
    ...overrides,
  };
}

function dispensedPrescription() {
  const rx = prescription({ status: 'partially_dispensed' });
  rx.items[0].dispensed = true;
  return rx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT, user: USER });
  mockGetTenantIdFromRequest.mockResolvedValue(TENANT);
  mockGetCurrentUser.mockResolvedValue(USER);
  mockRequireAuth.mockResolvedValue(USER);
  mockRunInTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(TX));
  mockUpdateStock.mockResolvedValue(undefined);
  mockInsertStockMovements.mockResolvedValue(undefined);
  repos.tenants.findById.mockResolvedValue({ settings: {} });
  repos.products.list.mockResolvedValue([{ _id: 'prod-1', stock: 10, trackInventory: true }]);
  repos.prescriptions.findById.mockResolvedValue(prescription());
  repos.prescriptions.dispenseItems.mockResolvedValue(dispensedPrescription());
});

// ---------------------------------------------------------------------------
// Dispense
// ---------------------------------------------------------------------------

describe('POST /api/prescriptions/[id]/dispense', () => {
  const dispenseRequest = () => req('/api/prescriptions/rx-1/dispense', 'POST', { itemIndexes: [0] });

  it('returns 409 and writes no stock when dispenseItems finds a conflict', async () => {
    repos.prescriptions.dispenseItems.mockResolvedValue(null);

    const res = await dispense(dispenseRequest(), idParams('rx-1'));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: 'Prescription was already dispensed' });
    expect(mockUpdateStock).not.toHaveBeenCalled();
    expect(mockInsertStockMovements).not.toHaveBeenCalled();
  });

  it('claims the items in the transaction before touching stock', async () => {
    const res = await dispense(dispenseRequest(), idParams('rx-1'));

    expect(res.status).toBe(200);
    expect(repos.prescriptions.dispenseItems).toHaveBeenCalledWith(
      TENANT,
      'rx-1',
      [0],
      { by: USER.userId, at: expect.any(Date) },
      { tx: TX }
    );
    const [claimOrder] = repos.prescriptions.dispenseItems.mock.invocationCallOrder;
    const [stockOrder] = mockUpdateStock.mock.invocationCallOrder;
    expect(claimOrder).toBeLessThan(stockOrder);
    expect(mockUpdateStock).toHaveBeenCalledWith(
      'prod-1',
      TENANT,
      -2,
      'sale',
      expect.objectContaining({ userId: USER.userId, product: expect.objectContaining({ _id: 'prod-1' }) }),
      TX
    );
    expect(mockInsertStockMovements).toHaveBeenCalledWith(expect.any(Array), TX);
  });

  it('responds with the prescription returned from the transaction', async () => {
    const res = await dispense(dispenseRequest(), idParams('rx-1'));
    const body = await res.json();

    expect(body.data.status).toBe('partially_dispensed');
    expect(body.data.items[0].dispensed).toBe(true);
  });

  it('starts from an empty movement list on a transaction retry', async () => {
    mockUpdateStock.mockImplementation(async (...args: unknown[]) => {
      (args[4] as { movements: unknown[] }).movements.push({ productId: 'prod-1' });
    });
    const batches: number[] = [];
    mockInsertStockMovements.mockImplementation(async (movements: unknown[]) => {
      batches.push(movements.length);
    });
    mockRunInTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      await fn(TX);
      return fn(TX);
    });

    const res = await dispense(dispenseRequest(), idParams('rx-1'));

    expect(res.status).toBe(200);
    expect(batches).toEqual([1, 1]);
  });

  it('rethrows other transaction errors to the error handler', async () => {
    mockUpdateStock.mockRejectedValue(new Error('Insufficient stock'));

    const res = await dispense(dispenseRequest(), idParams('rx-1'));

    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(409);
  });

  it('marks an out-of-date prescription as expired and dispenses nothing', async () => {
    repos.prescriptions.findById.mockResolvedValue(prescription({ validUntil: new Date(Date.now() - 1000) }));

    const res = await dispense(dispenseRequest(), idParams('rx-1'));

    expect(res.status).toBe(409);
    expect(repos.prescriptions.update).toHaveBeenCalledWith(TENANT, 'rx-1', { status: 'expired' });
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('keeps the pre-check for an item that is already dispensed', async () => {
    repos.prescriptions.findById.mockResolvedValue(dispensedPrescription());

    const res = await dispense(dispenseRequest(), idParams('rx-1'));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Item at index 0 is already dispensed');
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

describe('POST /api/payments/[id]/refund', () => {
  const refundRequest = () => req('/api/payments/pay-1/refund', 'POST', { refundReason: 'Damaged' });

  beforeEach(() => {
    repos.payments.findById.mockResolvedValue({ _id: 'pay-1', transactionId: 'tx-1', status: 'completed' });
  });

  it('blocks the refund while the linked transaction is completed', async () => {
    repos.transactions.findById.mockResolvedValue({ _id: 'tx-1' });

    const res = await refundPayment(refundRequest(), idParams('pay-1'));

    expect(res.status).toBe(409);
    expect(repos.transactions.findById).toHaveBeenCalledWith(TENANT, 'tx-1', { select: '_id', status: 'completed' });
    expect(repos.payments.markRefunded).not.toHaveBeenCalled();
  });

  it('returns 409 when another request claimed the refund first', async () => {
    repos.transactions.findById.mockResolvedValue(null);
    repos.payments.markRefunded.mockResolvedValue(null);

    const res = await refundPayment(refundRequest(), idParams('pay-1'));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Payment already refunded');
  });

  it('responds with the claimed payment', async () => {
    repos.transactions.findById.mockResolvedValue(null);
    repos.payments.markRefunded.mockResolvedValue({ _id: 'pay-1', status: 'refunded', refundReason: 'Damaged' });

    const res = await refundPayment(refundRequest(), idParams('pay-1'));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ _id: 'pay-1', status: 'refunded', refundReason: 'Damaged' });
    expect(repos.payments.markRefunded).toHaveBeenCalledWith(TENANT, 'pay-1', {
      at: expect.any(Date),
      reason: 'Damaged',
    });
  });

  it('returns 400 for a payment already marked refunded', async () => {
    repos.payments.findById.mockResolvedValue({ _id: 'pay-1', transactionId: 'tx-1', status: 'refunded' });

    const res = await refundPayment(refundRequest(), idParams('pay-1'));

    expect(res.status).toBe(400);
    expect(repos.payments.markRefunded).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

describe('invoices', () => {
  it('PATCH to paid fills paidAt and defaults paidAmount to the total', async () => {
    repos.invoices.findById.mockResolvedValue({ _id: 'inv-1', status: 'sent', total: 150 });
    repos.invoices.update.mockResolvedValue({ after: { _id: 'inv-1', status: 'paid' }, before: {}, changed: ['status'] });

    const res = await patchInvoice(req('/api/invoices/inv-1', 'PATCH', { status: 'paid' }), idParams('inv-1'));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ _id: 'inv-1', status: 'paid' });
    expect(repos.invoices.update).toHaveBeenCalledWith(TENANT, 'inv-1', {
      status: 'paid',
      paidAt: expect.any(Date),
      paidAmount: 150,
    });
  });

  it('PATCH to paid keeps an explicit paidAmount', async () => {
    repos.invoices.findById.mockResolvedValue({ _id: 'inv-1', status: 'sent', total: 150 });
    repos.invoices.update.mockResolvedValue({ after: {}, before: {}, changed: [] });

    await patchInvoice(req('/api/invoices/inv-1', 'PATCH', { status: 'paid', paidAmount: 90 }), idParams('inv-1'));

    expect(repos.invoices.update.mock.calls[0][2].paidAmount).toBe(90);
  });

  it('PATCH ignores an unknown status and returns 404 for a missing invoice', async () => {
    repos.invoices.findById.mockResolvedValueOnce({ _id: 'inv-1', status: 'sent', total: 150 });
    repos.invoices.update.mockResolvedValue({ after: {}, before: {}, changed: [] });

    await patchInvoice(req('/api/invoices/inv-1', 'PATCH', { status: 'bogus', notes: 'x' }), idParams('inv-1'));
    expect(repos.invoices.update).toHaveBeenCalledWith(TENANT, 'inv-1', { notes: 'x' });

    repos.invoices.findById.mockResolvedValueOnce(null);
    const res = await patchInvoice(req('/api/invoices/nope', 'PATCH', {}), idParams('nope'));
    expect(res.status).toBe(404);
  });

  it('GET overdue overrides the status param', async () => {
    repos.invoices.listWithRefs.mockResolvedValue([]);
    repos.invoices.count.mockResolvedValue(0);

    await listInvoices(req('/api/invoices?overdue=true&status=paid&page=2&limit=10'));

    const filter = {
      notDisabled: true,
      status: ['sent', 'draft'],
      dueDate: { lt: expect.any(Date) },
    };
    expect(repos.invoices.listWithRefs).toHaveBeenCalledWith(TENANT, filter, { page: { skip: 10, limit: 10 } });
    expect(repos.invoices.count).toHaveBeenCalledWith(TENANT, filter);
  });

  it('POST returns 404 when the linked transaction is not in this tenant', async () => {
    repos.transactions.findById.mockResolvedValue(null);

    const res = await createInvoice(
      req('/api/invoices', 'POST', {
        transactionId: 'tx-1',
        items: [{ name: 'A' }],
        subtotal: 100,
        taxAmount: 12,
        total: 112,
        dueDate: '2030-01-01',
      })
    );

    expect(res.status).toBe(404);
    expect(repos.transactions.findById).toHaveBeenCalledWith(TENANT, 'tx-1', { select: '_id' });
    expect(repos.invoices.create).not.toHaveBeenCalled();
  });

  it('from-transaction copies the lines and passes customerInfo: null without a customer', async () => {
    repos.transactions.findById.mockResolvedValue({
      _id: 'tx-1',
      items: [{ product: 'prod-1', name: 'A', quantity: 2, price: 5, subtotal: 10 }],
      subtotal: 10,
      total: 10,
    });
    repos.invoices.create.mockResolvedValue({ _id: 'inv-1' });

    const res = await invoiceFromTransaction(req('/api/invoices/from-transaction', 'POST', { transactionId: 'tx-1' }));

    expect(res.status).toBe(201);
    expect(repos.invoices.create).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        invoiceNumber: 'INV-1',
        transactionId: 'tx-1',
        customerInfo: null,
        items: [{ name: 'A', description: '', quantity: 2, price: 5, subtotal: 10 }],
        taxAmount: 0,
        paymentTerms: 'Net 30',
        status: 'draft',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

describe('prescriptions', () => {
  it('POST numbers the prescription after the last one of the year', async () => {
    const year = new Date().getFullYear();
    repos.prescriptions.findLastNumber.mockResolvedValue(`RX-${year}-000041`);
    repos.prescriptions.create.mockResolvedValue({ _id: 'rx-1' });

    const res = await createPrescription(
      req('/api/prescriptions', 'POST', {
        patientName: 'P',
        doctorName: 'D',
        doctorPRCNumber: '123',
        issuedDate: '2026-01-01',
        validUntil: '2026-06-01',
        items: [{ drugName: 'A' }],
      })
    );

    expect(res.status).toBe(201);
    expect(repos.prescriptions.findLastNumber).toHaveBeenCalledWith(TENANT, year);
    expect(repos.prescriptions.create.mock.calls[0][1]).toMatchObject({
      prescriptionNumber: `RX-${year}-000042`,
      createdBy: USER.userId,
    });
  });

  it('PUT passes only the allowed keys and responds with result.after', async () => {
    repos.prescriptions.update.mockResolvedValue({ after: { _id: 'rx-1', notes: 'n' }, before: {}, changed: ['notes'] });

    const res = await putPrescription(
      req('/api/prescriptions/rx-1', 'PUT', { notes: 'n', status: 'dispensed' }),
      idParams('rx-1')
    );

    expect(res.status).toBe(200);
    expect(repos.prescriptions.update).toHaveBeenCalledWith(TENANT, 'rx-1', { notes: 'n' });
    expect((await res.json()).data).toEqual({ _id: 'rx-1', notes: 'n' });
  });

  it('PUT refuses a closed prescription', async () => {
    repos.prescriptions.findById.mockResolvedValue(prescription({ status: 'dispensed' }));

    const res = await putPrescription(req('/api/prescriptions/rx-1', 'PUT', { notes: 'n' }), idParams('rx-1'));

    expect(res.status).toBe(409);
    expect(repos.prescriptions.update).not.toHaveBeenCalled();
  });

  it('DELETE cancels, and returns 404 for a missing prescription', async () => {
    repos.prescriptions.update.mockResolvedValueOnce({ after: {}, before: {}, changed: ['status'] });
    const res = await deletePrescription(req('/api/prescriptions/rx-1', 'DELETE'), idParams('rx-1'));
    expect(res.status).toBe(200);
    expect(repos.prescriptions.update).toHaveBeenCalledWith(TENANT, 'rx-1', { status: 'cancelled' });

    repos.prescriptions.update.mockResolvedValueOnce(null);
    const missing = await deletePrescription(req('/api/prescriptions/nope', 'DELETE'), idParams('nope'));
    expect(missing.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POS sessions
// ---------------------------------------------------------------------------

describe('POST /api/pos/session/[sessionId]', () => {
  const post = (body: unknown) => postSession(req('/api/pos/session/s-1', 'POST', body), sessionParams('s-1'));

  it('returns 404 when init collides with another tenant’s session', async () => {
    repos.posSessions.upsert.mockResolvedValue(null);

    const res = await post({ tenant: 'shop', action: 'init', data: {} });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Session not found');
  });

  it('returns 404 when update-cart collides with another tenant’s session', async () => {
    repos.posSessions.upsert.mockResolvedValue(null);

    const res = await post({ tenant: 'shop', action: 'update-cart', data: { subtotal: 5 } });

    expect(res.status).toBe(404);
  });

  it('update-cart leaves the fields it sets out of the insert defaults', async () => {
    repos.posSessions.upsert.mockResolvedValue({ cart: [], subtotal: 5 });

    await post({ tenant: 'shop', action: 'update-cart', data: { subtotal: 5, total: 5 } });

    const [tenant, sessionId, set, insertDefaults] = repos.posSessions.upsert.mock.calls[0];
    expect([tenant, sessionId]).toEqual(['shop', 's-1']);
    expect(set).toEqual({ lastUpdate: expect.any(Number), subtotal: 5, total: 5 });
    expect(insertDefaults).toEqual({
      cart: [],
      discount: null,
      taxAmount: 0,
      taxRate: 0,
      taxLabel: 'Tax',
      tip: 0,
      paymentMethod: null,
      paymentStatus: 'pending',
    });
  });

  it('other actions never create a session', async () => {
    repos.posSessions.update.mockResolvedValue(null);

    const res = await post({ tenant: 'shop', action: 'update-tip', data: { tip: 3 } });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Session not found. Please reinitialize.');
    expect(repos.posSessions.upsert).not.toHaveBeenCalled();
  });

  it('keeps every response field', async () => {
    const stored = {
      cart: [{ name: 'A' }],
      subtotal: 1,
      discount: null,
      taxAmount: 2,
      taxRate: 3,
      taxLabel: 'VAT',
      tip: 4,
      total: 5,
      paymentMethod: 'cash',
      paymentStatus: 'pending',
    };
    repos.posSessions.upsert.mockResolvedValue(stored);

    const res = await post({ tenant: 'shop', action: 'init' });

    expect((await res.json()).data).toEqual({ sessionId: 's-1', ...stored });
  });

  it('GET reads by tenant slug and stays public', async () => {
    repos.posSessions.find.mockResolvedValue({ cart: [], lastUpdate: 7 });

    const res = await getSession(req('/api/pos/session/s-1?tenant=shop'), sessionParams('s-1'));

    expect(res.status).toBe(200);
    expect(repos.posSessions.find).toHaveBeenCalledWith('shop', 's-1');
    expect((await res.json()).data.lastUpdate).toBe(7);
    expect(mockRequireAuth).not.toHaveBeenCalled();
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Saved carts
// ---------------------------------------------------------------------------

describe('saved carts', () => {
  it('DELETE returns 404 when deactivate finds no active cart', async () => {
    repos.savedCarts.deactivate.mockResolvedValue(false);

    const res = await deleteCart(req('/api/saved-carts/c-1', 'DELETE'), idParams('c-1'));

    expect(res.status).toBe(404);
    expect(repos.savedCarts.deactivate).toHaveBeenCalledWith(TENANT, USER.userId, 'c-1');
  });

  it('DELETE succeeds when the cart was deactivated', async () => {
    repos.savedCarts.deactivate.mockResolvedValue(true);

    const res = await deleteCart(req('/api/saved-carts/c-1', 'DELETE'), idParams('c-1'));

    expect(res.status).toBe(200);
  });

  it('POST takes name, price and stock from the product and keeps string ids', async () => {
    repos.products.list.mockResolvedValue([{ _id: 'prod-1', name: 'Real', price: 10, stock: 4 }]);
    repos.savedCarts.create.mockResolvedValue({ _id: 'c-1' });

    const res = await createCart(
      req('/api/saved-carts', 'POST', {
        name: ' Cart ',
        items: [{ productId: 'prod-1', name: 'Fake', price: 1, quantity: 2, stock: 99 }],
        total: '20',
      })
    );

    expect(res.status).toBe(201);
    expect(repos.savedCarts.create).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        name: 'Cart',
        items: [{ productId: 'prod-1', name: 'Real', price: 10, quantity: 2, stock: 4 }],
        subtotal: 20,
        total: 20,
        userId: USER.userId,
      })
    );
  });

  it('POST returns 404 for a product outside the tenant', async () => {
    repos.products.list.mockResolvedValue([]);

    const res = await createCart(
      req('/api/saved-carts', 'POST', {
        name: 'Cart',
        items: [{ productId: 'other', name: 'X', price: 1, quantity: 1, stock: 1 }],
      })
    );

    expect(res.status).toBe(404);
    expect(repos.savedCarts.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Real-time stock
// ---------------------------------------------------------------------------

describe('GET /api/inventory/realtime', () => {
  it('sends movements oldest first and polls with the given filters', async () => {
    const newest = new Date();
    const older = new Date(newest.getTime() - 1000);
    repos.stockMovements.list.mockResolvedValue([
      { productId: 'prod-1', quantity: -1, type: 'sale', createdAt: newest },
      { productId: 'prod-1', quantity: -2, type: 'sale', createdAt: older },
    ]);
    const since = new Date(newest.getTime() - 60_000);
    const abort = new AbortController();
    const request = new NextRequest(
      new URL(`/api/inventory/realtime?productId=prod-1&since=${since.toISOString()}`, 'http://localhost'),
      { signal: abort.signal }
    );

    const res = await realtime(request);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while ((text.match(/stock_update/g) ?? []).length < 2) {
      const { value } = await reader.read();
      text += decoder.decode(value);
    }
    abort.abort();

    expect(repos.stockMovements.list).toHaveBeenCalledWith(
      TENANT,
      { productId: 'prod-1', branchId: undefined, createdAt: { gt: since } },
      { select: 'productId branchId variation type quantity newStock previousStock createdAt', limit: 500 }
    );
    expect(text.indexOf('"quantity":-2')).toBeLessThan(text.indexOf('"quantity":-1'));
  });
});

// ---------------------------------------------------------------------------
// Tenant scoping
// ---------------------------------------------------------------------------

describe('tenant scoping', () => {
  it('every repository call receives the authenticated tenant', async () => {
    const OTHER = 'tenant-b';
    const user = { ...USER, tenantId: OTHER };
    mockRequireTenantAccess.mockResolvedValue({ tenantId: OTHER, user });
    mockGetTenantIdFromRequest.mockResolvedValue(OTHER);
    mockGetCurrentUser.mockResolvedValue(user);
    mockRequireAuth.mockResolvedValue(user);

    repos.invoices.listWithRefs.mockResolvedValue([]);
    repos.invoices.count.mockResolvedValue(0);
    repos.invoices.findDetail.mockResolvedValue({ _id: 'inv-1' });
    repos.invoices.findById.mockResolvedValue({ _id: 'inv-1', status: 'draft', total: 1 });
    repos.invoices.update.mockResolvedValue({ after: {}, before: {}, changed: [] });
    repos.invoices.create.mockResolvedValue({ _id: 'inv-1' });
    repos.transactions.findById.mockResolvedValue({ _id: 'tx-1', items: [], subtotal: 1, total: 1 });
    repos.payments.listWithRefs.mockResolvedValue([]);
    repos.payments.count.mockResolvedValue(0);
    repos.payments.create.mockResolvedValue({ _id: 'pay-1' });
    repos.prescriptions.list.mockResolvedValue([]);
    repos.prescriptions.count.mockResolvedValue(0);
    repos.prescriptions.update.mockResolvedValue({ after: {}, before: {}, changed: [] });
    repos.savedCarts.listForUser.mockResolvedValue([]);
    repos.savedCarts.findForUser.mockResolvedValue({ _id: 'c-1' });
    repos.savedCarts.deactivate.mockResolvedValue(true);
    repos.stockMovements.listWithRefs.mockResolvedValue([]);
    repos.stockMovements.count.mockResolvedValue(0);

    const responses = await Promise.all([
      listInvoices(req('/api/invoices')),
      getInvoice(req('/api/invoices/inv-1'), idParams('inv-1')),
      patchInvoice(req('/api/invoices/inv-1', 'PATCH', { notes: 'x' }), idParams('inv-1')),
      invoiceFromTransaction(req('/api/invoices/from-transaction', 'POST', { transactionId: 'tx-1' })),
      listPayments(req('/api/payments')),
      createPayment(req('/api/payments', 'POST', { transactionId: 'tx-1', method: 'cash', amount: 1 })),
      listPrescriptions(req('/api/prescriptions?search=ana')),
      putPrescription(req('/api/prescriptions/rx-1', 'PUT', { notes: 'n' }), idParams('rx-1')),
      deletePrescription(req('/api/prescriptions/rx-1', 'DELETE'), idParams('rx-1')),
      dispense(req('/api/prescriptions/rx-1/dispense', 'POST', { itemIndexes: [0] }), idParams('rx-1')),
      listCarts(req('/api/saved-carts')),
      getCart(req('/api/saved-carts/c-1'), idParams('c-1')),
      deleteCart(req('/api/saved-carts/c-1', 'DELETE'), idParams('c-1')),
      listMovements(req('/api/stock-movements?productId=prod-1&type=sale')),
    ]);
    for (const res of responses) expect(res.status).toBeLessThan(300);

    const { posSessions: _keyedBySlug, ...tenantRepos } = repos;
    let calls = 0;
    for (const repo of Object.values(tenantRepos)) {
      for (const method of Object.values(repo)) {
        for (const call of method.mock.calls) {
          calls += 1;
          expect(call[0]).toBe(OTHER);
        }
      }
    }
    expect(calls).toBeGreaterThan(15);
    expect(mockUpdateStock.mock.calls[0][1]).toBe(OTHER);
  });
});
