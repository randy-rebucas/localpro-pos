import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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

const mockFetchConfig = vi.fn();
vi.mock('@/hooks/useLoyaltyConfig', () => ({
  useLoyaltyConfig: () => ({
    config: { pointsPerPeso: 1, pesoPerPoint: 0.1, minRedemption: 100, isEnabled: true },
    configForm: { pointsPerPeso: 1, pesoPerPoint: 0.1, minRedemption: 100, isEnabled: true },
    loading: false,
    saving: false,
    dirty: false,
    fetchConfig: mockFetchConfig,
    updateConfigForm: vi.fn(),
    saveConfig: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLoyaltyCustomers', () => ({
  useLoyaltyCustomers: () => ({
    customers: [
      { _id: 'c1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', loyaltyPointsBalance: 500, isActive: true },
    ],
    search: '',
    page: 1,
    totalPages: 1,
    totalCustomers: 1,
    enrolledCount: 1,
    totalPoints: 500,
    loading: false,
    setSearch: vi.fn(),
    setPage: vi.fn(),
  }),
}));

import LoyaltyPage from '@/app/[tenant]/[lang]/admin/loyalty/page';

describe('LoyaltyPage currency display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
  });

  it('formats peso amounts using the tenant\'s configured currency, not a hardcoded ₱', async () => {
    mockTenantSettings.mockReturnValue({
      settings: {
        currency: 'USD',
        currencySymbol: '$',
        currencyPosition: 'before',
        numberFormat: { decimalSeparator: '.', thousandsSeparator: ',', decimalPlaces: 2 },
      },
      loading: false,
      refreshSettings: vi.fn(),
    });

    render(<LoyaltyPage />);
    await screen.findByRole('heading', { name: 'Loyalty Program' });

    // config.pesoPerPoint = 0.1, totalPoints = 500 -> estimated liability = $50
    // (formatCurrency/formatNumber strips trailing zeros; rendered twice: the
    // stats card and the per-customer Est. Value column)
    expect(screen.getAllByText('$50').length).toBe(2);
    expect(screen.getByText('Points per $1 spent')).toBeInTheDocument();
    expect(screen.getByText('$ value per point')).toBeInTheDocument();
    expect(screen.queryByText(/₱/)).not.toBeInTheDocument();
  });

  it('falls back to ₱ while tenant settings are still loading', async () => {
    mockTenantSettings.mockReturnValue({ settings: null, loading: true, refreshSettings: vi.fn() });

    render(<LoyaltyPage />);
    await screen.findByRole('heading', { name: 'Loyalty Program' });

    expect(screen.getAllByText('₱50.00').length).toBe(2);
  });
});
