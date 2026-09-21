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

describe('RolesPermissionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { overrides: {} } }),
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------
  it('shows an access-restricted message when the user lacks roles_permissions.manage', async () => {
    mockCanAccess.mockReturnValue(false);
    render(<RolesPermissionsPage />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Roles & Permissions' })).not.toBeInTheDocument();
  });

  it('renders the permission matrix when the user has access', async () => {
    render(<RolesPermissionsPage />);
    expect(await screen.findByRole('heading', { name: 'Roles & Permissions' })).toBeInTheDocument();
    // A known default-floor permission and role column should both render.
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Manager' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Default-floor rendering (roleAtLeast semantics — not exact-match)
  // -------------------------------------------------------------------------
  it('checks a cell by default when the role meets the permission floor, without any override', async () => {
    render(<RolesPermissionsPage />);
    await screen.findByRole('heading', { name: 'Roles & Permissions' });

    // dashboard.view has defaultMinRole 'viewer' — every overridable role (viewer/cashier/manager) is >= that floor.
    const row = screen.getByText('Dashboard').closest('tr')!;
    const checkboxes = row.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    checkboxes.forEach((cb) => expect((cb as HTMLInputElement).checked).toBe(true));
  });

  it('unchecks a cell by default when the role is below the permission floor', async () => {
    render(<RolesPermissionsPage />);
    await screen.findByRole('heading', { name: 'Roles & Permissions' });

    // reports.view has defaultMinRole 'manager' — viewer and cashier are below that floor.
    const row = screen.getByText('Reports').closest('tr')!;
    const checkboxes = Array.from(row.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(false); // viewer
    expect(checkboxes[1].checked).toBe(false); // cashier
    expect(checkboxes[2].checked).toBe(true); // manager
  });

  // -------------------------------------------------------------------------
  // Toggling / "(custom)" marker / dirty state
  // -------------------------------------------------------------------------
  it('marks a toggled cell "(custom)" and enables Save', async () => {
    render(<RolesPermissionsPage />);
    await screen.findByRole('heading', { name: 'Roles & Permissions' });

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    expect(saveButton).toBeDisabled();

    const row = screen.getByText('Reports').closest('tr')!;
    const viewerCheckbox = row.querySelectorAll('input[type="checkbox"]')[0];
    fireEvent.click(viewerCheckbox);

    expect((viewerCheckbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: /\(custom\)/i })).toBeInTheDocument();
    expect(saveButton).not.toBeDisabled();
  });

  it('toggling a cell back to its default value clears the override instead of leaving a redundant one', async () => {
    render(<RolesPermissionsPage />);
    await screen.findByRole('heading', { name: 'Roles & Permissions' });

    const row = screen.getByText('Reports').closest('tr')!;
    const viewerCheckbox = row.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;

    // viewer is below the 'manager' floor for reports.view -> starts unchecked (default).
    fireEvent.click(viewerCheckbox); // now checked, custom
    expect(screen.getByRole('button', { name: /\(custom\)/i })).toBeInTheDocument();

    fireEvent.click(viewerCheckbox); // back to unchecked -> matches default again
    expect(viewerCheckbox.checked).toBe(false);
    expect(screen.queryByRole('button', { name: /\(custom\)/i })).not.toBeInTheDocument();
  });

  it('resetToDefault clears an override via the (custom) link', async () => {
    render(<RolesPermissionsPage />);
    await screen.findByRole('heading', { name: 'Roles & Permissions' });

    const row = screen.getByText('Reports').closest('tr')!;
    const viewerCheckbox = row.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
    fireEvent.click(viewerCheckbox);

    fireEvent.click(screen.getByRole('button', { name: /\(custom\)/i }));
    expect(viewerCheckbox.checked).toBe(false);
    expect(screen.queryByRole('button', { name: /\(custom\)/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  it('saves overrides via PUT and disables Save again afterward', async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: { overrides: { viewer: { 'reports.view': true } } } }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: { overrides: {} } }) });
    });

    render(<RolesPermissionsPage />);
    await screen.findByRole('heading', { name: 'Roles & Permissions' });

    const row = screen.getByText('Reports').closest('tr')!;
    fireEvent.click(row.querySelectorAll('input[type="checkbox"]')[0]);

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/tenants/test-tenant/role-permissions',
      expect.objectContaining({ method: 'PUT' })
    ));
    await screen.findByText('Role permissions saved successfully');
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeDisabled();
  });

  it('shows an error message when the save request fails', async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve({ json: () => Promise.resolve({ success: false, error: 'Save failed' }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({ success: true, data: { overrides: {} } }) });
    });

    render(<RolesPermissionsPage />);
    await screen.findByRole('heading', { name: 'Roles & Permissions' });

    const row = screen.getByText('Reports').closest('tr')!;
    fireEvent.click(row.querySelectorAll('input[type="checkbox"]')[0]);
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    expect(await screen.findByText('Save failed')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Always-allowed roles are never shown as overridable
  // -------------------------------------------------------------------------
  it('never renders a column for admin, owner, or super_admin', async () => {
    render(<RolesPermissionsPage />);
    await screen.findByRole('heading', { name: 'Roles & Permissions' });

    expect(screen.queryByRole('columnheader', { name: /^Admin$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Owner$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Super Admin/i })).not.toBeInTheDocument();
  });
});
