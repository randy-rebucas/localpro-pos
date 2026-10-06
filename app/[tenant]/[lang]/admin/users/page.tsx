'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { useConfirm } from '@/lib/confirm';
import { useUsersList, type User } from '@/hooks/useUsersList';
import { useUserForm } from '@/hooks/useUserForm';
import { useQrCode } from '@/hooks/useQrCode';
import {
  getRoleLabel,
  getStatusClasses,
  getStatusLabel,
  getToggleActionLabel,
  getToggleActionClasses,
  getDeleteConfirmMessage,
  getRegenerateQRConfirmMessage,
  assignableRoles,
  canManageRole,
  USER_ROLES,
} from '@/lib/users-helpers';

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-brand-navy text-white',
  admin: 'bg-win8-accent text-white',
  manager: 'bg-win8-info text-white',
  cashier: 'bg-brand text-white',
  viewer: 'bg-gray-500 text-white',
};

const ICON_BUTTON =
  'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';

const ICONS = {
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18h2',
  edit: 'M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  deactivate: 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  activate: 'm5 12 5 5L20 7',
  delete: 'M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z',
  close: 'M6 18 18 6M6 6l12 12',
} as const;

function Icon({ path, className = 'w-4 h-4' }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span className={`win8-spinner ${small ? 'win8-spinner-sm' : 'text-brand mx-auto'}`}>
      <span /><span /><span /><span /><span />
    </span>
  );
}

