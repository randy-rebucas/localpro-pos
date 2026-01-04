'use client';

import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';

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
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setBranches(data.data);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || (dict?.common as Record<string, unknown>)?.failedToFetchBranches as string || 'Failed to fetch branches' });
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
      setMessage({ type: 'error', text: (dict?.common as Record<string, unknown>)?.failedToFetchBranches as string || 'Failed to fetch branches' });
    } finally {
      setLoading(false);
    }
  }, [dict]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      } else {
        console.error('Error fetching users:', data.error);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchBranches();
    fetchUsers();
  }, [lang, tenant, fetchBranches, fetchUsers]);

  const handleDeleteBranch = async (branchId: string) => {
    if (!dict) return;
    if (!confirm((dict.common as Record<string, unknown>)?.deactivateBranchConfirm as string || (dict.admin as Record<string, unknown>)?.deactivateBranchConfirm as string || 'Are you sure you want to deactivate this branch?')) return;
    try {
      const res = await fetch(`/api/branches/${branchId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: (dict?.common as Record<string, unknown>)?.branchDeactivatedSuccess as string || 'Branch deactivated successfully' });
        fetchBranches();
      } else {
        setMessage({ type: 'error', text: data.error || (dict?.common as Record<string, unknown>)?.failedToDeactivateBranch as string || 'Failed to deactivate branch' });
      }
    } catch {
      setMessage({ type: 'error', text: (dict?.common as Record<string, unknown>)?.failedToDeactivateBranch as string || 'Failed to deactivate branch' });
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
        setMessage({ type: 'success', text: `Branch ${!branch.isActive ? ((dict?.admin as Record<string, unknown>)?.activated as string || 'activated') : ((dict?.admin as Record<string, unknown>)?.deactivated as string || 'deactivated')} ${(dict?.admin as Record<string, unknown>)?.successfully as string || 'successfully'}` });
        fetchBranches();
      } else {
        setMessage({ type: 'error', text: data.error || (dict?.common as Record<string, unknown>)?.failedToUpdateBranch as string || 'Failed to update branch' });
      }
    } catch {
      setMessage({ type: 'error', text: (dict?.common as Record<string, unknown>)?.failedToUpdateBranch as string || 'Failed to update branch' });
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{(dict?.common as Record<string, unknown>)?.loading as string || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {(dict?.admin as Record<string, unknown>)?.backToAdmin as string || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {(dict.admin as Record<string, unknown>)?.branches as string || 'Branches'}
              </h1>
              <p className="text-gray-600">{(dict.admin as Record<string, unknown>)?.branchesSubtitle as string || 'Manage store branches and locations'}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{(dict.admin as Record<string, unknown>)?.branches as string || 'Branches'}</h2>
            <button
              onClick={() => {
                setEditingBranch(null);
                setShowBranchModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
            >
              {(dict.common as Record<string, unknown>)?.add as string || 'Add'} {(dict.admin as Record<string, unknown>)?.branch as string || 'Branch'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.name as string || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.code as string || 'Code'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.address as string || 'Address'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.manager as string || 'Manager'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.status as string || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.common as Record<string, unknown>)?.actions as string || 'Actions'}</th>
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
                        <span className={`px-2 py-1 text-xs font-semibold border ${branch.isActive ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
                          {branch.isActive ? ((dict.admin as Record<string, unknown>)?.active as string || 'Active') : ((dict.admin as Record<string, unknown>)?.inactive as string || 'Inactive')}
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
                            {(dict.common as Record<string, unknown>)?.edit as string || 'Edit'}
                          </button>
                          <button
                            onClick={() => handleToggleBranchStatus(branch)}
                            className={branch.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                          >
                            {branch.isActive ? ((dict.admin as Record<string, unknown>)?.deactivate as string || 'Deactivate') : ((dict.admin as Record<string, unknown>)?.activate as string || 'Activate')}
                          </button>
                          <button
                            onClick={() => handleDeleteBranch(branch._id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            {(dict.common as Record<string, unknown>)?.delete as string || 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {branches.length === 0 && (
              <div className="text-center py-8 text-gray-500">{(dict.common as Record<string, unknown>)?.noResults as string || 'No branches found'}</div>
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
  dict: Record<string, unknown>;
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
      const body: Record<string, unknown> = {
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
    } catch {
      setError('Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {branch ? ((dict.admin as Record<string, unknown>)?.editBranch as string || 'Edit Branch') : ((dict.admin as Record<string, unknown>)?.addBranch as string || 'Add Branch')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(dict.admin as Record<string, unknown>)?.name as string || 'Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(dict.admin as Record<string, unknown>)?.code as string || 'Code'} (optional)
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder={(dict?.admin as Record<string, unknown>)?.branchCodePlaceholder as string || 'BR001'}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {(dict.admin as Record<string, unknown>)?.address as string || 'Address'}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={formData.address.street}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder={(dict?.admin as Record<string, unknown>)?.streetPlaceholder as string || 'Street'}
                />
                <input
                  type="text"
                  value={formData.address.city}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder={(dict?.admin as Record<string, unknown>)?.cityPlaceholder as string || 'City'}
                />
                <input
                  type="text"
                  value={formData.address.state}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder={(dict?.admin as Record<string, unknown>)?.statePlaceholder as string || 'State'}
                />
                <input
                  type="text"
                  value={formData.address.zipCode}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, zipCode: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder={(dict?.admin as Record<string, unknown>)?.zipPlaceholder as string || 'ZIP Code'}
                />
                <input
                  type="text"
                  value={formData.address.country}
                  onChange={(e) => setFormData({ ...formData, address: { ...formData.address, country: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder={(dict?.admin as Record<string, unknown>)?.countryPlaceholder as string || 'Country'}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(dict.admin as Record<string, unknown>)?.phone as string || 'Phone'}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(dict.admin as Record<string, unknown>)?.email as string || 'Email'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {(dict.admin as Record<string, unknown>)?.manager as string || 'Manager'} (optional)
              </label>
              <select
                value={formData.managerId}
                onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">{(dict.common as Record<string, unknown>)?.select as string || 'Select Manager'}</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              >
                {(dict.common as Record<string, unknown>)?.cancel as string || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {saving ? ((dict.common as Record<string, unknown>)?.loading as string || 'Saving...') : ((dict.common as Record<string, unknown>)?.save as string || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

