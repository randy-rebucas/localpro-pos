process.env.JWT_SECRET = 'test-secret-for-ledger-api-tests-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLedgerAccountFindMany = vi.fn();
const mockLedgerAccountFindFirst = vi.fn();
const mockLedgerAccountCreate = vi.fn();
const mockLedgerAccountUpdate = vi.fn();
const mockLedgerAccountCount = vi.fn();
const mockJournalEntryFindMany = vi.fn();
const mockJournalEntryFindFirst = vi.fn();
const mockJournalEntryCreate = vi.fn();
const mockJournalEntryUpdate = vi.fn();
const mockJournalLineCount = vi.fn();
const mockBranchFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    ledgerAccount: {
      findMany: (...args: unknown[]) => mockLedgerAccountFindMany(...args),
      findFirst: (...args: unknown[]) => mockLedgerAccountFindFirst(...args),
      create: (...args: unknown[]) => mockLedgerAccountCreate(...args),
      update: (...args: unknown[]) => mockLedgerAccountUpdate(...args),
      count: (...args: unknown[]) => mockLedgerAccountCount(...args),
    },
    journalEntry: {
      findMany: (...args: unknown[]) => mockJournalEntryFindMany(...args),
      findFirst: (...args: unknown[]) => mockJournalEntryFindFirst(...args),
      create: (...args: unknown[]) => mockJournalEntryCreate(...args),
      update: (...args: unknown[]) => mockJournalEntryUpdate(...args),
    },
    journalLine: {
      count: (...args: unknown[]) => mockJournalLineCount(...args),
    },
    branch: {
      findFirst: (...args: unknown[]) => mockBranchFindFirst(...args),
    },
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

const mockRequireLedgerAccess = vi.fn();
vi.mock('@/lib/ledger-access', () => ({
  requireLedgerAccess: (...args: unknown[]) => mockRequireLedgerAccess(...args),
}));

const mockEnsureChartOfAccounts = vi.fn();
vi.mock('@/lib/accounting/seed-chart-of-accounts', () => ({
  ensureChartOfAccounts: (...args: unknown[]) => mockEnsureChartOfAccounts(...args),
  seedChartOfAccounts: (...args: unknown[]) => mockEnsureChartOfAccounts(...args),
}));

import { GET as GET_ACCOUNTS, POST as POST_ACCOUNTS } from '@/app/api/ledger/accounts/route';
import { DELETE as DELETE_ACCOUNT } from '@/app/api/ledger/accounts/[id]/route';
import { GET as GET_ENTRIES, POST as POST_ENTRIES } from '@/app/api/ledger/entries/route';
import { DELETE as DELETE_ENTRY } from '@/app/api/ledger/entries/[id]/route';

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
  mockRequireLedgerAccess.mockResolvedValue(undefined);
  mockEnsureChartOfAccounts.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe('GET /api/ledger/accounts — tenant isolation', () => {
  it('scopes the accounts query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockLedgerAccountFindMany.mockResolvedValue([]);

    const res = await GET_ACCOUNTS(createRequest('/api/ledger/accounts'));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockLedgerAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
    );
  });
});

describe('GET /api/ledger/entries — tenant isolation', () => {
  it('scopes the entries query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockJournalEntryFindMany.mockResolvedValue([]);

    const res = await GET_ENTRIES(createRequest('/api/ledger/entries'));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockJournalEntryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
    );
    void TENANT_B;
  });
});

// ---------------------------------------------------------------------------
// Manual journal entry balance validation
// ---------------------------------------------------------------------------

