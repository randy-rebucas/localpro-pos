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

import MultiCurrencyPage from '@/app/[tenant]/[lang]/admin/multi-currency/page';

const mockFetch = vi.fn();

// The flat shape GET /api/tenants/{tenant}/settings actually returns (Prisma
// TenantSettings columns) — not the nested `multiCurrency` object the page
// consumes. See hooks/useMultiCurrencySettings.ts's reshapeMultiCurrency.
const flatSettingsResponse = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    companyName: 'Acme',
    currency: 'PHP',
    currencySymbol: '₱',
    multiCurrencyEnabled: true,
    displayCurrencies: ['USD', 'EUR'],
    exchangeRateSource: 'api',
    exchangeRateApiKeyConfigured: false,
    exchangeRateLastUpdated: null,
    suggestedCurrency: null,
    ...overrides,
  },
});

const exchangeRatesResponse = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: { exchangeRates: { USD: 1, EUR: 0.92 }, lastUpdated: '2026-01-01T00:00:00.000Z', ...overrides },
});

function routeFetch(opts: {
  settingsGet?: unknown;
  settingsPut?: unknown;
  ratesGet?: unknown;
  ratesPost?: unknown;
} = {}) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/exchange-rates')) {
      if (init?.method === 'POST') {
        const body = init.body ? JSON.parse(init.body as string) : {};
        if (body.action === 'fetch') {
          return Promise.resolve({ json: () => Promise.resolve(opts.ratesPost ?? exchangeRatesResponse()) });
        }
        return Promise.resolve({ json: () => Promise.resolve(opts.ratesPost ?? { success: true, data: { exchangeRates: body.exchangeRates, lastUpdated: '2026-01-02T00:00:00.000Z' } }) });
      }
      return Promise.resolve({ json: () => Promise.resolve(opts.ratesGet ?? exchangeRatesResponse()) });
    }
    if (url.includes('/settings')) {
      if (init?.method === 'PUT') {
        const body = init.body ? JSON.parse(init.body as string) : {};
        return Promise.resolve({
          json: () =>
            Promise.resolve(
              opts.settingsPut ?? {
                success: true,
                data: { companyName: 'Acme', ...body.settings },
              }
            ),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve(opts.settingsGet ?? flatSettingsResponse()) });
    }
    return Promise.resolve({ json: () => Promise.resolve({ success: true, data: {} }) });
  });
}

