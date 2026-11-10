'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, UserCheck, UserCog, UserX, Users } from 'lucide-react';
import { showToast } from '@/lib/toast';
import {
  DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, DARK_LABEL, Empty, ICON, IconKey, KEY, KEY_DANGER, KEY_PRIMARY,
  LABEL, Printing, SaPage, SELECT, Sheet, Slip, Strip, TABLE, TBODY, TD, TD_TEXT, TH, THEAD, TR, Tag, type TagTone,
} from '@/components/super-admin/ui';

interface AppUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  tenantId: { slug: string; name: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const ROLE_TONE: Record<string, TagTone> = {
  owner: 'info',
  admin: 'info',
  manager: 'muted',
  cashier: 'muted',
  viewer: 'muted',
};

const ROLES = ['owner', 'admin', 'manager', 'cashier', 'viewer'];

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  // Action modal
  const [actionModal, setActionModal] = useState<{
    user: AppUser;
    action: 'deactivate' | 'activate' | 'change-role';
  } | null>(null);
  const [newRole, setNewRole] = useState('');
  const [saving, setSaving] = useState(false);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (tenantSlug) params.set('tenantSlug', tenantSlug);
      if (roleFilter) params.set('role', roleFilter);
      params.set('page', String(page));
      params.set('limit', '50');

