import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// next/navigation's useParams is already globally mocked in __tests__/setup.ts
// to { tenant: 'test-tenant', lang: 'en' }.

const mockCanAccess = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: (key: string) => mockCanAccess(key), isAlwaysAllowed: false }),
}));

const mockRefreshSettings = vi.fn().mockResolvedValue(undefined);
vi.mock('@/contexts/TenantSettingsContext', () => ({
  useTenantSettings: () => ({ settings: null, loading: false, refreshSettings: mockRefreshSettings }),
}));

// Empty dict so every field falls back to its hardcoded English default text —
// keeps assertions independent of the real dictionaries/en.json content.
vi.mock('@/app/[tenant]/[lang]/dictionaries-client', () => ({
  getDictionaryClient: vi.fn().mockResolvedValue({}),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

import AdminSettingsPage from '@/app/[tenant]/[lang]/admin/settings/page';

const baseSettings = {
  companyName: 'Acme Store',
  businessType: 'retail',
  currency: 'PHP',
  currencySymbol: '₱',
  primaryColor: '#35979c',
  secondaryColor: '',
  logo: '',
  taxEnabled: false,
  taxRate: 0,
  taxLabel: 'VAT',
  lowStockAlert: true,
  lowStockThreshold: 10,
};

// A stable implementation (not `mockResolvedValueOnce`) so it survives the
// extra GET the page's `fetchSettings` fires when its `dict` dependency
// resolves shortly after mount, without desyncing a FIFO queue meant for a
// later PUT assertion.
function mockFetchImpl(getData: Record<string, unknown>, putData?: Record<string, unknown>) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return { json: async () => ({ success: true, data: putData ?? getData }) };
    }
    return { json: async () => ({ success: true, data: getData }) };
  });
}

function labelledInput(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  const input = label.parentElement?.querySelector('input');
  if (!input) throw new Error(`No input found next to label "${labelText}"`);
  return input as HTMLInputElement;
}

async function renderLoaded(canManage: boolean, data: Record<string, unknown> = baseSettings) {
  mockCanAccess.mockReturnValue(canManage);
  mockFetchImpl(data);
  render(<AdminSettingsPage />);
  await waitFor(() => expect(screen.queryByText(/Loading settings/i)).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockReset();
});

