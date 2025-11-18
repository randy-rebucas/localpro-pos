'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';

interface User {
  _id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier' | 'viewer';
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

interface Tenant {
  _id: string;
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  isActive: boolean;
  createdAt: string;
  settings: {
    currency: string;
    language: 'en' | 'es';
    email?: string;
    phone?: string;
    companyName?: string;
  };
}

export default function AdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'tenants'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchUsers();
    fetchTenants();
  }, [lang, tenant]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/tenants', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setTenants(data.data);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'User deleted successfully' });
        fetchUsers();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete user' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete user' });
    }
  };

  const handleDeleteTenant = async (tenantSlug: string) => {
    if (!confirm('Are you sure you want to delete this tenant?')) return;
    try {
      const res = await fetch(`/api/tenants/${tenantSlug}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Tenant deleted successfully' });
        fetchTenants();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete tenant' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete tenant' });
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `User ${!user.isActive ? 'activated' : 'deactivated'} successfully` });
        fetchUsers();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update user' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update user' });
    }
  };

  const handleToggleTenantStatus = async (tenant: Tenant) => {
    try {
      const res = await fetch(`/api/tenants/${tenant.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !tenant.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Tenant ${!tenant.isActive ? 'activated' : 'deactivated'} successfully` });
        fetchTenants();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update tenant' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update tenant' });
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
              {dict.admin?.title || 'Admin Management'}
            </h1>
            <p className="text-gray-600">{dict.admin?.subtitle || 'Manage users, tenants, and system settings'}</p>
          </div>

          {message && (
            <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {message.text}
            </div>
          )}

          <div className="bg-white rounded-xl shadow-md mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'users'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {dict.admin?.users || 'Users'}
                </button>
                <button
                  onClick={() => setActiveTab('tenants')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'tenants'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {dict.admin?.tenants || 'Tenants'}
                </button>
              </nav>
            </div>
          </div>

          {activeTab === 'users' && (
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">{dict.admin?.users || 'Users'}</h2>
                <button
                  onClick={() => {
                    setEditingUser(null);
                    setShowUserModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  {dict.common?.add || 'Add'} {dict.admin?.user || 'User'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.email || 'Email'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.role || 'Role'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user._id}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 capitalize">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {user.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingUser(user);
                                setShowUserModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              {dict.common?.edit || 'Edit'}
                            </button>
                            <button
                              onClick={() => handleToggleUserStatus(user)}
                              className={user.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                            >
                              {user.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                            </button>
                            {currentUser?._id !== user._id && (
                              <button
                                onClick={() => handleDeleteUser(user._id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                {dict.common?.delete || 'Delete'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && (
                  <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No users found'}</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tenants' && (
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">{dict.admin?.tenants || 'Tenants'}</h2>
                <button
                  onClick={() => {
                    setEditingTenant(null);
                    setShowTenantModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  {dict.common?.add || 'Add'} {dict.admin?.tenant || 'Tenant'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.slug || 'Slug'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.currency || 'Currency'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tenants.map((tenantItem) => (
                      <tr key={tenantItem._id}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tenantItem.name}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{tenantItem.slug}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{tenantItem.settings.currency}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${tenantItem.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {tenantItem.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingTenant(tenantItem);
                                setShowTenantModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              {dict.common?.edit || 'Edit'}
                            </button>
                            <button
                              onClick={() => handleToggleTenantStatus(tenantItem)}
                              className={tenantItem.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                            >
                              {tenantItem.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                            </button>
                            <button
                              onClick={() => handleDeleteTenant(tenantItem.slug)}
                              className="text-red-600 hover:text-red-900"
                            >
                              {dict.common?.delete || 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tenants.length === 0 && (
                  <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No tenants found'}</div>
                )}
              </div>
            </div>
          )}

          {showUserModal && (
            <UserModal
              user={editingUser}
              onClose={() => {
                setShowUserModal(false);
                setEditingUser(null);
              }}
              onSave={() => {
                fetchUsers();
                setShowUserModal(false);
                setEditingUser(null);
              }}
              dict={dict}
            />
          )}

          {showTenantModal && (
            <TenantModal
              tenant={editingTenant}
              onClose={() => {
                setShowTenantModal(false);
                setEditingTenant(null);
              }}
              onSave={() => {
                fetchTenants();
                setShowTenantModal(false);
                setEditingTenant(null);
              }}
              dict={dict}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function UserModal({
  user,
  onClose,
  onSave,
  dict,
}: {
  user: User | null;
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    name: user?.name || '',
    password: '',
    role: user?.role || 'cashier',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = user ? `/api/users/${user._id}` : '/api/users';
      const method = user ? 'PUT' : 'POST';
      const body: any = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
      };
      if (!user || formData.password) {
        body.password = formData.password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || 'Failed to save user');
      }
    } catch (error) {
      setError('Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {user ? (dict.admin?.editUser || 'Edit User') : (dict.admin?.addUser || 'Add User')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.email || 'Email'}
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.name || 'Name'}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.password || 'Password'} {user && '(leave blank to keep current)'}
              </label>
              <input
                type="password"
                required={!user}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.role || 'Role'}
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="viewer">Viewer</option>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function TenantModal({
  tenant,
  onClose,
  onSave,
  dict,
}: {
  tenant: Tenant | null;
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const [formData, setFormData] = useState({
    slug: tenant?.slug || '',
    name: tenant?.name || '',
    domain: tenant?.domain || '',
    subdomain: tenant?.subdomain || '',
    currency: tenant?.settings.currency || 'USD',
    language: tenant?.settings.language || 'en',
    email: tenant?.settings.email || '',
    phone: tenant?.settings.phone || '',
    companyName: tenant?.settings.companyName || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = tenant ? `/api/tenants/${tenant.slug}` : '/api/tenants';
      const method = tenant ? 'PUT' : 'POST';
      const body: any = {
        name: formData.name,
        currency: formData.currency,
        language: formData.language,
      };
      if (!tenant) {
        body.slug = formData.slug;
      }
      if (formData.domain) body.domain = formData.domain;
      if (formData.subdomain) body.subdomain = formData.subdomain;
      if (formData.email) body.email = formData.email;
      if (formData.phone) body.phone = formData.phone;
      if (formData.companyName) body.companyName = formData.companyName;

      if (tenant) {
        body.settings = {
          currency: formData.currency,
          language: formData.language,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          companyName: formData.companyName || undefined,
        };
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || 'Failed to save tenant');
      }
    } catch (error) {
      setError('Failed to save tenant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {tenant ? (dict.admin?.editTenant || 'Edit Tenant') : (dict.admin?.addTenant || 'Add Tenant')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!tenant && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.slug || 'Slug'} (lowercase, numbers, hyphens only)
                </label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  pattern="[a-z0-9-]+"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.name || 'Name'}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.domain || 'Domain'} (optional)
              </label>
              <input
                type="text"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.subdomain || 'Subdomain'} (optional)
              </label>
              <input
                type="text"
                value={formData.subdomain}
                onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.currency || 'Currency'}
              </label>
              <input
                type="text"
                required
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                maxLength={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.language || 'Language'}
              </label>
              <select
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value as 'en' | 'es' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.email || 'Email'} (optional)
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.phone || 'Phone'} (optional)
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.companyName || 'Company Name'} (optional)
              </label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

