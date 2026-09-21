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

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { success: (...args: unknown[]) => mockToastSuccess(...args), error: (...args: unknown[]) => mockToastError(...args) },
}));

import AdvancedBrandingPage from '@/app/[tenant]/[lang]/admin/advanced-branding/page';

const mockFetch = vi.fn();

// The flat shape GET /api/tenants/{tenant}/settings actually returns (Prisma
// TenantSettings columns) — not the nested `advancedBranding` object the
// page consumes. See lib/tenant-settings-flatten.ts's reshapeAdvancedBranding.
const flatSettingsResponse = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    companyName: 'Acme',
    fontSource: 'google',
    fontFamily: 'Inter',
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Inter',
    customFontUrl: null,
    theme: 'light',
    customThemeCss: ':root { --x: 1; }',
    borderRadius: 'md',
    customBorderRadius: null,
    ...overrides,
  },
});

describe('AdvancedBrandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(flatSettingsResponse()) });
    vi.stubGlobal('fetch', mockFetch);
  });

  // -------------------------------------------------------------------------
  // Flat-vs-nested shape regression (the page never showed its own saved
  // state before this fix, and — separately — never persisted anything,
  // since the flatten map was keyed 'customTheme' but nothing ever sent a
  // top-level `customTheme` object; both fixed together)
  // -------------------------------------------------------------------------
  it('reads branding fields back from the flat GET response instead of showing hardcoded defaults', async () => {
    render(<AdvancedBrandingPage />);
    await screen.findByRole('heading', { level: 1, name: 'Advanced Branding' });

    expect(screen.getByDisplayValue('Inter')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://fonts.googleapis.com/css2?family=Inter')).toBeInTheDocument();
    expect(screen.getByDisplayValue(':root { --x: 1; }')).toBeInTheDocument();
    // fontSource: 'google' -> Google Font URL field shown, Custom Font URL hidden.
    expect(screen.getByText('Google Font URL')).toBeInTheDocument();
    expect(screen.queryByText('Custom Font URL')).not.toBeInTheDocument();
  });

  it('sends the whole advancedBranding object as a single nested field on save', async () => {
    render(<AdvancedBrandingPage />);
    await screen.findByRole('heading', { level: 1, name: 'Advanced Branding' });

    fireEvent.change(screen.getByDisplayValue('Inter'), { target: { value: 'Roboto' } });

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: {} }) });
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tenants/test-tenant/settings',
        expect.objectContaining({ method: 'PUT' })
      );
    });
    const putCall = mockFetch.mock.calls.find(([, init]) => init?.method === 'PUT');
    const body = JSON.parse(putCall![1].body);
    expect(body.settings.advancedBranding).toMatchObject({
      fontFamily: 'Roboto',
      fontSource: 'google',
      customThemeCss: ':root { --x: 1; }',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Advanced branding settings saved successfully!');
  });

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------
  it('hides the Save button when the user lacks settings.manage', async () => {
    mockCanAccess.mockReturnValue(false);
    render(<AdvancedBrandingPage />);
    await screen.findByRole('heading', { level: 1, name: 'Advanced Branding' });

    expect(screen.queryByRole('button', { name: /Save Settings/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  it('rejects a non-https Google Font URL client-side and does not save', async () => {
    render(<AdvancedBrandingPage />);
    await screen.findByRole('heading', { level: 1, name: 'Advanced Branding' });

    fireEvent.change(screen.getByDisplayValue('https://fonts.googleapis.com/css2?family=Inter'), {
      target: { value: 'javascript:alert(1)' },
    });

    const callCountBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    expect(mockToastError).toHaveBeenCalledWith('Google Font URL must be a valid https:// address');
    expect(mockFetch.mock.calls.length).toBe(callCountBefore);
  });

  it('rejects unbalanced custom CSS braces client-side and does not save', async () => {
    render(<AdvancedBrandingPage />);
    await screen.findByRole('heading', { level: 1, name: 'Advanced Branding' });

    fireEvent.change(screen.getByDisplayValue(':root { --x: 1; }'), {
      target: { value: ':root { --x: 1;' },
    });

    const callCountBefore = mockFetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('Brace mismatch'));
    expect(mockFetch.mock.calls.length).toBe(callCountBefore);
  });

  it('server rejects a non-https font URL that bypasses the client check', async () => {
    render(<AdvancedBrandingPage />);
    await screen.findByRole('heading', { level: 1, name: 'Advanced Branding' });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ success: false, error: 'Font URL must be a valid https:// address' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Font URL must be a valid https:// address'));
  });

  // -------------------------------------------------------------------------
  // Error / retry state
  // -------------------------------------------------------------------------
  it('shows a retry-able error state when the settings fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: false, error: 'boom' }) });
    render(<AdvancedBrandingPage />);

    expect(await screen.findByText('Failed to Load Settings')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(flatSettingsResponse()) });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Advanced Branding' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Font source toggling
  // -------------------------------------------------------------------------
  it('shows the Custom Font URL field instead when fontSource is "custom"', async () => {
    render(<AdvancedBrandingPage />);
    await screen.findByRole('heading', { level: 1, name: 'Advanced Branding' });

    fireEvent.change(screen.getByDisplayValue('Google Font'), { target: { value: 'custom' } });

    expect(screen.getByText('Custom Font URL')).toBeInTheDocument();
    expect(screen.queryByText('Google Font URL')).not.toBeInTheDocument();
  });
});
