process.env.JWT_SECRET = 'test-secret-for-kitchen-tickets-api-tests-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTicketFindMany = vi.fn();
const mockTicketFindFirst = vi.fn();
const mockTicketCreate = vi.fn();
const mockTicketUpdate = vi.fn();
const mockItemFindFirst = vi.fn();
const mockItemUpdate = vi.fn();
const mockItemUpdateMany = vi.fn();
const mockBranchFindFirst = vi.fn();
const mockTransactionFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    kitchenTicket: {
      findMany: (...args: unknown[]) => mockTicketFindMany(...args),
      findFirst: (...args: unknown[]) => mockTicketFindFirst(...args),
      create: (...args: unknown[]) => mockTicketCreate(...args),
      update: (...args: unknown[]) => mockTicketUpdate(...args),
    },
    kitchenTicketItem: {
      findFirst: (...args: unknown[]) => mockItemFindFirst(...args),
      update: (...args: unknown[]) => mockItemUpdate(...args),
      updateMany: (...args: unknown[]) => mockItemUpdateMany(...args),
    },
    branch: {
      findFirst: (...args: unknown[]) => mockBranchFindFirst(...args),
    },
    transaction: {
      findFirst: (...args: unknown[]) => mockTransactionFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetAfterMs: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockGetCurrentUser = vi.fn();
const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockGetTenantIdFromRequest = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: (...args: unknown[]) => mockGetTenantIdFromRequest(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockRequireKitchenDisplayAccess = vi.fn();
vi.mock('@/lib/kitchen-display-access', () => ({
  requireKitchenDisplayAccess: (...args: unknown[]) => mockRequireKitchenDisplayAccess(...args),
}));

import { GET, POST } from '@/app/api/kitchen-tickets/route';
import { PATCH } from '@/app/api/kitchen-tickets/[id]/items/[itemId]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function createRequest(url: string, method: string = 'GET', body?: Record<string, unknown>): NextRequest {
  const options: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function authAs(tenantId: string, role: string = 'owner', userId: string = 'user-1') {
  const user = { userId, tenantId, email: 'test@example.com', role };
  mockGetCurrentUser.mockResolvedValue(user);
  mockRequireAuth.mockResolvedValue(user);
  mockGetTenantIdFromRequest.mockResolvedValue(tenantId);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasTenantPermission.mockResolvedValue(true);
  mockRequireKitchenDisplayAccess.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe('GET /api/kitchen-tickets — tenant isolation', () => {
  it('scopes the list query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockTicketFindMany.mockResolvedValue([]);

    const res = await GET(createRequest('/api/kitchen-tickets'));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockTicketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
    );
  });
});

describe('POST /api/kitchen-tickets — tenant isolation', () => {
  it('returns 404 when the transaction belongs to a different tenant', async () => {
    authAs(TENANT_A);
    // The route scopes findFirst by { id, tenantId: TENANT_A }; a cross-tenant
    // transaction (owned by TENANT_B) never matches, so the mock returns null,
    // exactly as Postgres would for a tenantId-scoped WHERE clause.
    mockTransactionFindFirst.mockResolvedValue(null);

    const res = await POST(
      createRequest('/api/kitchen-tickets', 'POST', { transactionId: 'txn-owned-by-tenant-b' })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(mockTicketCreate).not.toHaveBeenCalled();
    void TENANT_B; // documents intent: transaction would belong to TENANT_B in a real DB
  });
});

// ---------------------------------------------------------------------------
// Ticket creation from a transaction
// ---------------------------------------------------------------------------

describe('POST /api/kitchen-tickets — creation from a transaction', () => {
  it('creates one KitchenTicketItem per TransactionItem', async () => {
    authAs(TENANT_A);
    mockTransactionFindFirst.mockResolvedValue({
      id: 'txn-1',
      tenantId: TENANT_A,
      items: [
        { id: 'ti-1' },
        { id: 'ti-2' },
        { id: 'ti-3' },
      ],
    });
    mockTicketCreate.mockResolvedValue({ id: 'ticket-1', tenantId: TENANT_A, items: [] });

    const res = await POST(
      createRequest('/api/kitchen-tickets', 'POST', { transactionId: 'txn-1' })
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockTicketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: 'txn-1',
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({ transactionItemId: 'ti-1', status: 'queued' }),
              expect.objectContaining({ transactionItemId: 'ti-2', status: 'queued' }),
              expect.objectContaining({ transactionItemId: 'ti-3', status: 'queued' }),
            ]),
          },
        }),
      })
    );
    const createCall = mockTicketCreate.mock.calls[0][0];
    expect(createCall.data.items.create).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Item status transition validation
