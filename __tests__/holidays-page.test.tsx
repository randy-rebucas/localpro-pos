import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// next/navigation's useParams is already globally mocked in __tests__/setup.ts
// to { tenant: 'test-tenant', lang: 'en' }.

vi.mock('@/app/[tenant]/[lang]/dictionaries-client', () => ({
  getDictionaryClient: vi.fn().mockResolvedValue({}),
}));

// Grants every holidays action (holidays.create/edit/delete); the page checks each one separately.
const mockCanAccess = vi.fn((key: string) => key.startsWith('holidays.'));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: (key: string) => mockCanAccess(key), isAlwaysAllowed: false }),
}));

vi.spyOn(window, 'confirm').mockReturnValue(true);

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/lib/toast', () => ({
  showToast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: (...args: unknown[]) => mockToastError(...args) },
}));

import HolidaysAdminPage from '@/app/[tenant]/[lang]/admin/holidays/page';

const mockFetch = vi.fn();

const sampleHoliday = {
  id: 'holiday_1',
  name: "New Year's Day",
  date: '2026-01-01',
  type: 'single',
  isBusinessClosed: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('HolidaysAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockImplementation((key: string) => key.startsWith('holidays.'));
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  // -------------------------------------------------------------------------
  // Rendering does not depend on the unrelated tenant-settings fetch
  // -------------------------------------------------------------------------
  it('renders the holiday list from GET /api/tenants/{tenant}/holidays without ever calling the settings endpoint', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [sampleHoliday] }),
    });
    render(<HolidaysAdminPage />);

    expect(await screen.findByText("New Year's Day")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tenants/test-tenant/holidays',
      expect.objectContaining({ credentials: 'include' })
    );
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('/settings'), expect.anything());
  });

  it('does not hang on the loading spinner when the holidays fetch fails (regression: page previously gated on an unused, error-swallowing settings fetch)', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: 'boom' }),
    });
    render(<HolidaysAdminPage />);

    // The dict-loading spinner clears once the dictionary resolves; the
    // holiday-list failure surfaces its own inline error instead of an
    // infinite outer spinner.
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('is read-only without holidays.manage: shows a notice and disables every write control', async () => {
    mockCanAccess.mockReturnValue(false);
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [sampleHoliday] }),
    });
    render(<HolidaysAdminPage />);

    expect(await screen.findByText("New Year's Day")).toBeInTheDocument();
    expect(screen.getByText(/don't have permission to change holidays/i)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('gates each row action on its own permission (edit without delete)', async () => {
    mockCanAccess.mockImplementation((key: string) => key === 'holidays.edit');
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [sampleHoliday] }),
    });
    render(<HolidaysAdminPage />);

    expect(await screen.findByText("New Year's Day")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    // Add + Suggest are create actions.
    expect(screen.getByRole('button', { name: 'Add Holiday' })).toBeDisabled();
  });

  it('shows the empty state when there are no holidays', async () => {
    render(<HolidaysAdminPage />);
    expect(
      await screen.findByText('No holidays configured. Add holidays to mark days when your business is closed.')
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  it('creates a single-date holiday and refetches the list', async () => {
    render(<HolidaysAdminPage />);
    await screen.findByText('No holidays configured. Add holidays to mark days when your business is closed.');

    fireEvent.click(screen.getByRole('button', { name: 'Add Holiday' }));
    fireEvent.change(screen.getByPlaceholderText("e.g., New Year's Day"), {
      target: { value: "New Year's Day" },
    });
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2026-01-01' } });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: sampleHoliday }),
    });
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [sampleHoliday] }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Holiday' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tenants/test-tenant/holidays',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: "New Year's Day",
            type: 'single',
            date: '2026-01-01',
            isBusinessClosed: true,
            recurring: undefined,
          }),
        })
      );
    });

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Holiday created successfully'));
  });

  it('shows the server error message when create fails', async () => {
    render(<HolidaysAdminPage />);
    await screen.findByText('No holidays configured. Add holidays to mark days when your business is closed.');

    fireEvent.click(screen.getByRole('button', { name: 'Add Holiday' }));
    fireEvent.change(screen.getByPlaceholderText("e.g., New Year's Day"), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2026-01-01' } });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: 'Date is required for single date holidays' }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Holiday' }));

    expect(await screen.findByText('Date is required for single date holidays')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Edit / Delete
  // -------------------------------------------------------------------------
  it('edits an existing holiday via PUT', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [sampleHoliday] }),
    });
    render(<HolidaysAdminPage />);
    await screen.findByText("New Year's Day");

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByDisplayValue("New Year's Day"), { target: { value: "New Year's Day (updated)" } });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { ...sampleHoliday, name: "New Year's Day (updated)" } }),
    });
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [{ ...sampleHoliday, name: "New Year's Day (updated)" }] }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Holiday' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tenants/test-tenant/holidays',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"id":"holiday_1"'),
        })
      );
    });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Holiday updated successfully'));
  });

  it('deletes a holiday after confirmation', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [sampleHoliday] }),
    });
    render(<HolidaysAdminPage />);
    await screen.findByText("New Year's Day");

    mockFetch.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) });
    mockFetch.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tenants/test-tenant/holidays?id=holiday_1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Holiday deleted successfully'));
  });

  it('does not call the delete endpoint when the confirmation is dismissed', async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [sampleHoliday] }),
    });
    render(<HolidaysAdminPage />);
    await screen.findByText("New Year's Day");

    const callCountBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockFetch.mock.calls.length).toBe(callCountBefore);
  });

  // -------------------------------------------------------------------------
  // Recurring holiday form fields
  // -------------------------------------------------------------------------
  it('submits a yearly recurring holiday with month/day fields instead of a date', async () => {
    render(<HolidaysAdminPage />);
    await screen.findByText('No holidays configured. Add holidays to mark days when your business is closed.');

    fireEvent.click(screen.getByRole('button', { name: 'Add Holiday' }));
    fireEvent.change(screen.getByPlaceholderText("e.g., New Year's Day"), { target: { value: 'Christmas' } });
    fireEvent.change(screen.getByDisplayValue('Single Date'), { target: { value: 'recurring' } });
    fireEvent.change(screen.getByLabelText('Month (1-12)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Day of Month (1-31)'), { target: { value: '25' } });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { ...sampleHoliday, id: 'holiday_2', name: 'Christmas' } }),
    });
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Holiday' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tenants/test-tenant/holidays',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Christmas',
            type: 'recurring',
            date: '',
            isBusinessClosed: true,
            recurring: { pattern: 'yearly', month: 12, dayOfMonth: 25, dayOfWeek: 0 },
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Country-based holiday suggestions
  // -------------------------------------------------------------------------
  describe('suggested holidays', () => {
    const suggestionsPayload = (overrides: Partial<{ countryCode: string | null; holidays: unknown[] }> = {}) => ({
      success: true,
      data: {
        countryCode: 'PH',
        year: 2026,
        holidays: [
          { name: "New Year's Day", date: '2026-01-01', type: 'public', alreadyAdded: false },
          { name: 'Independence Day', date: '2026-06-12', type: 'public', alreadyAdded: true },
        ],
        availableCountries: [
          { code: 'PH', name: 'Philippines' },
          { code: 'US', name: 'United States of America' },
        ],
        ...overrides,
      },
    });

    const routeFetch = (opts: { suggestionsGet?: unknown; suggestionsPost?: unknown } = {}) => {
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/holidays/suggestions')) {
          if (init?.method === 'POST') {
            return Promise.resolve({ json: () => Promise.resolve(opts.suggestionsPost ?? { success: true, imported: 1, data: [] }) });
          }
          return Promise.resolve({ json: () => Promise.resolve(opts.suggestionsGet ?? suggestionsPayload()) });
        }
        if (url.endsWith('/holidays')) {
          return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
        }
        return Promise.resolve({ json: () => Promise.resolve({ success: true, data: [] }) });
      });
    };

    it('lists suggestions for the resolved country, pre-checking everything not already added', async () => {
      routeFetch();
      render(<HolidaysAdminPage />);
      await screen.findByText('No holidays configured. Add holidays to mark days when your business is closed.');

      fireEvent.click(screen.getByRole('button', { name: 'Suggest Holidays' }));

      expect(await screen.findByText("New Year's Day")).toBeInTheDocument();
      expect(screen.getByText('Independence Day')).toBeInTheDocument();

      const newYear = document.getElementById('suggestion-2026-01-01') as HTMLInputElement;
      const independence = document.getElementById('suggestion-2026-06-12') as HTMLInputElement;
      expect(newYear.checked).toBe(true);
      expect(newYear.disabled).toBe(false);
      expect(independence.checked).toBe(false); // not pre-selected — it's already on the calendar
      expect(independence.disabled).toBe(true); // and locked, so it can't be re-imported

      expect(screen.getByRole('button', { name: /Import 1 selected/i })).toBeInTheDocument();
    });

    it('imports only the selected, not-already-added suggestions', async () => {
      routeFetch();
      render(<HolidaysAdminPage />);
      await screen.findByText('No holidays configured. Add holidays to mark days when your business is closed.');
      fireEvent.click(screen.getByRole('button', { name: 'Suggest Holidays' }));
      await screen.findByText("New Year's Day");

      fireEvent.click(screen.getByRole('button', { name: /Import 1 selected/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/tenants/test-tenant/holidays/suggestions',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              holidays: [{ name: "New Year's Day", date: '2026-01-01', isBusinessClosed: true }],
            }),
          })
        );
      });

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('1 holiday(s) imported'));
      // Panel closes after a successful import.
      await waitFor(() => expect(screen.queryByRole('button', { name: /Import \d+ selected/i })).not.toBeInTheDocument());
    });

    it('shows a country picker and refetches when the tenant country could not be auto-resolved', async () => {
      routeFetch({ suggestionsGet: suggestionsPayload({ countryCode: null, holidays: [] }) });
      render(<HolidaysAdminPage />);
      await screen.findByText('No holidays configured. Add holidays to mark days when your business is closed.');
      fireEvent.click(screen.getByRole('button', { name: 'Suggest Holidays' }));

      expect(await screen.findByText(/couldn't match your tenant's configured country/i)).toBeInTheDocument();

      routeFetch({ suggestionsGet: suggestionsPayload() });
      fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'PH' } });

      expect(await screen.findByText("New Year's Day")).toBeInTheDocument();
    });

    it('surfaces an error when the suggestions fetch fails', async () => {
      routeFetch({ suggestionsGet: { success: false, error: 'boom' } });
      render(<HolidaysAdminPage />);
      await screen.findByText('No holidays configured. Add holidays to mark days when your business is closed.');
      fireEvent.click(screen.getByRole('button', { name: 'Suggest Holidays' }));

      expect(await screen.findByText('boom')).toBeInTheDocument();
    });
  });
});