describe('MultiCurrencyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
    vi.stubGlobal('fetch', mockFetch);
    routeFetch();
  });

  // -------------------------------------------------------------------------
  // Flat-vs-nested shape regression
  // -------------------------------------------------------------------------
  it('reads settings back from the flat GET response instead of showing hardcoded defaults', async () => {
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    // exchangeRateSource: 'api' came back flat (not nested under multiCurrency);
    // if the page fell back to its hardcoded default, this would render 'Manual Entry' instead.
    expect(screen.getByRole('combobox')).toHaveValue('api');
    // displayCurrencies: ['USD','EUR'] came back flat too — if defaulted to [],
    // the "no display currencies" banner would show and no rate rows would render.
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.queryByText(/No display currencies configured/i)).not.toBeInTheDocument();
  });

  it('shows the empty-state banner when displayCurrencies is genuinely empty', async () => {
    routeFetch({ settingsGet: flatSettingsResponse({ displayCurrencies: [] }) });
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    expect(await screen.findByText(/No display currencies configured/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Base currency display + country-based suggestion
  // -------------------------------------------------------------------------
  it('shows the tenant\'s configured base currency', async () => {
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    expect(screen.getByText('PHP (₱)')).toBeInTheDocument();
  });

  it('offers a one-click suggestion when the country-derived currency differs from the current base currency', async () => {
    routeFetch({
      settingsGet: flatSettingsResponse({
        currency: 'USD',
        currencySymbol: '$',
        suggestedCurrency: { currency: 'PHP', countryName: 'Philippines' },
      }),
    });
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    expect(await screen.findByText(/Philippines.*commonly uses PHP/)).toBeInTheDocument();
    const useButton = screen.getByRole('button', { name: 'Use PHP' });

    fireEvent.click(useButton);

    // Staged locally, not auto-saved — the admin still has to click Save Settings.
    expect(screen.getByText('PHP (₱)')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalledWith('/api/tenants/test-tenant/settings', expect.objectContaining({ method: 'PUT' }));
  });

  it('hides the suggestion once the base currency already matches it', async () => {
    routeFetch({
      settingsGet: flatSettingsResponse({
        currency: 'PHP',
        currencySymbol: '₱',
        suggestedCurrency: { currency: 'PHP', countryName: 'Philippines' },
      }),
    });
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    expect(screen.queryByText(/commonly uses/)).not.toBeInTheDocument();
  });

  it('hides the suggestion\'s "Use" button (but keeps the text) when the user lacks settings.manage', async () => {
    mockCanAccess.mockReturnValue(false);
    routeFetch({
      settingsGet: flatSettingsResponse({
        currency: 'USD',
        suggestedCurrency: { currency: 'PHP', countryName: 'Philippines' },
      }),
    });
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    expect(await screen.findByText(/commonly uses PHP/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use PHP' })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Exchange rates load from their own table on mount
  // -------------------------------------------------------------------------
  it('loads previously-saved exchange rates on mount instead of rendering blank inputs', async () => {
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tenants/test-tenant/exchange-rates',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    const usdInput = screen.getByText('USD').closest('div')!.querySelector('input') as HTMLInputElement;
    await waitFor(() => expect(usdInput.value).toBe('1'));
  });

  // -------------------------------------------------------------------------
  // API key masking
  // -------------------------------------------------------------------------
  it('never prefills the API key field, and shows a distinct placeholder when one is already configured', async () => {
    routeFetch({ settingsGet: flatSettingsResponse({ exchangeRateApiKeyConfigured: true }) });
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    const apiKeyInput = screen.getByPlaceholderText('Key is configured — leave blank to keep it') as HTMLInputElement;
    expect(apiKeyInput.value).toBe('');
    expect(apiKeyInput.type).toBe('password');
  });

  it('shows the generic placeholder when no key is configured yet', async () => {
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });
    expect(screen.getByPlaceholderText('API key for exchange rate service')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------
  it('disables the fieldset and hides Save when the user lacks settings.manage', async () => {
    mockCanAccess.mockReturnValue(false);
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });

    const fieldset = document.querySelector('fieldset') as HTMLFieldSetElement;
    expect(fieldset).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Save Settings/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Save: manual-rate persistence (would otherwise be silently dropped)
  // -------------------------------------------------------------------------
  it('persists manually-entered rates via the exchange-rates endpoint on save (settings PUT alone cannot)', async () => {
    routeFetch({ settingsGet: flatSettingsResponse({ exchangeRateSource: 'manual' }) });
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/tenants/test-tenant/exchange-rates', expect.objectContaining({ credentials: 'include' })));

    const usdInput = screen.getByText('USD').closest('div')!.querySelector('input') as HTMLInputElement;
    fireEvent.change(usdInput, { target: { value: '58.5' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tenants/test-tenant/exchange-rates',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"action":"update"'),
        })
      );
    });
    expect(await screen.findByText('Multi-currency settings saved successfully!')).toBeInTheDocument();
  });

  it('does not call the exchange-rates endpoint on save when the source is API-driven', async () => {
    render(<MultiCurrencyPage />); // exchangeRateSource: 'api' by default in flatSettingsResponse
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/tenants/test-tenant/exchange-rates', expect.objectContaining({ credentials: 'include' })));

    mockFetch.mockClear();
    routeFetch({ settingsGet: flatSettingsResponse() });

    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/tenants/test-tenant/settings', expect.objectContaining({ method: 'PUT' }));
    });
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/tenants/test-tenant/exchange-rates',
      expect.objectContaining({ method: 'POST' })
    );
  });

  // -------------------------------------------------------------------------
  // Fetch Latest Rates (API mode)
  // -------------------------------------------------------------------------
  it('fetches and applies the latest rates from the provider', async () => {
    render(<MultiCurrencyPage />);
    await screen.findByRole('heading', { name: 'Multi-Currency Management' });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/tenants/test-tenant/exchange-rates', expect.objectContaining({ credentials: 'include' })));

    mockFetch.mockImplementationOnce((url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      expect(body.action).toBe('fetch');
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            success: true,
            data: { exchangeRates: { USD: 1, EUR: 0.95 }, lastUpdated: '2026-03-01T00:00:00.000Z' },
          }),
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /Fetch Latest Rates/i }));

    expect(await screen.findByText('Exchange rates updated successfully')).toBeInTheDocument();
  });
});
