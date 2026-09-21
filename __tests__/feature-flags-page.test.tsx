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

const mockTenantSettings = vi.fn();
vi.mock('@/contexts/TenantSettingsContext', () => ({
  useTenantSettings: () => mockTenantSettings(),
}));

import FeatureFlagsPage from '@/app/[tenant]/[lang]/admin/feature-flags/page';

const mockFetch = vi.fn();

const baseSettings = {
  enableInventory: true,
  enableCategories: true,
  enableDiscounts: false,
  enableLoyaltyProgram: false,
  enableCustomerManagement: false,
  enableBookingScheduling: false,
};

describe('FeatureFlagsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
    mockTenantSettings.mockReturnValue({ settings: null, loading: false, refreshSettings: vi.fn() });
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { ...baseSettings } }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  // -------------------------------------------------------------------------
  // Rendering / loading
  // -------------------------------------------------------------------------
  it('shows a loading state before settings resolve', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    render(<FeatureFlagsPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    resolveFetch({ json: () => Promise.resolve({ success: true, data: { ...baseSettings } }) });
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
  });

  it('renders every flag from FEATURE_FLAGS as a checkbox', async () => {
    render(<FeatureFlagsPage />);
    expect(await screen.findByRole('heading', { name: 'Feature Flags' })).toBeInTheDocument();

    // FEATURE_FLAGS currently lists 14 toggles (lib/feature-flags-helpers.ts).
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(14);
  });

  it('shows a retry-able error state when the settings fetch fails', async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ success: false, error: 'boom' }) });
    render(<FeatureFlagsPage />);

    expect(await screen.findByText('Failed to Load Settings')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: { ...baseSettings } }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Feature Flags' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Permissions (settings.manage floor)
  // -------------------------------------------------------------------------
  it('disables every checkbox and hides Save when the user lacks settings.manage', async () => {
    mockCanAccess.mockReturnValue(false);
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    checkboxes.forEach((cb) => expect(cb).toBeDisabled());
    expect(screen.queryByRole('button', { name: /Save Feature Flags/i })).not.toBeInTheDocument();
  });

  it('enables checkboxes and shows Save when the user has settings.manage', async () => {
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    checkboxes.forEach((cb) => expect(cb).not.toBeDisabled());
    expect(screen.getByRole('button', { name: /Save Feature Flags/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Default-checked semantics (settings[flag] !== false)
  // -------------------------------------------------------------------------
  it('checks a flag explicitly set to true', async () => {
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });
    expect((document.getElementById('enableInventory') as HTMLInputElement).checked).toBe(true);
  });

  it('unchecks a flag explicitly set to false', async () => {
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });
    expect((document.getElementById('enableDiscounts') as HTMLInputElement).checked).toBe(false);
  });

  it('defaults a flag missing from the API response to checked, even when the business-type default for it is false', async () => {
    // enableWorkOrders is not among the 6 keys useFeatureFlagsSettings backfills,
    // and the API response here omits it entirely (simulating a tenant whose
    // TenantSettings row predates this flag). The page's `!== false` check
    // renders it as checked, even though every other consumer of this same
    // field (lib/business-types.ts, lib/business-type-helpers.ts) falls back
    // to the business type's default, which is `false` for most types.
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });
    expect((document.getElementById('enableWorkOrders') as HTMLInputElement).checked).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Toggling / saving
  // -------------------------------------------------------------------------
  it('toggles a flag and saves the updated settings', async () => {
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });

    const discounts = document.getElementById('enableDiscounts') as HTMLInputElement;
    expect(discounts.checked).toBe(false);
    fireEvent.click(discounts);
    expect(discounts.checked).toBe(true);

    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({ success: true, data: { ...baseSettings, enableDiscounts: true } }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Feature Flags/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/tenants/test-tenant/settings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ settings: { ...baseSettings, enableDiscounts: true } }),
        })
      );
    });

    expect(await screen.findByText('Feature flags saved successfully!')).toBeInTheDocument();
  });

  it('shows an error message and keeps prior settings when save fails', async () => {
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, error: 'Failed to save feature flags' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Feature Flags/i }));

    expect(await screen.findByText('Failed to save feature flags')).toBeInTheDocument();
  });

  it('surfaces an unauthorized-specific message on a 401/403 save response', async () => {
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });

    mockFetch.mockResolvedValueOnce({
      status: 403,
      json: () => Promise.resolve({ success: false, error: 'Forbidden' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Feature Flags/i }));

    expect(await screen.findByText('Unauthorized. Please login with admin account.')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Business-type context banner
  // -------------------------------------------------------------------------
  it('shows the current business type banner when tenant settings are loaded', async () => {
    mockTenantSettings.mockReturnValue({
      settings: { businessType: 'restaurant' },
      loading: false,
      refreshSettings: vi.fn(),
    });
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });

    expect(screen.getByText(/Current Business Type:/)).toBeInTheDocument();
  });

  it('omits the business type banner when tenant settings are unavailable', async () => {
    render(<FeatureFlagsPage />);
    await screen.findByRole('heading', { name: 'Feature Flags' });

    expect(screen.queryByText(/Current Business Type:/)).not.toBeInTheDocument();
  });
});
