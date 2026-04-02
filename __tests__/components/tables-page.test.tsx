import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils';
import TablesPage from '@/app/[tenant]/[lang]/admin/tables/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useParams: () => ({
    tenant: 'test-tenant',
    lang: 'en',
  }),
}));

vi.mock('@/contexts/TenantSettingsContext', () => ({
  useTenantSettings: () => ({
    settings: { currency: 'PHP', language: 'en' },
    loading: false,
  }),
  TenantSettingsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: '1', email: 'admin@test.com', role: 'admin', name: 'Admin' },
    isAuthenticated: true,
    loading: false,
    hasRole: () => true,
  }),
}));

vi.mock('@/components/Navbar', () => ({
  default: () => null,
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

// Mock fetch globally
global.fetch = vi.fn();

const emptyResponse = {
  ok: true,
  json: async () => ({ success: true, data: [] }),
};

const mockEmptyFetch = () => {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(emptyResponse);
};

const mockTablesFetch = (tables: object[]) => {
  const tableResponse = {
    ok: true,
    json: async () => ({ success: true, data: tables }),
  };
  // First call returns tables, subsequent calls (re-fetches) return empty
  (global.fetch as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(tableResponse)
    .mockResolvedValue(emptyResponse);
};

describe('Tables Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Always provide a safe default so unexpected extra fetches don't crash
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });
  });

  describe('Rendering', () => {
    it('should render the tables page heading', async () => {
      mockEmptyFetch();
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      expect(screen.getByRole('heading', { name: /^tables$/i })).toBeInTheDocument();
    });

    it('should render Add Table button', async () => {
      mockEmptyFetch();
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      expect(screen.getAllByRole('button', { name: /\+ add table/i })[0]).toBeInTheDocument();
    });

    it('should display empty state when no tables exist', async () => {
      mockEmptyFetch();
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      await waitFor(() => {
        expect(screen.getByText(/no tables configured yet/i)).toBeInTheDocument();
      });
    });

    it('should render tables list with data', async () => {
      const mockTables = [
        { _id: '1', name: 'Table 1', capacity: 4, status: 'open', isActive: true },
        { _id: '2', name: 'Table 2', capacity: 6, status: 'occupied', isActive: true },
      ];
      mockTablesFetch(mockTables);
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      await waitFor(() => {
        expect(screen.getByText('Table 1')).toBeInTheDocument();
        expect(screen.getByText('Table 2')).toBeInTheDocument();
      });
    });
  });

  describe('Add Table Modal', () => {
    it('should open add table modal when clicking Add Table button', async () => {
      const user = userEvent.setup();
      mockEmptyFetch();
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      const addButton = screen.getAllByRole('button', { name: /\+ add table/i })[0];
      await user.click(addButton);
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /add table/i })).toBeInTheDocument();
      });
    });

    it('should show table name and capacity inputs in modal', async () => {
      const user = userEvent.setup();
      mockEmptyFetch();
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      const addButton = screen.getAllByRole('button', { name: /\+ add table/i })[0];
      await user.click(addButton);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. T1/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/e\.g\. 4/i)).toBeInTheDocument();
      });
    });

    it('should submit form and call API', async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { _id: '3', name: 'New Table', capacity: 4, status: 'open', isActive: true } }) })
        .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) });
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      const addButton = screen.getAllByRole('button', { name: /\+ add table/i })[0];
      await act(async () => { await user.click(addButton); });
      const nameInput = await screen.findByPlaceholderText(/e\.g\. T1/i);
      const capInput = await screen.findByPlaceholderText(/e\.g\. 4/i);
      await user.type(nameInput, 'New Table');
      await user.type(capInput, '4');
      // The modal submit button has text "Add Table" (no + prefix)
      const submitButton = screen.getByRole('button', { name: /^add table$/i });
      await act(async () => { await user.click(submitButton); });
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/tables'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });
  });

  describe('Edit Table', () => {
    it('should open edit modal with prefilled data', async () => {
      const user = userEvent.setup();
      const mockTables = [
        { _id: '1', name: 'Table 1', capacity: 4, status: 'open', isActive: true },
      ];
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTables }),
      });
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      await waitFor(() => {
        expect(screen.getByText('Table 1')).toBeInTheDocument();
      });
      const editButton = screen.getByRole('button', { name: /edit/i });
      await act(async () => {
        await user.click(editButton);
      });
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit table/i })).toBeInTheDocument();
        expect(screen.getByDisplayValue('Table 1')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have a top-level heading', async () => {
      mockEmptyFetch();
      await act(async () => {
        renderWithProviders(<TablesPage />);
      });
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });
});
