'use client';

import { useEffect, useState, useCallback } from 'react';
import { showToast } from '@/lib/toast';

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  tenant: { slug: string; name: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-win8-accent text-white',
  admin: 'bg-brand text-white',
  manager: 'bg-win8-info text-white',
  cashier: 'bg-gray-500 text-white',
  viewer: 'bg-gray-400 text-white',
};

const ROLES = ['owner', 'admin', 'manager', 'cashier', 'viewer'];

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const res = await fetch(`/api/super-admin/users/${actionModal.user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setActionModal(null);
        showToast.success('User updated');
        fetchUsers();
      } else {
        showToast.error(data.error || 'Failed to update user');
        setActionModal(null);
      }
    } catch {
      showToast.error('An error occurred');
      setActionModal(null);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <form onSubmit={handleFilter} className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
              </svg>
              <input type="text" placeholder="Search name or email…" aria-label="Search users" value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56 focus:outline-none" />
            </div>
            <input
              type="text"
              placeholder="Tenant slug"
              aria-label="Filter by tenant slug"
              value={tenantSlug}
              onChange={e => setTenantSlug(e.target.value)}
              className="px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white w-36"
            />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
              className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
            >
              <option value="">All roles</option>
              {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors">
              Search
            </button>
            <button
              type="button"
              onClick={() => { setSearch(''); setTenantSlug(''); setRoleFilter(''); setPage(1); }}
              className="px-3 py-2 border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 bg-white transition-colors"
            >
              Clear
            </button>
          </div>
        </form>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto">
              <span /><span /><span /><span /><span />
            </div>
            <p className="mt-3 text-gray-400 text-sm">Loading users…</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">{error}</p>
            <button
              onClick={fetchUsers}
              className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
            {search || tenantSlug || roleFilter ? 'No users match your filters.' : 'No users found.'}
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  {['Name', 'Email', 'Role', 'Tenant', 'Last Login', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${ROLE_BADGE[user.role] || 'bg-gray-500 text-white'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.tenant ? (
                        <div>
                          <p className="font-medium text-gray-900">{user.tenant.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{user.tenant.slug}</p>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{formatDate(user.lastLogin)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold text-white ${user.isActive ? 'bg-win8-success' : 'bg-win8-danger'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openAction(user, 'change-role')} title="Change Role" aria-label="Change Role"
                          className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
                          </svg>
                        </button>
                        {user.isActive ? (
                          <button onClick={() => openAction(user, 'deactivate')} title="Deactivate" aria-label="Deactivate"
                            className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 transition-[filter]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="m5.5 5.5 13 13" />
                            </svg>
                          </button>
                        ) : (
                          <button onClick={() => openAction(user, 'activate')} title="Activate" aria-label="Activate"
                            className="inline-flex items-center justify-center p-2.5 text-white bg-win8-success hover:brightness-110 transition-[filter]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
                <span>Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1 border border-gray-300 disabled:opacity-40 hover:bg-gray-100">← Prev</button>
                  <button disabled={page >= pagination.pages} onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    className="px-3 py-1 border border-gray-300 disabled:opacity-40 hover:bg-gray-100">Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 capitalize">
              {actionModal.action.replace('-', ' ')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              User: <span className="font-medium text-gray-700">{actionModal.user.name}</span>
            </p>

            {actionModal.action === 'change-role' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">New Role</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white"
                >
                  {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                </select>
              </div>
            )}

            {['deactivate', 'activate'].includes(actionModal.action) && (
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to <strong>{actionModal.action}</strong> this user? They will {actionModal.action === 'deactivate' ? 'lose' : 'regain'} access immediately.
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={saving}
                className={`px-4 py-2 text-white text-sm font-semibold disabled:opacity-50 transition-colors ${actionModal.action === 'deactivate' ? 'bg-win8-danger hover:brightness-90' : 'bg-brand hover:bg-brand-hover'}`}
              >
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
