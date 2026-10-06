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

import RolesPermissionsPage from '@/app/[tenant]/[lang]/admin/roles-permissions/page';

const mockFetch = vi.fn();

const okOverrides = (overrides: Record<string, Record<string, boolean>> = {}) => ({
  json: () => Promise.resolve({ success: true, data: { overrides } }),
});

// Accessible names: action cells are "{Role}: {Feature} — {Action}", feature
// checkboxes "{Role}: {Feature} — all actions", single-action rows "{Role}: {Feature}".
// A custom (overridden) cell appends " (custom)".
const box = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(custom\\))?$`) }) as HTMLInputElement;
const expand = (feature: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${feature}\\b`) }));

async function renderLoaded() {
  render(<RolesPermissionsPage />);
  await screen.findByRole('heading', { name: 'Roles & Permissions' });
}

describe('RolesPermissionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
    mockFetch.mockResolvedValue(okOverrides());
    vi.stubGlobal('fetch', mockFetch);
  });

  // -------------------------------------------------------------------------
  // Access
  // -------------------------------------------------------------------------
  it('shows an access-restricted message when the user lacks roles_permissions.manage', async () => {
    mockCanAccess.mockReturnValue(false);
    render(<RolesPermissionsPage />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Roles & Permissions' })).not.toBeInTheDocument();
  });

  it('never renders a column for admin, owner, or super_admin', async () => {
    await renderLoaded();
    expect(screen.getByRole('columnheader', { name: 'Manager' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Admin$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Owner$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Super Admin/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Tree structure
  // -------------------------------------------------------------------------
  it('renders single-action features as one flat row', async () => {
    await renderLoaded();
    // dashboard.view floor is viewer → on for every overridable role.
    for (const role of ['Viewer', 'Cashier', 'Manager']) expect(box(`${role}: Dashboard`).checked).toBe(true);
    expect(screen.queryByRole('button', { name: /^Dashboard\b/ })).not.toBeInTheDocument();
  });

  it('collapses multi-action features by default and expands them to one row per action', async () => {
    await renderLoaded();
    const toggle = screen.getByRole('button', { name: /^Products\b/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: /^Cashier: Products — Create/ })).not.toBeInTheDocument();

    expand('Products');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const action of ['View', 'Create', 'Edit', 'Delete', 'Restock']) {
      expect(box(`Cashier: Products — ${action}`)).toBeInTheDocument();
    }
  });

  it('shows each action at its own default floor', async () => {
    await renderLoaded();
    expand('Reports');
    // reports.view floor manager; reports.x_reading floor cashier.
    expect(box('Viewer: Reports — View').checked).toBe(false);
    expect(box('Cashier: Reports — View').checked).toBe(false);
    expect(box('Manager: Reports — View').checked).toBe(true);
    expect(box('Cashier: Reports — X-Reading report').checked).toBe(true);
    expect(box('Cashier: Reports — Z-Reading report').checked).toBe(false);
  });

  it('shows POS-critical reads as locked, always-on rows', async () => {
    await renderLoaded();
    expand('Products');
    const view = box('Viewer: Products — View');
    expect(view.checked).toBe(true);
    expect(view).toBeDisabled();
    expect(screen.getByText('Always on')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Editing actions
  // -------------------------------------------------------------------------
  it('granting one action marks it custom, makes the feature row partial, and enables Save', async () => {
    await renderLoaded();
    const save = screen.getByRole('button', { name: /Save Changes/i });
    expect(save).toBeDisabled();

    expand('Products');
    const create = box('Cashier: Products — Create');
    expect(create.checked).toBe(false);
    fireEvent.click(create);

    expect(create.checked).toBe(true);
    expect(create).toHaveAttribute('data-custom', 'true');
    expect(create).toHaveAccessibleName('Cashier: Products — Create (custom)');
    const feature = box('Cashier: Products — all actions');
    expect(feature.indeterminate).toBe(true);
    expect(feature.checked).toBe(false);
    expect(save).not.toBeDisabled();
  });

  it('clicking a custom action again restores the default and clears the override', async () => {
    await renderLoaded();
    expand('Products');
    const create = box('Cashier: Products — Create');
    fireEvent.click(create);
    fireEvent.click(create);

    expect(create.checked).toBe(false);
    expect(create).not.toHaveAttribute('data-custom');
    expect(create).toHaveAccessibleName('Cashier: Products — Create');
  });

  it('the feature checkbox grants every action, then revokes them all', async () => {
    await renderLoaded();
    expand('Products');
    const feature = box('Cashier: Products — all actions');

    fireEvent.click(feature);
    for (const action of ['Create', 'Edit', 'Delete', 'Restock']) expect(box(`Cashier: Products — ${action}`).checked).toBe(true);
    expect(feature.checked).toBe(true);

    fireEvent.click(feature);
    for (const action of ['Create', 'Edit', 'Delete', 'Restock']) expect(box(`Cashier: Products — ${action}`).checked).toBe(false);
    // Locked View is untouched.
    expect(box('Cashier: Products — View').checked).toBe(true);
  });

  it('revoking View also revokes the feature’s other actions', async () => {
    await renderLoaded();
    expand('Bookings');
    // bookings.* floor cashier → all on for cashier.
    fireEvent.click(box('Cashier: Bookings — View'));
    for (const action of ['View', 'Create', 'Edit', 'Delete']) expect(box(`Cashier: Bookings — ${action}`).checked).toBe(false);
  });

  it('granting an action also grants View', async () => {
    await renderLoaded();
    expand('Bookings');
    expect(box('Viewer: Bookings — View').checked).toBe(false);
    fireEvent.click(box('Viewer: Bookings — Edit'));
    expect(box('Viewer: Bookings — Edit').checked).toBe(true);
    expect(box('Viewer: Bookings — View').checked).toBe(true);
  });

  it('marks overrides loaded from the server as custom and counts them on the feature row', async () => {
    mockFetch.mockResolvedValue(okOverrides({ cashier: { 'products.create': true } }));
    await renderLoaded();
    expect(screen.getByRole('button', { name: /^Products\b/ })).toHaveTextContent('1');

    expand('Products');
    expect(box('Cashier: Products — Create')).toHaveAttribute('data-custom', 'true');
    expect(box('Viewer: Products — Create')).not.toHaveAttribute('data-custom');
    expect(screen.getByText('1 custom override(s)')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Toolbar
  // -------------------------------------------------------------------------
  it('search filters features and auto-expands matches', async () => {
    await renderLoaded();
    fireEvent.change(screen.getByRole('textbox', { name: /Search features or actions/ }), { target: { value: 'restock' } });

    expect(box('Cashier: Products — Restock')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Cashier: Dashboard$/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /Search features or actions/ }), { target: { value: 'zzz' } });
    expect(screen.getByText('No features or actions match your search.')).toBeInTheDocument();
  });

  it('expand all / collapse all', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(box('Cashier: Bookings — Create')).toBeInTheDocument();
    expect(box('Cashier: Products — Restock')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByRole('checkbox', { name: /^Cashier: Products — Restock/ })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Save / load
  // -------------------------------------------------------------------------
  it('saves per-action overrides via PUT and disables Save again afterward', async () => {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve(okOverrides({ cashier: { 'products.delete': true } }));
      }
      return Promise.resolve(okOverrides());
    });
    await renderLoaded();
    expand('Products');
    fireEvent.click(box('Cashier: Products — Delete'));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tenants/test-tenant/role-permissions',
        expect.objectContaining({ method: 'PUT' })
      )
    );
    const put = mockFetch.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(JSON.parse(put[1].body)).toEqual({ overrides: { cashier: { 'products.delete': true } } });
    await screen.findByText('Role permissions saved successfully');
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeDisabled();
  });

  it('shows an error message when the save request fails', async () => {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({ json: () => Promise.resolve({ success: false, error: 'Save failed' }) });
      }
      return Promise.resolve(okOverrides());
    });
    await renderLoaded();
    expand('Products');
    fireEvent.click(box('Cashier: Products — Delete'));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    expect(await screen.findByText('Save failed')).toBeInTheDocument();
  });

  it('loads overrides once — the dictionary arriving does not trigger a refetch', async () => {
    await renderLoaded();
    await screen.findByRole('table');
    const gets = mockFetch.mock.calls.filter(([url, init]) => String(url).includes('/role-permissions') && !init?.method);
    expect(gets).toHaveLength(1);
  });

  it('shows a retry-able error instead of the tree when loading overrides fails', async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ success: false, error: 'boom' }) });
    render(<RolesPermissionsPage />);

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save Changes/i })).not.toBeInTheDocument();

    mockFetch.mockResolvedValue(okOverrides());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // i18n
  // -------------------------------------------------------------------------
  it('renders feature, action and section names from the dictionary', async () => {
    const { getDictionaryClient } = await import('@/app/[tenant]/[lang]/dictionaries-client');
    (getDictionaryClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      admin: { roleLabelCashier: 'Cajero' },
      permissions: {
        sections: { catalog: 'Catálogo' },
        features: { products: 'Productos' },
        actions: { create: 'Crear' },
      },
    });
    render(<RolesPermissionsPage />);
    await screen.findByText('Catálogo');

    expand('Productos');
    expect(screen.getByRole('checkbox', { name: 'Cajero: Productos — Crear' })).toBeInTheDocument();
    // Untranslated names fall back to the English in lib/permissions.ts.
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