// ---------------------------------------------------------------------------

describe('PATCH /api/kitchen-tickets/[id]/items/[itemId] — status transitions', () => {
  it('rejects an invalid jump from queued to served', async () => {
    authAs(TENANT_A);
    mockTicketFindFirst.mockResolvedValue({ id: 'ticket-1', tenantId: TENANT_A });
    mockItemFindFirst.mockResolvedValue({
      id: 'item-1',
      kitchenTicketId: 'ticket-1',
      tenantId: TENANT_A,
      status: 'queued',
      startedAt: null,
    });

    const res = await PATCH(
      createRequest('/api/kitchen-tickets/ticket-1/items/item-1', 'PATCH', { status: 'served' }),
      { params: Promise.resolve({ id: 'ticket-1', itemId: 'item-1' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockItemUpdate).not.toHaveBeenCalled();
  });

  it('allows the valid queued -> preparing transition and sets startedAt', async () => {
    authAs(TENANT_A);
    mockTicketFindFirst.mockResolvedValue({ id: 'ticket-1', tenantId: TENANT_A });
    mockItemFindFirst.mockResolvedValue({
      id: 'item-1',
      kitchenTicketId: 'ticket-1',
      tenantId: TENANT_A,
      status: 'queued',
      startedAt: null,
    });
    mockItemUpdate.mockResolvedValue({ id: 'item-1', status: 'preparing' });

    const res = await PATCH(
      createRequest('/api/kitchen-tickets/ticket-1/items/item-1', 'PATCH', { status: 'preparing' }),
      { params: Promise.resolve({ id: 'ticket-1', itemId: 'item-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: expect.objectContaining({
          status: 'preparing',
          startedAt: expect.any(Date),
        }),
      })
    );
  });

  it('sets readyAt on the preparing -> ready transition', async () => {
    authAs(TENANT_A);
    mockTicketFindFirst.mockResolvedValue({ id: 'ticket-1', tenantId: TENANT_A });
    mockItemFindFirst.mockResolvedValue({
      id: 'item-1',
      kitchenTicketId: 'ticket-1',
      tenantId: TENANT_A,
      status: 'preparing',
      startedAt: new Date(),
    });
    mockItemUpdate.mockResolvedValue({ id: 'item-1', status: 'ready' });

    const res = await PATCH(
      createRequest('/api/kitchen-tickets/ticket-1/items/item-1', 'PATCH', { status: 'ready' }),
      { params: Promise.resolve({ id: 'ticket-1', itemId: 'item-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ready', readyAt: expect.any(Date) }),
      })
    );
  });

  it('sets servedAt on the ready -> served transition', async () => {
    authAs(TENANT_A);
    mockTicketFindFirst.mockResolvedValue({ id: 'ticket-1', tenantId: TENANT_A });
    mockItemFindFirst.mockResolvedValue({
      id: 'item-1',
      kitchenTicketId: 'ticket-1',
      tenantId: TENANT_A,
      status: 'ready',
      startedAt: new Date(),
    });
    mockItemUpdate.mockResolvedValue({ id: 'item-1', status: 'served' });

    const res = await PATCH(
      createRequest('/api/kitchen-tickets/ticket-1/items/item-1', 'PATCH', { status: 'served' }),
      { params: Promise.resolve({ id: 'ticket-1', itemId: 'item-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'served', servedAt: expect.any(Date) }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

describe('POST /api/kitchen-tickets — feature gate', () => {
  it('blocks creation when enableKitchenDisplay resolves false for the tenant/business type', async () => {
    authAs(TENANT_A);
    mockRequireKitchenDisplayAccess.mockRejectedValue(
      new Error('Kitchen Display is turned off for this store. Enable it in Settings → Business Features.')
    );

    const res = await POST(
      createRequest('/api/kitchen-tickets', 'POST', { transactionId: 'txn-1' })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockTicketCreate).not.toHaveBeenCalled();
  });

  it('creates the kitchen ticket when the feature is enabled', async () => {
    authAs(TENANT_A);
    mockTransactionFindFirst.mockResolvedValue({ id: 'txn-1', tenantId: TENANT_A, items: [{ id: 'ti-1' }] });
    mockTicketCreate.mockResolvedValue({ id: 'ticket-new', tenantId: TENANT_A, items: [] });

    const res = await POST(
      createRequest('/api/kitchen-tickets', 'POST', { transactionId: 'txn-1' })
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockTicketCreate).toHaveBeenCalled();
  });
});
