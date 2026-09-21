import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// next/navigation's useParams is already globally mocked in __tests__/setup.ts
// to { tenant: 'test-tenant', lang: 'en' }.

const mockCanAccess = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: (key: string) => mockCanAccess(key), isAlwaysAllowed: false }),
}));

vi.mock('@/app/[tenant]/[lang]/dictionaries-client', () => ({
  getDictionaryClient: vi.fn().mockResolvedValue({}),
}));

const mockToastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

const mockFetchAuditLogs = vi.fn();
vi.mock('@/hooks/useAuditLogs', () => ({
  useAuditLogs: () => ({
    auditLogs: mockAuditLogsState.logs,
    pagination: mockAuditLogsState.pagination,
    loading: mockAuditLogsState.loading,
    fetch: mockFetchAuditLogs,
  }),
}));

const mockFetchUsers = vi.fn((onError?: (e: string) => void) => {
  onError?.('');
  return Promise.resolve();
});
vi.mock('@/hooks/useAuditUsers', () => ({
  useAuditUsers: () => ({ users: [], loading: false, fetch: mockFetchUsers }),
}));

import AuditLogsPage from '@/app/[tenant]/[lang]/admin/audit-logs/page';

// Shaped like the real GET /api/audit-logs response: `user` is the Prisma
// relation include (name/email of the actor), `userId` is only the raw
// scalar FK column — never an object. The page previously read `log.userId`
// as if it were the joined user, so every row silently showed "System".
let mockAuditLogsState: {
  logs: Array<{
    _id: string;
    userId: string | null;
    user: { name: string; email: string } | null;
    action: string;
    entityType: string;
    entityId?: string;
    ipAddress?: string;
    createdAt: string;
  }>;
  pagination: { page: number; limit: number; total: number; pages: number };
  loading: boolean;
} = {
  logs: [],
  pagination: { page: 1, limit: 50, total: 0, pages: 0 },
  loading: false,
};

describe('AuditLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockImplementation((key: string) => key === 'audit_logs.view' || key === 'audit_logs.export');
    mockAuditLogsState = {
      logs: [],
      pagination: { page: 1, limit: 50, total: 0, pages: 0 },
      loading: false,
    };
  });

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------
  it('shows an access-restricted message when the user lacks audit_logs.view', async () => {
    mockCanAccess.mockReturnValue(false);
    render(<AuditLogsPage />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument();
  });

  it('hides the export buttons when the user lacks audit_logs.export', async () => {
    mockCanAccess.mockImplementation((key: string) => key === 'audit_logs.view');
    render(<AuditLogsPage />);

    await screen.findByRole('heading', { name: 'Audit Logs' });
    expect(screen.queryByRole('button', { name: /Export CSV/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export JSON/i })).not.toBeInTheDocument();
  });

  it('shows the export buttons when the user has audit_logs.export', async () => {
    render(<AuditLogsPage />);

    await screen.findByRole('heading', { name: 'Audit Logs' });
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export JSON/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Actor display (regression: log.user, not log.userId, holds the name/email)
  // -------------------------------------------------------------------------
  it('renders the actor name/email from the joined `user` field, not the raw `userId`', async () => {
    mockAuditLogsState = {
      logs: [
        {
          _id: 'log1',
          userId: 'user-123',
          user: { name: 'Jane Cashier', email: 'jane@example.com' },
          action: 'delete',
          entityType: 'product',
          entityId: 'prod-1',
          ipAddress: '10.0.0.1',
          createdAt: '2026-09-20T10:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      loading: false,
    };

    render(<AuditLogsPage />);

    expect(await screen.findByText('Jane Cashier')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
  });

  it('falls back to "System" when a log has no associated user', async () => {
    mockAuditLogsState = {
      logs: [
        {
          _id: 'log1',
          userId: null,
          user: null,
          action: 'create',
          entityType: 'automation',
          createdAt: '2026-09-20T10:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      loading: false,
    };

    render(<AuditLogsPage />);
    expect(await screen.findByText('System')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Loading / empty states
  // -------------------------------------------------------------------------
  it('shows an empty state when there are no logs', async () => {
    render(<AuditLogsPage />);
    expect(await screen.findByText('No audit logs found')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------
  it('resets to page 1 when a filter changes', async () => {
    mockAuditLogsState = {
      logs: [],
      pagination: { page: 3, limit: 50, total: 120, pages: 3 },
      loading: false,
    };
    render(<AuditLogsPage />);
    await screen.findByRole('heading', { name: 'Audit Logs' });

    mockFetchAuditLogs.mockClear();
    fireEvent.change(screen.getByPlaceholderText('e.g. product, user'), { target: { value: 'product' } });

    await waitFor(() => {
      const lastCall = mockFetchAuditLogs.mock.calls.at(-1);
      expect(lastCall?.[0]).toMatchObject({ page: 1, entityType: 'product' });
    });
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------
  it('disables Previous on the first page and Next on the last page', async () => {
    mockAuditLogsState = {
      logs: [
        { _id: 'l1', userId: null, user: null, action: 'view', entityType: 'report', createdAt: '2026-09-20T10:00:00.000Z' },
      ],
      pagination: { page: 1, limit: 50, total: 100, pages: 2 },
      loading: false,
    };
    render(<AuditLogsPage />);

    expect(await screen.findByRole('button', { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
  });
});