describe('POST /api/ledger/entries — balance validation', () => {
  it('rejects an unbalanced manual entry with 400', async () => {
    authAs(TENANT_A);

    const res = await POST_ENTRIES(
      createRequest('/api/ledger/entries', 'POST', {
        memo: 'Test entry',
        lines: [
          { accountId: 'acct-cash', debit: 100, credit: 0 },
          { accountId: 'acct-revenue', debit: 0, credit: 50 },
        ],
      })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockJournalEntryCreate).not.toHaveBeenCalled();
  });

  it('accepts a balanced manual entry', async () => {
    authAs(TENANT_A);
    mockLedgerAccountFindMany.mockResolvedValue([
      { id: 'acct-cash', tenantId: TENANT_A },
      { id: 'acct-revenue', tenantId: TENANT_A },
    ]);
    mockJournalEntryCreate.mockResolvedValue({
      id: 'entry-1',
      tenantId: TENANT_A,
      source: 'manual',
      lines: [],
    });

    const res = await POST_ENTRIES(
      createRequest('/api/ledger/entries', 'POST', {
        memo: 'Test entry',
        lines: [
          { accountId: 'acct-cash', debit: 100, credit: 0 },
          { accountId: 'acct-revenue', debit: 0, credit: 100 },
        ],
      })
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockJournalEntryCreate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// System account deletion blocked
// ---------------------------------------------------------------------------

describe('DELETE /api/ledger/accounts/[id] — system account protection', () => {
  it('blocks deletion of a system account', async () => {
    authAs(TENANT_A);
    mockLedgerAccountFindFirst.mockResolvedValue({
      id: 'acct-cash',
      tenantId: TENANT_A,
      isSystemAccount: true,
    });

    const res = await DELETE_ACCOUNT(
      createRequest('/api/ledger/accounts/acct-cash', 'DELETE'),
      { params: Promise.resolve({ id: 'acct-cash' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockLedgerAccountUpdate).not.toHaveBeenCalled();
  });

  it('allows deletion of a custom account with no journal lines', async () => {
    authAs(TENANT_A);
    mockLedgerAccountFindFirst.mockResolvedValue({
      id: 'acct-custom',
      tenantId: TENANT_A,
      isSystemAccount: false,
    });
    mockJournalLineCount.mockResolvedValue(0);
    mockLedgerAccountUpdate.mockResolvedValue({});

    const res = await DELETE_ACCOUNT(
      createRequest('/api/ledger/accounts/acct-custom', 'DELETE'),
      { params: Promise.resolve({ id: 'acct-custom' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockLedgerAccountUpdate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Auto-posted entry deletion blocked
// ---------------------------------------------------------------------------

describe('DELETE /api/ledger/entries/[id] — auto-posted entry protection', () => {
  it('blocks deletion of an auto-posted (transaction-sourced) entry', async () => {
    authAs(TENANT_A);
    mockJournalEntryFindFirst.mockResolvedValue({
      id: 'entry-1',
      tenantId: TENANT_A,
      source: 'transaction',
    });

    const res = await DELETE_ENTRY(
      createRequest('/api/ledger/entries/entry-1', 'DELETE'),
      { params: Promise.resolve({ id: 'entry-1' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockJournalEntryUpdate).not.toHaveBeenCalled();
  });

  it('allows deletion of a manual entry', async () => {
    authAs(TENANT_A);
    mockJournalEntryFindFirst.mockResolvedValue({
      id: 'entry-2',
      tenantId: TENANT_A,
      source: 'manual',
    });
    mockJournalEntryUpdate.mockResolvedValue({});

    const res = await DELETE_ENTRY(
      createRequest('/api/ledger/entries/entry-2', 'DELETE'),
      { params: Promise.resolve({ id: 'entry-2' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockJournalEntryUpdate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

describe('POST /api/ledger/accounts — feature gate', () => {
  it('blocks creation when enableAccounting resolves false for the tenant/business type', async () => {
    authAs(TENANT_A);
    mockRequireLedgerAccess.mockRejectedValue(
      new Error('Accounting Ledger is turned off for this store. Enable it in Settings → Business Features.')
    );

    const res = await POST_ACCOUNTS(
      createRequest('/api/ledger/accounts', 'POST', {
        code: '5030',
        name: 'Custom Expense',
        type: 'expense',
      })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockLedgerAccountCreate).not.toHaveBeenCalled();
  });
});
