'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';

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

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800 border-purple-200',
  admin: 'bg-blue-100 text-blue-800 border-blue-200',
  manager: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  cashier: 'bg-gray-100 text-gray-700 border-gray-200',
  viewer: 'bg-gray-50 text-gray-500 border-gray-200',
};

const ROLES = ['owner', 'admin', 'manager', 'cashier', 'viewer'];

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
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
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [search, tenantSlug, roleFilter, page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
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

  return (
    <SuperAdminShell>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">View and manage all tenant staff accounts</p>
        </div>

        {message && (
          <div className={`mb-4 p-3 border text-sm ${message.type === 'success' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Filters */}
        <form onSubmit={handleFilter} className="bg-white border border-gray-200 border-b-0 px-4 py-3 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white w-52"
          />
          <input
            type="text"
            placeholder="Tenant slug"
            value={tenantSlug}
            onChange={e => setTenantSlug(e.target.value)}
            className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white w-36"
          />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
          </select>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Search
          </button>
          <button
            type="button"
            onClick={() => { setSearch(''); setTenantSlug(''); setRoleFilter(''); setPage(1); }}
            className="px-3 py-2 border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 bg-white"
          >
            Clear
          </button>
        </form>

        <div className="bg-white border border-gray-200">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="mt-3 text-gray-500 text-sm">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">No users found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Name', 'Email', 'Role', 'Tenant', 'Last Login', 'Status', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(user => (
                      <tr key={user._id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">{user.email}</td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 text-xs font-medium border capitalize ${ROLE_BADGE[user.role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {user.tenantId ? (
                            <div>
                              <p className="text-sm font-medium text-gray-900">{user.tenantId.name}</p>
                              <p className="text-xs text-gray-400 font-mono">{user.tenantId.slug}</p>
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">{formatDate(user.lastLogin)}</td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 text-xs font-semibold border ${user.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <div className="flex gap-3">
                            {user.isActive ? (
                              <button onClick={() => openAction(user, 'deactivate')} className="text-red-600 hover:text-red-800 font-medium">
                                Deactivate
                              </button>
                            ) : (
                              <button onClick={() => openAction(user, 'activate')} className="text-green-600 hover:text-green-800 font-medium">
                                Activate
                              </button>
                            )}
                            <button onClick={() => openAction(user, 'change-role')} className="text-blue-600 hover:text-blue-800 font-medium">
                              Role
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  {pagination.total.toLocaleString()} users — page {pagination.page} of {pagination.pages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 bg-white disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="px-3 py-1.5 border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 bg-white disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 shadow-xl w-full max-w-sm p-6">
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
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
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
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 bg-white"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={saving}
                className={`px-4 py-2 text-white text-sm font-semibold disabled:opacity-50 ${actionModal.action === 'deactivate' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SuperAdminShell>
  );
}
