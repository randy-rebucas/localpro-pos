'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { IdCard, Pencil, Plus, Power, QrCode, Search, Trash2, UserRound } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import {
  ICON, DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, HINT, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/formatting';
import { useUsersList, type User } from '@/hooks/useUsersList';
import { useUserForm } from '@/hooks/useUserForm';
import { useQrCode } from '@/hooks/useQrCode';
import { USER_ROLES, getRoleLabel, assignableRoles, canManageRole, type UserRole } from '@/lib/users-helpers';

/** A dark key while it is switched on. */
const DARK_KEY_ON = 'flex min-h-[44px] items-center justify-center gap-2 border border-paper-white bg-paper-white px-4 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink touch-manipulation';

/** The band across the top of each staff badge, darker the more the role can do. */
const ROLE_BAND: Record<UserRole, string> = {
  owner: 'bg-ink text-paper-white',
  admin: 'bg-brand-navy text-paper-white',
  manager: 'bg-brand text-ink',
  cashier: 'bg-[#8fe3d0] text-ink',
  viewer: 'bg-ink/10 text-ink',
};

type RoleFilter = UserRole | 'all';

export default function UsersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [sheetUser, setSheetUser] = useState<User | null | undefined>(undefined); // undefined: closed, null: new user
  const [badgeUser, setBadgeUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { user: currentUser } = useAuth();
  const { settings } = useTenantSettings();
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const { users, loading, fetchUsers, deleteUser, toggleUserStatus } = useUsersList();
  const { canAccess } = usePermissions();
  const canManage = canAccess('users.manage');
  const canDelete = canAccess('users.delete');
  const myRole = currentUser?.role ?? '';

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    // The list endpoint needs users.manage, so do not ask for it (and toast a 403) without it.
    if (canManage) fetchUsers((error) => toast.error(error));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, canManage]);

  const t = useCallback((key: string, fallback: string) => dict?.admin?.[key] || fallback, [dict]);

  const handleToggle = async (user: User) => {
    if (user.isActive) {
      const ok = await confirm(
        t('deactivateUserTitle', 'Deactivate {name}?').replace('{name}', user.name),
        t('deactivateUserConfirm', 'They are signed out on every device and cannot sign in until you activate them again.'),
        { variant: 'warning', confirmText: t('deactivate', 'Deactivate'), cancelText: dict?.common?.cancel || 'Cancel' }
      );
      if (!ok) return;
    }
    setBusyId(user._id);
    await toggleUserStatus(
      user,
      () => toast.success(user.isActive ? t('userDeactivated', 'User deactivated') : t('userActivated', 'User activated')),
      (error) => toast.error(error)
    );
    setBusyId(null);
  };

  const handleDelete = async (user: User) => {
    const ok = await confirm(
      t('deleteUserTitle', 'Delete {name}?').replace('{name}', user.name),
      t('deleteUserPermanent', 'The account is removed for good and cannot be restored. To stop them signing in but keep the account, deactivate it instead.'),
      { variant: 'danger', confirmText: dict?.common?.delete || 'Delete', cancelText: dict?.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    setBusyId(user._id);
    await deleteUser(user._id, (message) => toast.success(message), (error) => toast.error(error));
    setBusyId(null);
  };

  const roleCounts = useMemo(() => {
    const counts: Partial<Record<UserRole, number>> = {};
    for (const u of users) counts[u.role] = (counts[u.role] || 0) + 1;
    return counts;
  }, [users]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) =>
      (roleFilter === 'all' || u.role === roleFilter) &&
      (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
  }, [users, search, roleFilter]);

  // Show the spinner only for the first load, so refetches after a save or delete keep the page (and any open sheet) mounted.
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (!loading && !loadedOnce) setLoadedOnce(true);

  const title = dict?.admin?.users || 'Users';

  if (!dict || (canManage && !loadedOnce)) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <RegisterPage tagNo="ST" tag={settings?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{t('accessRestricted', 'Access Restricted')}</h2>
            <p className="mt-2 text-sm">
              {t('accessRestrictedUsers', "You don't have permission to manage users. Contact an admin or owner.")}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const activeCount = users.filter((u) => u.isActive).length;
  const editLabel = dict.common?.edit || 'Edit';
  const deleteLabel = dict.common?.delete || 'Delete';
  const badgeLabel = t('signInBadge', 'Sign-in badge');
  const filtering = !!search.trim() || roleFilter !== 'all';

  return (
    <RegisterPage
      tagNo="ST"
      tag={settings?.companyName}
      title={title}
      subtitle={t('usersSubtitle', 'Manage system users, roles, and permissions')}
      side={<LedReadout value={`${activeCount}/${users.length}`} label={t('activeNow', 'Active')} />}
    >
      {ConfirmDialog}

      {/* Find someone, narrow by role, or add a new account */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72">
          <label htmlFor="users-search" className="sr-only">{t('searchUsers', 'Search name or email')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={1.75} aria-hidden />
            <input
              id="users-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchUsers', 'Search name or email')}
              className={`${DARK_FIELD} pl-9`}
            />
          </div>
        </div>
        <div className="mr-auto flex flex-wrap gap-2" role="group" aria-label={t('role', 'Role')}>
          <button type="button" aria-pressed={roleFilter === 'all'} onClick={() => setRoleFilter('all')} className={roleFilter === 'all' ? DARK_KEY_ON : DARK_KEY}>
            {t('allRoles', 'All')} <span className="font-semibold">{users.length}</span>
          </button>
          {USER_ROLES.filter((r) => roleCounts[r.value]).map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={roleFilter === r.value}
              onClick={() => setRoleFilter(roleFilter === r.value ? 'all' : r.value)}
              className={roleFilter === r.value ? DARK_KEY_ON : DARK_KEY}
            >
              {getRoleLabel(r.value, dict)} <span className="font-semibold">{roleCounts[r.value]}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setSheetUser(null)} className={DARK_KEY_PRIMARY}>
          <Plus className={ICON} strokeWidth={1.75} aria-hidden />
          {t('addUser', 'Add User')}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="mt-6">
          <div className="bg-paper-white px-4 py-14 text-center text-ink">
            <UserRound className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
            <p className="font-receipt text-sm text-ink/60">
              {filtering ? t('noUsersMatch', 'No users match this search') : (dict.common?.noResults || 'No results found')}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ) : (
        <ul className={`mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {shown.map((user) => {
            const isMe = currentUser?._id === user._id;
            const mayManage = canManageRole(myRole, user.role, isMe);
            const busy = busyId === user._id;
            const toggleLabel = user.isActive ? t('deactivate', 'Deactivate') : t('activate', 'Activate');
            return (
              <li
                key={user._id}
                className={`flex min-w-0 flex-col text-ink ${user.isActive ? 'bg-paper-white' : 'border border-dashed border-white/30 bg-paper-white/60'}`}
              >
                <div className={`flex items-center justify-between gap-2 px-3 py-1.5 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] ${user.isActive ? ROLE_BAND[user.role] ?? ROLE_BAND.viewer : 'bg-ink/10 text-ink/60'}`}>
                  <span>{getRoleLabel(user.role, dict)}</span>
                  {!user.isActive && <span>{t('inactive', 'Inactive')}</span>}
                </div>
                <div className="flex-1 px-3 pb-3 pt-2">
                  <h3 className={`flex flex-wrap items-baseline gap-x-2 break-words font-display text-3xl font-bold uppercase leading-none ${user.isActive ? '' : 'text-ink/50'}`}>
                    <span className="min-w-0 break-words">{user.name}</span>
                    {isMe && <span className="font-receipt text-xs font-medium normal-case tracking-normal text-brand-hover">{t('youTag', '(you)')}</span>}
                  </h3>
                  <p className="mt-1 break-all text-sm text-ink/70">{user.email}</p>
                  <p className="mt-3 border-t border-dotted border-ink/30 pt-2 font-receipt text-xs text-ink/60">
                    {t('lastSignIn', 'Last sign-in')}:{' '}
                    {user.lastLogin && settings ? formatDateTime(user.lastLogin, settings) : t('neverSignedIn', 'Never')}
                  </p>
                </div>
                <div className="flex justify-end border-t border-dashed border-ink/25">
                  {mayManage ? (
                    <button type="button" onClick={() => setBadgeUser(user)} className={`${ROW_KEY} mr-auto w-auto gap-2 px-3 font-receipt text-xs uppercase`} aria-label={`${badgeLabel}: ${user.name}`}>
                      <QrCode className={ICON} strokeWidth={1.75} aria-hidden />
                      {badgeLabel}
                    </button>
                  ) : (
                    <span className="mr-auto" aria-hidden />
                  )}
                  {mayManage && (
                    <button type="button" disabled={busy} onClick={() => setSheetUser(user)} className={`${ROW_KEY} disabled:opacity-40`} aria-label={`${editLabel} ${user.name}`} title={editLabel}>
                      <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                  {mayManage && !isMe && (
                    <button type="button" disabled={busy} onClick={() => handleToggle(user)} className={`${ROW_KEY} ${user.isActive ? 'hover:text-stamp' : ''} disabled:opacity-40`} aria-label={`${toggleLabel} ${user.name}`} title={toggleLabel}>
                      <Power className={ICON} strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                  {canDelete && mayManage && !isMe && (
                    <button type="button" disabled={busy} onClick={() => handleDelete(user)} className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`} aria-label={`${deleteLabel} ${user.name}`} title={deleteLabel}>
                      <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sheetUser !== undefined && (
        <UserSheet
          user={sheetUser}
          isMe={!!sheetUser && sheetUser._id === currentUser?._id}
          currentUserRole={myRole}
          dict={dict}
          onClose={() => setSheetUser(undefined)}
          onSaved={() => {
            toast.success(sheetUser ? t('userUpdated', 'User updated') : t('userCreated', 'User added'));
            setSheetUser(undefined);
            fetchUsers();
          }}
        />
      )}

      {badgeUser && (
        <BadgeSheet user={badgeUser} dict={dict} onClose={() => setBadgeUser(null)} onRegenerated={() => fetchUsers()} />
      )}
    </RegisterPage>
  );
}

/** Add someone, or change their details, password or role. */
function UserSheet({ user, isMe, currentUserRole, dict, onClose, onSaved }: {
  user: User | null;
  isMe: boolean;
  currentUserRole: string;
  dict: TranslationDict;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { formData, setFormData, saving, error, handleSubmit: submitForm } = useUserForm(user);
  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const roles = assignableRoles(currentUserRole);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    await submitForm(onSaved);
  };

  return (
    <Sheet
      title={user ? t('editUser', 'Edit User') : t('addUser', 'Add User')}
      subtitle={user?.email}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="user-form" disabled={saving} className={KEY_PRIMARY}>
            {saving ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="user-form-name" className={LABEL}>{t('name', 'Name')} *</label>
          <input
            id="user-form-name"
            type="text"
            required
            autoFocus
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="user-form-email" className={LABEL}>{t('email', 'Email')} *</label>
          <input
            id="user-form-email"
            type="email"
            required
            autoComplete="off"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className={`${INPUT} font-receipt`}
          />
        </div>
        <div>
          <label htmlFor="user-form-password" className={LABEL}>{t('password', 'Password')}{user ? '' : ' *'}</label>
          <input
            id="user-form-password"
            type="password"
            required={!user}
            autoComplete="new-password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className={INPUT}
          />
          {user && <p className={HINT}>{t('leaveBlankPassword', 'leave blank to keep current')}</p>}
        </div>
        <fieldset>
          <legend className={LABEL}>{t('role', 'Role')}</legend>
          {isMe ? (
            <p className="flex min-h-[44px] items-center border border-dashed border-ink/25 px-3 font-receipt text-sm">
              {getRoleLabel(formData.role, dict)}
              <span className="ml-2 text-xs text-ink/60">{t('ownRoleLocked', 'Another admin or owner can change your role.')}</span>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {roles.map((role) => {
                const on = formData.role === role.value;
                return (
                  <label
                    key={role.value}
                    className={`flex min-h-[44px] cursor-pointer items-center justify-center border px-2 text-center font-receipt text-xs font-medium uppercase tracking-[0.08em] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-hover ${on ? 'border-ink bg-ink text-paper-white' : 'border-ink/25 text-ink hover:bg-paper'}`}
                  >
                    <input
                      type="radio"
                      name="user-form-role"
                      value={role.value}
                      checked={on}
                      onChange={() => setFormData({ ...formData, role: role.value })}
                      className="sr-only"
                    />
                    {getRoleLabel(role.value, dict)}
                  </label>
                );
              })}
            </div>
          )}
          <p className={HINT}>{t('roleHint', 'What each role can do is set under Roles & Permissions.')}</p>
        </fieldset>
        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}

/** The QR code a staff member scans at the sign-in screen, with copy and replace. */
function BadgeSheet({ user, dict, onClose, onRegenerated }: {
  user: User;
  dict: TranslationDict;
  onClose: () => void;
  onRegenerated: () => void;
}) {
  const { qrData, loading, error, fetchQRCode, regenerateQRCode } = useQrCode(user._id);
  const { confirm, Dialog } = useConfirm();
  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;

  useEffect(() => {
    fetchQRCode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user._id]);

  const handleRegenerate = async () => {
    const ok = await confirm(
      t('regenerateQRCode', 'Regenerate QR Code'),
      dict.common?.regenerateQRConfirm || 'Are you sure you want to regenerate the QR code? The old QR code will no longer work.',
      { variant: 'warning', confirmText: t('regenerateQRCode', 'Regenerate QR Code'), cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    await regenerateQRCode(
      () => {
        onRegenerated();
        toast.success(t('qrCodeRegenerated', 'QR code regenerated successfully'));
      },
      (err) => toast.error(err)
    );
  };

  return (
    <Sheet
      title={t('signInBadge', 'Sign-in badge')}
      subtitle={<span className="flex items-center gap-1.5"><IdCard className="h-4 w-4" strokeWidth={1.75} aria-hidden />{user.name} · {getRoleLabel(user.role, dict)}</span>}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
    >
      {Dialog}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <LoadingSpinner size="md" />
          <p className="font-receipt text-xs text-ink/60">{t('loadingQRCode', 'Loading QR code...')}</p>
        </div>
      ) : error ? (
        <Strip tone="error">{error}</Strip>
      ) : qrData ? (
        <div className="space-y-4">
          <p className="text-sm text-ink/70">{t('signInBadgeHint', 'Scan this at the sign-in screen to sign in without typing a password.')}</p>
          <QRCodeDisplay embedded qrToken={qrData.qrToken} onRegenerate={handleRegenerate} />
        </div>
      ) : null}
    </Sheet>
  );
}
