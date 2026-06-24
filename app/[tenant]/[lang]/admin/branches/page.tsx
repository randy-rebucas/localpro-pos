'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBranchesList, type Branch } from '@/hooks/useBranchesList';
import { useBranchForm } from '@/hooks/useBranchForm';
import { useUsersList } from '@/hooks/useUsersList';
import {
  getStatusColor,
  formatAddress,
  getManagerName,
  getDeactivateConfirmMessage,
  getDeleteConfirmMessage,
} from '@/lib/branches-helpers';

export default function BranchesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const { branches, loading, fetchBranches, deleteBranch, toggleBranchStatus } = useBranchesList();
  const { users: staff } = useUsersList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBranches((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteBranch = async (branchId: string) => {
    if (!dict) return;
    if (!confirm(getDeleteConfirmMessage(dict))) return;

    await deleteBranch(
      branchId,
      async (message) => {
        toast.success(message);
        await fetchBranches();
      },
      (error) => toast.error(error)
    );
  };

  const handleToggleBranchStatus = async (branch: Branch) => {
    if (!dict) return;
    if (!confirm(getDeactivateConfirmMessage(dict))) return;

    await toggleBranchStatus(
      branch._id,
      branch.isActive,
      (message) => {
        toast.success(message);
        fetchBranches();
      },
      (error) => toast.error(error)
    );
  };

  if (!dict || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {dict.admin?.branches || 'Branches'}
              </h1>
              <p className="text-gray-600">{dict.admin?.branchesSubtitle || 'Manage store branches and locations'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.branches || 'Branches'}</h2>
            <button
              onClick={() => {
                setEditingBranch(null);
                setShowBranchModal(true);
              }}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover"
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
                {branches.map((branch) => (
                  <tr key={branch._id}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{branch.name}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{branch.code || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-500">{formatAddress(branch.address)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{getManagerName(branch.managerId)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(branch.isActive)}`}>
                          {branch.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                        </span>
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(branch.isActive)}`}>
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
                          className="text-brand hover:text-brand-navy-deep"
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
                ))}
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
            users={staff}
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
  users: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  onClose: () => void;
  onSave: () => void;
  dict: Record<string, Record<string, string>> | null;
}) {
  const { formData, setFormData, error, handleSubmit } = useBranchForm(branch);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(
      async () => {
        toast.success(dict?.common?.branchSavedSuccess || 'Branch saved successfully');
        onSave();
      },
      (errorMsg) => toast.error(errorMsg)
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {branch ? (dict?.admin?.editBranch || 'Edit Branch') : (dict?.admin?.addBranch || 'Add Branch')}
          </h2>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.name || 'Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.code || 'Code'} (optional)
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  placeholder={dict?.admin?.branchCodePlaceholder || 'BR001'}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.admin?.address || 'Address'}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={formData.address?.street || ''}
                  onChange={(e) => setFormData({ ...formData, address: { ...(formData.address || {}), street: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  placeholder={dict?.admin?.streetPlaceholder || 'Street'}
                />
                <input
                  type="text"
                  value={formData.address?.city || ''}
                  onChange={(e) => setFormData({ ...formData, address: { ...(formData.address || {}), city: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  placeholder={dict?.admin?.cityPlaceholder || 'City'}
                />
                <input
                  type="text"
                  value={formData.address?.state || ''}
                  onChange={(e) => setFormData({ ...formData, address: { ...(formData.address || {}), state: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  placeholder={dict?.admin?.statePlaceholder || 'State'}
                />
                <input
                  type="text"
                  value={formData.address?.zipCode || ''}
                  onChange={(e) => setFormData({ ...formData, address: { ...(formData.address || {}), zipCode: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  placeholder={dict?.admin?.zipPlaceholder || 'ZIP Code'}
                />
                <input
                  type="text"
                  value={formData.address?.country || ''}
                  onChange={(e) => setFormData({ ...formData, address: { ...(formData.address || {}), country: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  placeholder={dict?.admin?.countryPlaceholder || 'Country'}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.phone || 'Phone'}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.email || 'Email'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.admin?.manager || 'Manager'} (optional)
              </label>
              <select
                value={formData.managerId}
                onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              >
                <option value="">{dict?.common?.select || 'Select Manager'}</option>
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
                {dict?.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover border border-brand-hover"
              >
                {dict?.common?.save || 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}