// ---------------------------------------------------------------------------
// Permission gating
// ---------------------------------------------------------------------------
describe('permission gating', () => {
  it('disables all inputs and hides Save when the user lacks settings.manage', async () => {
    await renderLoaded(false);

    expect(screen.getByText(/don't have permission to change settings/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument();

    const companyNameInput = screen.getByPlaceholderText('Your business name');
    expect(companyNameInput.closest('fieldset')).toBeDisabled();
  });

  it('enables editing and shows Save when the user has settings.manage', async () => {
    await renderLoaded(true);

    expect(screen.queryByText(/don't have permission to change settings/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your business name').closest('fieldset')).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Per-tab save scoping
// ---------------------------------------------------------------------------
describe('per-tab save scoping', () => {
  it('PUTs only the active (General) tab\'s fields', async () => {
    await renderLoaded(true);

    const companyNameInput = screen.getByPlaceholderText('Your business name');
    await userEvent.clear(companyNameInput);
    await userEvent.type(companyNameInput, 'New Name Co');

    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());

    const putCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, init]) => init?.method === 'PUT'
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1].body as string);

    expect(body).toHaveProperty('companyName', 'New Name Co');
    // Fields owned by other tabs must not be present in a General-tab save.
    expect(body).not.toHaveProperty('logo');
    expect(body).not.toHaveProperty('taxRate');
    expect(body).not.toHaveProperty('lowStockThreshold');
  });
});

// ---------------------------------------------------------------------------
// Unsaved-changes guard on tab switch
// ---------------------------------------------------------------------------
describe('unsaved changes guard', () => {
  it('prompts before switching tabs with a dirty field, and reverts on confirm', async () => {
    await renderLoaded(true);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const companyNameInput = screen.getByPlaceholderText('Your business name');
    await userEvent.clear(companyNameInput);
    await userEvent.type(companyNameInput, 'Dirty Value');

    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));

    expect(confirmSpy).toHaveBeenCalled();
    // Switched tabs — Branding's Logo URL field should now be visible.
    expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();

    // Switch back to General — the discarded edit should have reverted.
    await userEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.getByPlaceholderText('Your business name')).toHaveValue(baseSettings.companyName);

    confirmSpy.mockRestore();
  });

  it('does not prompt when cancelling leaves the user on the same tab with the edit intact', async () => {
    await renderLoaded(true);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const companyNameInput = screen.getByPlaceholderText('Your business name');
    await userEvent.clear(companyNameInput);
    await userEvent.type(companyNameInput, 'Dirty Value');

    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));

    expect(confirmSpy).toHaveBeenCalled();
    // Cancelled — should still be on General with the edit intact.
    expect(screen.getByPlaceholderText('Your business name')).toHaveValue('Dirty Value');
    expect(screen.queryByPlaceholderText('https://...')).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('does not prompt for a no-op click on the already-active tab', async () => {
    await renderLoaded(true);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const companyNameInput = screen.getByPlaceholderText('Your business name');
    await userEvent.type(companyNameInput, ' Inc');

    await userEvent.click(screen.getByRole('button', { name: 'General' }));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Validation added in this pass
// ---------------------------------------------------------------------------
describe('logo URL validation', () => {
  it('blocks a non-https logo URL on save', async () => {
    await renderLoaded(true);
    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));

    const logoInput = screen.getByPlaceholderText('https://...');
    fireEvent.change(logoInput, { target: { value: 'http://example.com/logo.png' } });

    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(mockToastError).toHaveBeenCalled();
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('blocks a javascript: scheme logo URL and does not render a preview', async () => {
    await renderLoaded(true);
    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));

    const logoInput = screen.getByPlaceholderText('https://...');
    fireEvent.change(logoInput, { target: { value: 'javascript:alert(1)' } });

    expect(screen.queryByAltText('Logo preview')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(mockToastError).toHaveBeenCalled();
  });

  it('accepts a valid https logo URL and renders a preview', async () => {
    await renderLoaded(true);
    await userEvent.click(screen.getByRole('button', { name: 'Branding' }));

    const logoInput = screen.getByPlaceholderText('https://...');
    fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });

    expect(screen.getByAltText('Logo preview')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe('receipt tab text length validation', () => {
  it('rejects a tax label over 32 characters', async () => {
    await renderLoaded(true);
    await userEvent.click(screen.getByRole('button', { name: 'Receipt' }));

    // Tax Rate/Label fields only render once Enable Tax is toggled on.
    await userEvent.click(screen.getByText('Enable Tax'));

    const taxLabelInput = labelledInput('Tax Label');
    fireEvent.change(taxLabelInput, { target: { value: 'X'.repeat(40) } });

    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(mockToastError).toHaveBeenCalled();
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
});

describe('low stock threshold range validation', () => {
  it('rejects a threshold above the 100000 cap', async () => {
    await renderLoaded(true);
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }));

    const label = screen.getByText('Low Stock Threshold (units)');
    const thresholdInput = label.parentElement!.querySelector('input') as HTMLInputElement;
    fireEvent.change(thresholdInput, { target: { value: '100001' } });

    await userEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(mockToastError).toHaveBeenCalled();
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
});

describe('currency symbol auto-fill', () => {
  it('updates the symbol field when the currency code changes', async () => {
    await renderLoaded(true);

    const symbolInput = labelledInput('Symbol');
    expect(symbolInput).toHaveValue('₱');

    const currencySelects = screen.getAllByRole('combobox');
    const currencySelect = currencySelects.find(el => within(el).queryByText(/US Dollar/i)) as HTMLSelectElement;
    await userEvent.selectOptions(currencySelect, 'USD');

    expect(symbolInput).toHaveValue('$');
  });
});