      const res = await fetch(`/api/super-admin/users?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
        setPagination(data.pagination);
      } else {
        const errorMsg = data.error || 'Failed to load users';
        setError(errorMsg);
        showToast.error(errorMsg);
        setUsers([]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load users';
      setError(errorMsg);
      showToast.error(errorMsg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, tenantSlug, roleFilter, page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const openAction = (user: AppUser, action: typeof actionModal extends { action: infer A } | null ? A : never) => {
    setActionModal({ user, action });
    setNewRole(user.role);
  };

  const executeAction = async () => {
    if (!actionModal) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { action: actionModal.action };
      if (actionModal.action === 'change-role') body.role = newRole;

      const res = await fetch(`/api/super-admin/users/${actionModal.user._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setActionModal(null);
        showMsg('success', 'User updated');
        fetchUsers();
      } else {
        showMsg('error', data.error || 'Failed to update user');
        setActionModal(null);
      }
    } catch {
      showMsg('error', 'An error occurred');
      setActionModal(null);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString() : '—';

  const statusTag = (user: AppUser) => <Tag tone={user.isActive ? 'ok' : 'bad'}>{user.isActive ? 'Active' : 'Inactive'}</Tag>;
  const roleTag = (user: AppUser) => <Tag tone={ROLE_TONE[user.role] || 'muted'}>{user.role}</Tag>;

  const rowKeys = (user: AppUser) => (
    <div className="flex flex-wrap gap-2">
      <IconKey icon={UserCog} label={`Change role for ${user.name || user.email}`} onClick={() => openAction(user, 'change-role')} />
      {user.isActive ? (
        <IconKey icon={UserX} tone="danger" label={`Deactivate ${user.name || user.email}`} onClick={() => openAction(user, 'deactivate')} />
      ) : (
        <IconKey icon={UserCheck} label={`Activate ${user.name || user.email}`} onClick={() => openAction(user, 'activate')} />
      )}
    </div>
  );

  const ACTION_TITLE: Record<string, string> = { deactivate: 'Deactivate user', activate: 'Activate user', 'change-role': 'Change role' };

  return (
    <SaPage
      tagNo="03"
      tag="Staff roster"
      title="Users"
      subtitle="Every staff account across all tenants. Switch an account off or change its role."
    >
      {message && (
        <div className="mt-6">
          <Strip tone={message.type === 'success' ? 'ok' : 'error'}>{message.text}</Strip>
        </div>
      )}

      {/* Filters */}
      <form onSubmit={handleFilter} aria-label="Filters" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div>
          <label htmlFor="user-search" className={DARK_LABEL}>Search</label>
          <input
            id="user-search"
            type="text"
            placeholder="Name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${DARK_FIELD} placeholder:text-ink/40`}
          />
        </div>
        <div>
          <label htmlFor="user-tenant" className={DARK_LABEL}>Tenant slug</label>
          <input
            id="user-tenant"
            type="text"
            placeholder="my-store"
            value={tenantSlug}
            onChange={e => setTenantSlug(e.target.value)}
            className={`${DARK_FIELD} placeholder:text-ink/40`}
          />
        </div>
        <div>
          <label htmlFor="user-role" className={DARK_LABEL}>Role</label>
          <select id="user-role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={DARK_FIELD}>
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button type="submit" className={DARK_KEY_PRIMARY}>
            <Search className={ICON} strokeWidth={1.75} aria-hidden />
            Search
          </button>
          <button
            type="button"
            onClick={() => { setSearch(''); setTenantSlug(''); setRoleFilter(''); setPage(1); }}
            className={DARK_KEY}
          >
            Clear
          </button>
        </div>
      </form>

      <Slip
        className="mt-6"
        title={loading || error ? 'Users' : `${pagination.total.toLocaleString()} user${pagination.total === 1 ? '' : 's'}`}
        tear
      >
        {loading ? (
          <Printing label="Loading users…" />
        ) : error ? (
          <div className="px-4 py-10 text-center sm:px-5">
            <div className="mx-auto max-w-md text-left">
              <Strip tone="error">{error}</Strip>
            </div>
            <button type="button" onClick={fetchUsers} className={`${KEY_PRIMARY} mx-auto mt-4`}>
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <Empty icon={<Users className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>No users found.</Empty>
        ) : (
          <>
            {/* Below xl: one printed entry per user */}
            <ul className={`${TBODY} xl:hidden`}>
              {users.map(user => (
                <li key={user._id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{user.name}</p>
                      <p className="mt-0.5 break-all font-receipt text-xs text-ink/60">{user.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {roleTag(user)}
                      {statusTag(user)}
                    </div>
                  </div>
                  <p className="mt-2 font-receipt text-xs text-ink/60">
                    {user.tenantId ? `${user.tenantId.name} · ${user.tenantId.slug}` : 'No tenant'} · Last login {formatDate(user.lastLogin)}
                  </p>
                  <div className="mt-3">{rowKeys(user)}</div>
                </li>
              ))}
            </ul>

            {/* From xl: the full table */}
            <div className="hidden overflow-x-auto xl:block" role="region" aria-label="Users" tabIndex={0}>
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    {['Name', 'Email', 'Role', 'Tenant', 'Last login', 'Status', 'Actions'].map(h => (
                      <th key={h} scope="col" className={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {users.map(user => (
                    <tr key={user._id} className={TR}>
                      <td className={`${TD_TEXT} font-medium`}>{user.name}</td>
                      <td className={`${TD} text-ink/70`}>{user.email}</td>
                      <td className={TD}>{roleTag(user)}</td>
                      <td className={TD_TEXT}>
                        {user.tenantId ? (
                          <div>
                            <p className="font-medium">{user.tenantId.name}</p>
                            <p className="mt-0.5 font-receipt text-xs text-ink/60">{user.tenantId.slug}</p>
                          </div>
                        ) : <span className="font-receipt text-xs text-ink/40">—</span>}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-ink/70`}>{formatDate(user.lastLogin)}</td>
                      <td className={TD}>{statusTag(user)}</td>
                      <td className="px-4 py-2.5">{rowKeys(user)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <nav aria-label="Pages" className="flex flex-col items-center justify-between gap-3 border-t border-dashed border-ink/30 px-4 py-2 sm:flex-row sm:px-5">
              <p className="flex items-center gap-3 font-receipt text-xs text-ink/60">
                Page
                <span className="font-led text-2xl leading-none text-ink">{pagination.page}/{pagination.pages}</span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className={KEY}>
                  Previous
                </button>
                <button type="button" onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages} className={KEY}>
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
      </Slip>

      {/* Action sheet */}
      {actionModal && (
        <Sheet
          title={ACTION_TITLE[actionModal.action]}
          subtitle={<>User: <span className="font-medium text-ink">{actionModal.user.name}</span></>}
          onClose={() => setActionModal(null)}
          closeLabel="Close"
          footer={
            <>
              <button type="button" onClick={() => setActionModal(null)} className={KEY}>Cancel</button>
              <button
                type="button"
                onClick={executeAction}
                disabled={saving}
                className={actionModal.action === 'deactivate' ? KEY_DANGER : KEY_PRIMARY}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </>
          }
        >
          {actionModal.action === 'change-role' && (
            <div>
              <label htmlFor="user-new-role" className={LABEL}>New role</label>
              <select id="user-new-role" value={newRole} onChange={e => setNewRole(e.target.value)} className={`${SELECT} w-full`}>
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
          )}

          {['deactivate', 'activate'].includes(actionModal.action) && (
            <p className="text-sm text-ink/80">
              Are you sure you want to <strong>{actionModal.action}</strong> this user? They will {actionModal.action === 'deactivate' ? 'lose' : 'regain'} access immediately.
            </p>
          )}
        </Sheet>
      )}
    </SaPage>
  );
}
