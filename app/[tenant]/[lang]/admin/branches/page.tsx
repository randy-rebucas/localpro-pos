'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';

interface Branch {
  _id: string;
  name: string;
  code?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  managerId?: {
    _id: string;
    name: string;
    email: string;
  } | string;
  isActive: boolean;
  createdAt: string;
}

interface User {
  _id: string;
  name: string;
  email: string;
}

export default function BranchesPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchBranches();
    fetchUsers();
  }, [lang, tenant]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setBranches(data.data);
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (!confirm('Are you sure you want to deactivate this branch?')) return;
    try {
      const res = await fetch(`/api/branches/${branchId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Branch deactivated successfully' });
        fetchBranches();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to deactivate branch' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to deactivate branch' });
    }
  };

  const handleToggleBranchStatus = async (branch: Branch) => {
    try {
      const res = await fetch(`/api/branches/${branch._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !branch.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Branch ${!branch.isActive ? 'activated' : 'deactivated'} successfully` });
        fetchBranches();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update branch' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update branch' });
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.branches || 'Branches'}
              </h1>
              <p className="text-gray-600">{dict.admin?.branchesSubtitle || 'Manage store branches and locations'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.branches || 'Branches'}</h2>
            <button
              onClick={() => {
                setEditingBranch(null);
                setShowBranchModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {dict.common?.add || 'Add'} {dict.admin?.branch || 'Branch'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.code || 'Code'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.address || 'Address'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.manager || 'Manager'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {branches.map((branch) => {
                  const managerName = typeof branch.managerId === 'object' && branch.managerId !== null
                    ? branch.managerId.name
                    : '-';
                  const addressStr = branch.address
                    ? `${branch.address.street || ''} ${branch.address.city || ''} ${branch.address.state || ''}`.trim()
                    : '-';
                  return (
                    <tr key={branch._id}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{branch.name}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{branch.code || '-'}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{addressStr}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{managerName}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${branch.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {branch.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingBranch(branch);
                              setShowBranchModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            {dict.common?.edit || 'Edit'}
                          </button>
                          <button
                            onClick={() => handleToggleBranchStatus(branch)}
                            className={branch.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                          >
                            {branch.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                          </button>
                          <button
                            onClick={() => handleDeleteBranch(branch._id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            {dict.common?.delete || 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {branches.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No branches found'}</div>
            )}
          </div>
        </div>

        {showBranchModal && (
          <BranchModal
            branch={editingBranch}
            users={users}
            onClose={() => {
              setShowBranchModal(false);
              setEditingBranch(null);
            }}
            onSave={() => {
              fetchBranches();
              setShowBranchModal(false);
              setEditingBranch(null);
            }}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function BranchModal({
  branch,
  users,
  onClose,
  onSave,
  dict,
}: {
  branch: Branch | null;
  users: User[];
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const [formData, setFormData] = useState({
    name: branch?.name || '',
    code: branch?.code || '',
    address: {
      street: branch?.address?.street || '',
      city: branch?.address?.city || '',
      state: branch?.address?.state || '',
      zipCode: branch?.address?.zipCode || '',
      country: branch?.address?.country || '',
    },
    phone: branch?.phone || '',
    email: branch?.email || '',
    managerId: typeof branch?.managerId === 'object' && branch?.managerId !== null
      ? branch.managerId._id
      : branch?.managerId || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = branch ? `/api/branches/${branch._id}` : '/api/branches';
      const method = branch ? 'PUT' : 'POST';
      const body: any = {
        name: formData.name,
        code: formData.code || undefined,
        address: formData.address.street || formData.address.city ? formData.address : undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        managerId: formData.managerId || undefined,
      };

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
        setError(data.error || 'Failed to save branch');
      }
    } catch (error) {
      setError('Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {branch ? (dict.admin?.editBranch || 'Edit Branch') : (dict.admin?.addBranch || 'Add Branch')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.name || 'Name'} *
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
                  {dict.admin?.code || 'Code'} (optional)
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="BR001"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.address || 'Address'}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={formData.address.street}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Street"
                />
                <input
                  type="text"
                  value={formData.address.city}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="City"
                />
                <input
                  type="text"
                  value={formData.address.state}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="State"
                />
                <input
                  type="text"
                  value={formData.address.zipCode}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, zipCode: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="ZIP Code"
                />
                <input
                  type="text"
                  value={formData.address.country}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, country: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Country"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.phone || 'Phone'}
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
                  {dict.admin?.email || 'Email'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.manager || 'Manager'} (optional)
              </label>
              <select
                value={formData.managerId}
                onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{dict.common?.select || 'Select Manager'}</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.email})
                  </option>
                ))}
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