export default function UsersPage() {
  const params = useParams();
  const router = useRouter(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  // Drawer subjects stay set after close so the header doesn't blank during the slide-out;
  // the key counters remount the drawer contents (fresh form state / QR fetch) on every open.
  const [formOpen, setFormOpen] = useState(false);
  const [formUser, setFormUser] = useState<User | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUser, setQrUser] = useState<User | null>(null);
  const [qrKey, setQrKey] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { user: currentUser } = useAuth();
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const { users, loading, error, fetchUsers, deleteUser, toggleUserStatus } = useUsersList();
  const { canAccess } = usePermissions();
  const canCreate = canAccess('users.create');
  // Edit, activate/deactivate and QR regeneration are edits to the user.
  const canEdit = canAccess('users.edit');
  const canDelete = canAccess('users.delete');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchUsers((error) => toast.error(error));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const openForm = (user: User | null) => {
    setFormUser(user);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const openQr = (user: User) => {
    setQrUser(user);
    setQrKey((k) => k + 1);
    setQrOpen(true);
  };

  const handleDeleteUser = useCallback(
    async (user: User) => {
      if (!dict) return;

      const fallback = getDeleteConfirmMessage(dict);
      const message = dict.admin?.deleteUserNamedConfirm
        ? dict.admin.deleteUserNamedConfirm.replace('{name}', user.name)
        : fallback.message;
      const confirmed = await confirm(fallback.title, message, {
        variant: 'danger',
        confirmText: dict.common?.delete || 'Delete',
        cancelText: dict.common?.cancel || 'Cancel',
      });
      if (!confirmed) return;

      setBusyId(user._id);
      await deleteUser(
        user._id,
        (message) => {
          toast.success(message);
        },
        (error) => toast.error(error)
      );
      setBusyId(null);
    },
    [dict, deleteUser, confirm]
  );

  const handleToggleUserStatus = useCallback(
    async (user: User) => {
      if (user.isActive) {
        const confirmed = await confirm(
          dict?.admin?.deactivateUserTitle || 'Deactivate User',
          (dict?.admin?.deactivateUserConfirm || 'Deactivate user "{name}"? They will lose access immediately.').replace('{name}', user.name),
          {
            variant: 'danger',
            confirmText: dict?.admin?.deactivate || 'Deactivate',
            cancelText: dict?.common?.cancel || 'Cancel',
          }
        );
        if (!confirmed) return;
      }

      setBusyId(user._id);
      await toggleUserStatus(
        user,
        (message) => {
          toast.success(message);
        },
        (error) => toast.error(error)
      );
      setBusyId(null);
    },
    [dict, toggleUserStatus, confirm]
  );

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const hasFilters = query !== '' || roleFilter !== '';
  const filteredUsers = users.filter(
    (u) =>
      (!roleFilter || u.role === roleFilter) &&
      (!query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
  );

  const columns = [
    dict.admin?.name || 'Name',
    dict.admin?.email || 'Email',
    dict.admin?.role || 'Role',
    dict.admin?.status || 'Status',
  ];

  const renderBody = () => {
    if (loading && users.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <Spinner />
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingUsers || 'Loading users…'}</p>
        </div>
      );
    }

    if (error && users.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchUsers()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (filteredUsers.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noUsersMatch || 'No users match your filters.')
            : (dict.admin?.noUsersYet || 'No users yet.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              {columns.map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
              ))}
              <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredUsers.map((user) => {
              const isSelf = currentUser?._id === user._id;
              const manageable = canEdit && canManageRole(currentUser?.role ?? '', user.role);
              const busy = busyId === user._id;
              const toggleLabel = getToggleActionLabel(user.isActive, dict);
              return (
                <tr key={user._id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{user.name}</span>
                    {isSelf && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-gray-500 text-white">
                        {dict.admin?.youLabel || 'You'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{user.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${ROLE_BADGE[user.role] || 'bg-gray-500 text-white'}`}>
                      {getRoleLabel(user.role, dict)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusClasses(user.isActive)}`}>
                      {getStatusLabel(user.isActive, dict)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openQr(user)}
                        title={dict.admin?.viewQRCode || 'View QR Code'}
                        aria-label={dict.admin?.viewQRCode || 'View QR Code'}
                        className={`${ICON_BUTTON} bg-win8-info`}
                      >
                        <Icon path={ICONS.qr} />
                      </button>
                      {manageable && (
                        <button
                          type="button"
                          onClick={() => openForm(user)}
                          title={dict.common?.edit || 'Edit'}
                          aria-label={dict.common?.edit || 'Edit'}
                          className={`${ICON_BUTTON} bg-brand`}
                        >
                          <Icon path={ICONS.edit} />
                        </button>
                      )}
                      {manageable && !isSelf && (
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(user)}
                          disabled={busy}
                          title={toggleLabel}
                          aria-label={toggleLabel}
                          className={`${ICON_BUTTON} ${getToggleActionClasses(user.isActive)}`}
                        >
                          {busy ? <Spinner small /> : <Icon path={user.isActive ? ICONS.deactivate : ICONS.activate} />}
                        </button>
                      )}
                      {canDelete && !isSelf && canManageRole(currentUser?.role ?? '', user.role) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          disabled={busy}
                          title={dict.common?.delete || 'Delete'}
                          aria-label={dict.common?.delete || 'Delete'}
                          className={`${ICON_BUTTON} bg-win8-danger`}
                        >
                          <Icon path={ICONS.delete} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      {ConfirmDialog}
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.users || 'Users'}
          description={dict.admin?.usersSubtitle || 'Manage system users and their permissions'}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <div className="flex gap-3 flex-wrap">
              <div className="relative">
                <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={dict.admin?.searchUsers || 'Search by name or email…'}
                  aria-label={dict.admin?.searchUsers || 'Search by name or email…'}
                  className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label={dict.admin?.filterByRole || 'Filter by role'}
                className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
              >
                <option value="">{dict.admin?.allRoles || 'All roles'}</option>
                {USER_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {getRoleLabel(role.value, dict)}
                  </option>
                ))}
              </select>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => openForm(null)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                + {dict.admin?.addUser || 'Add User'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={formOpen} onClose={() => setFormOpen(false)} widthClass="max-w-md">
        <UserForm
          key={formKey}
          user={formUser}
          currentUserRole={currentUser?.role ?? ''}
          onClose={() => setFormOpen(false)}
          onSave={() => {
            fetchUsers();
            setFormOpen(false);
          }}
          dict={dict}
        />
      </Win8Drawer>

      <Win8Drawer open={qrOpen} onClose={() => setQrOpen(false)} widthClass="max-w-md">
        {qrUser && (
          <QRPanel
            key={qrKey}
            user={qrUser}
            canManage={canEdit}
            onClose={() => setQrOpen(false)}
            onRegenerate={() => {
              fetchUsers();
            }}
            dict={dict}
          />
        )}
      </Win8Drawer>
    </>
  );
}

function DrawerHeader({ title, onClose, closeLabel }: { title: string; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
      <h2 className="text-base font-semibold truncate">{title}</h2>
      <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
        <Icon path={ICONS.close} className="w-5 h-5" />
      </button>
    </div>
  );
}

function UserForm({
  user,
  currentUserRole,
  onClose,
  onSave,
  dict,
}: {
  user: User | null;
  currentUserRole: string;
  onClose: () => void;
  onSave: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { formData, setFormData, saving, error, handleSubmit: submitForm } = useUserForm(user);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(
      () => {
        onSave();
      },
      () => {
        // Error is shown inline at the bottom of the drawer body
      }
    );
  };

  return (
    <>
      <DrawerHeader
        title={user ? (dict.admin?.editUser || 'Edit User') : (dict.admin?.addUser || 'Add User')}
        onClose={onClose}
        closeLabel={dict.common?.close || 'Close'}
      />
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label htmlFor="user-email" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.email || 'Email'} <span className="text-win8-danger">*</span>
            </label>
            <input
              id="user-email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="user-name" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.name || 'Name'} <span className="text-win8-danger">*</span>
            </label>
            <input
              id="user-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="user-password" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.password || 'Password'} {!user && <span className="text-win8-danger">*</span>}
            </label>
            <input
              id="user-password"
              type="password"
              required={!user}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
            {user && (
              <p className="text-xs text-gray-400 mt-1">
                {dict.admin?.leaveBlankPassword || 'leave blank to keep current'}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="user-role" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.role || 'Role'}
            </label>
            <select
              id="user-role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
              className="w-full border border-gray-300 px-3 py-2 text-sm bg-white"
            >
              {assignableRoles(currentUserRole).map((role) => (
                <option key={role.value} value={role.value}>
                  {getRoleLabel(role.value, dict)}
                </option>
              ))}
            </select>
          </div>
          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
          >
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving
              ? (dict.common?.saving || 'Saving…')
              : user
                ? (dict.admin?.saveChanges || 'Save Changes')
                : (dict.admin?.addUser || 'Add User')}
          </button>
        </div>
      </form>
    </>
  );
}

function QRPanel({
  user,
  canManage,
  onClose,
  onRegenerate,
  dict,
}: {
  user: User;
  canManage: boolean;
  onClose: () => void;
  onRegenerate: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { qrData, loading, regenerating, error, fetchQRCode, regenerateQRCode } = useQrCode(user._id);
  const { confirm, Dialog } = useConfirm();

  useEffect(() => {
    fetchQRCode((error) => toast.error(error));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user._id]);

  const handleRegenerate = async () => {
    if (!dict) return;

    const { title, message } = getRegenerateQRConfirmMessage(dict);
    const confirmed = await confirm(title, message, {
      variant: 'warning',
      confirmText: dict?.admin?.regenerateQRCode || 'Regenerate QR Code',
      cancelText: dict?.common?.cancel || 'Cancel',
    });
    if (!confirmed) return;

    await regenerateQRCode(
      () => {
        onRegenerate();
        toast.success(dict?.admin?.qrCodeRegenerated || 'QR code regenerated successfully');
      },
      (error) => toast.error(error)
    );
  };

  return (
    <>
      {Dialog}
      <DrawerHeader
        title={`${dict?.admin?.qrCodeFor || 'QR Code for'} ${user.name}`}
        onClose={onClose}
        closeLabel={dict.common?.close || 'Close'}
      />
      <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
        {loading ? (
          <div className="text-center py-12">
            <Spinner />
            <p className="mt-3 text-gray-400 text-sm">{dict?.admin?.loadingQRCode || 'Loading QR code…'}</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">
                <p>{error}</p>
                {!qrData && (
                  <button
                    type="button"
                    onClick={() => fetchQRCode()}
                    className="mt-3 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
                  >
                    {dict.common?.retry || 'Retry'}
                  </button>
                )}
              </div>
            )}
            {qrData && <QRCodeDisplay qrToken={qrData.qrToken} name={qrData.name} />}
          </>
        )}
      </div>
      <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
        >
          {dict.common?.close || 'Close'}
        </button>
        {canManage && qrData && (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="px-4 py-2 bg-win8-warning text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-[filter]"
          >
            {regenerating ? (dict?.admin?.regenerating || 'Regenerating…') : (dict?.admin?.regenerateQRCode || 'Regenerate QR Code')}
          </button>
        )}
      </div>
    </>
  );
}
