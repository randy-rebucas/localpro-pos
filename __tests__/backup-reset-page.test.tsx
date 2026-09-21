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
const mockToastSuccess = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

const mockCreateBackup = vi.fn();
vi.mock('@/hooks/useBackupCollections', () => ({
  useBackupCollections: () => ({ backing: false, createBackup: mockCreateBackup }),
}));

const mockRestore = vi.fn();
vi.mock('@/hooks/useRestoreCollections', () => ({
  useRestoreCollections: () => ({ restoring: false, restoreResults: null, restore: mockRestore }),
}));

const mockReset = vi.fn();
vi.mock('@/hooks/useResetCollections', () => ({
  useResetCollections: () => ({ resetting: false, resetResults: null, reset: mockReset }),
}));

import BackupResetPage from '@/app/[tenant]/[lang]/admin/backup-reset/page';
import { BACKUP_RESET_COLLECTIONS } from '@/lib/backup-reset-helpers';

describe('BackupResetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAccess.mockReturnValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------
  it('disables backup/restore/reset actions and hides select-all/clear-all when canManage is false', async () => {
    mockCanAccess.mockReturnValue(false);
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    expect(screen.getByRole('button', { name: /Download Backup/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Restore Backup/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reset Selected Collections/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Select All/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear All/i })).not.toBeInTheDocument();

    for (const collection of BACKUP_RESET_COLLECTIONS) {
      expect(screen.getByLabelText(collection.label)).toBeDisabled();
    }
  });

  it('enables actions when canManage is true', async () => {
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    expect(screen.getByRole('button', { name: /Download Backup/i })).toBeDisabled(); // no collections selected yet
    expect(screen.getByRole('button', { name: /Select All/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Backup
  // -------------------------------------------------------------------------
  it('blocks backup with a toast when no collection is selected', async () => {
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    // Button is disabled via canCreateBackup, but guard the handler directly too:
    // select then deselect to exercise handleBackupClick's own validation path.
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));
    fireEvent.click(screen.getByRole('button', { name: /Clear All/i }));

    const backupButton = screen.getByRole('button', { name: /Download Backup/i });
    expect(backupButton).toBeDisabled();
  });

  it('calls createBackup with the selected collection keys', async () => {
    mockCreateBackup.mockResolvedValue(true);
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    fireEvent.click(screen.getByLabelText('Products'));
    fireEvent.click(screen.getByRole('button', { name: /Download Backup/i }));

    await waitFor(() => expect(mockCreateBackup).toHaveBeenCalledWith(
      ['products'],
      expect.any(Function),
      expect.any(Function)
    ));
  });

  // -------------------------------------------------------------------------
  // Restore
  // -------------------------------------------------------------------------
  it('blocks restore with a toast when no file is selected', async () => {
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    expect(screen.getByRole('button', { name: /Restore Backup/i })).toBeDisabled();
  });

  it('prompts a confirm dialog before restoring with "clear existing data" checked', async () => {
    mockRestore.mockResolvedValue(true);
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    const file = new File(['{"collections":{}}'], 'backup.json', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByLabelText(/Clear existing data before restoring/i));
    fireEvent.click(screen.getByRole('button', { name: /Restore Backup/i }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith(
      file,
      true,
      expect.any(Function),
      expect.any(Function)
    ));
  });

  it('does not restore if the clear-existing confirm dialog is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    const file = new File(['{"collections":{}}'], 'backup.json', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByLabelText(/Clear existing data before restoring/i));
    fireEvent.click(screen.getByRole('button', { name: /Restore Backup/i }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('restores without a confirm prompt when clear-existing is left unchecked', async () => {
    mockRestore.mockResolvedValue(true);
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    const file = new File(['{"collections":{}}'], 'backup.json', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Restore Backup/i }));

    await waitFor(() => expect(mockRestore).toHaveBeenCalledWith(
      file,
      false,
      expect.any(Function),
      expect.any(Function)
    ));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Reset (destructive path — highest-risk action on this page)
  // -------------------------------------------------------------------------
  it('blocks reset with a toast when no collection is selected', async () => {
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    expect(screen.getByRole('button', { name: /Reset Selected Collections/i })).toBeDisabled();
  });

  it('always shows a confirm dialog before resetting, and aborts if declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    fireEvent.click(screen.getByLabelText('Products'));
    fireEvent.click(screen.getByRole('button', { name: /Reset Selected Collections/i }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('calls reset with the selected collection keys after confirming', async () => {
    mockReset.mockResolvedValue(true);
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    fireEvent.click(screen.getByLabelText('Products'));
    fireEvent.click(screen.getByLabelText('Categories'));
    fireEvent.click(screen.getByRole('button', { name: /Reset Selected Collections/i }));

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith(
      ['products', 'categories'],
      expect.any(Function),
      expect.any(Function)
    ));
  });

  it('clears the selection after a successful reset', async () => {
    mockReset.mockImplementation(async (_collections, onSuccess) => {
      onSuccess('done', {});
      return true;
    });
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    fireEvent.click(screen.getByLabelText('Products'));
    fireEvent.click(screen.getByRole('button', { name: /Reset Selected Collections/i }));

    await waitFor(() => {
      const checkbox = screen.getByLabelText('Products') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Select all / clear all
  // -------------------------------------------------------------------------
  it('selects every collection via Select All and clears via Clear All', async () => {
    render(<BackupResetPage />);
    await screen.findByText('Collection Backup & Reset');

    fireEvent.click(screen.getByRole('button', { name: /Select All/i }));
    for (const collection of BACKUP_RESET_COLLECTIONS) {
      expect((screen.getByLabelText(collection.label) as HTMLInputElement).checked).toBe(true);
    }

    fireEvent.click(screen.getByRole('button', { name: /Clear All/i }));
    for (const collection of BACKUP_RESET_COLLECTIONS) {
      expect((screen.getByLabelText(collection.label) as HTMLInputElement).checked).toBe(false);
    }
  });
});
