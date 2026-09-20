'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useCustomerGroupsList, type CustomerGroup, type CustomerGroupFormData } from '@/hooks/useCustomerGroupsList';
import { usePermissions } from '@/hooks/usePermissions';

export default function CustomerGroupsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null>(null);
  const { canAccess } = usePermissions();
  const canManage = canAccess('customer_groups.manage');

  const {
    groups,
    loading,
    message,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    toggleGroupStatus,
    clearMessage,
    setMessage,
  } = useCustomerGroupsList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const handleDelete = async (groupId: string) => {
    if (!dict) return;
    if (!confirm(dict.admin?.confirmDeleteCustomerGroup || 'Are you sure you want to delete this customer group?')) return;

    const success = await deleteGroup(groupId);
    if (success) {
      await fetchGroups();
    }
  };

  const handleToggle = async (group: CustomerGroup) => {
    const success = await toggleGroupStatus(group._id, !group.isActive);
    if (success) {
      await fetchGroups();
    }
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {dict.admin?.customerGroups || 'Customer Groups'}
          </h1>
          <p className="text-gray-600">
            {dict.admin?.customerGroupsSubtitle || 'Organize customers into groups for targeted pricing, promotions, and reporting'}
          </p>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.customerGroups || 'Customer Groups'}</h2>
            {canManage && (
              <button
                onClick={() => {
                  clearMessage();
                  setEditingGroup(null);
                  setShowModal(true);
                }}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover"
              >
                {dict.common?.add || 'Add'} {dict.admin?.customerGroup || 'Customer Group'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.description || 'Description'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.members || 'Members'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groups.map((group) => (
                  <tr key={group._id}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{group.name}</span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">{group.description || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{group.memberCount}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold border ${
                          group.isActive
                            ? 'border-green-300 bg-green-50 text-green-800'
                            : 'border-gray-300 bg-gray-50 text-gray-600'
                        }`}
                      >
                        {group.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      {canManage ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              clearMessage();
                              setEditingGroup(group);
                              setShowModal(true);
                            }}
                            className="text-brand hover:text-brand-navy-deep"
                          >
                            {dict.common?.edit || 'Edit'}
                          </button>
                          <button
                            onClick={() => handleToggle(group)}
                            className={group.isActive ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'}
                          >
                            {group.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                          </button>
                          <button
                            onClick={() => handleDelete(group._id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            {dict.common?.delete || 'Delete'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {groups.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No customer groups found'}</div>
            )}
          </div>
        </div>

        {showModal && (
          <CustomerGroupModal
            group={editingGroup}
            onClose={() => {
              setShowModal(false);
              setEditingGroup(null);
            }}
            onSave={async () => {
              setMessage({
                type: 'success',
                text: editingGroup
                  ? (dict.admin?.updateSuccess || 'Customer group updated successfully')
                  : (dict.admin?.saveSuccess || 'Customer group created successfully'),
              });
              await fetchGroups();
              setShowModal(false);
              setEditingGroup(null);
            }}
            dict={dict}
            createGroup={createGroup}
            updateGroup={updateGroup}
          />
        )}
      </div>
    </div>
  );
}

function CustomerGroupModal({
  group,
  onClose,
  onSave,
  dict,
  createGroup,
  updateGroup,
}: {
  group: CustomerGroup | null;
  onClose: () => void;
  onSave: () => Promise<void>;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  createGroup: (form: CustomerGroupFormData) => Promise<true | string>;
  updateGroup: (id: string, form: CustomerGroupFormData) => Promise<true | string>;
}) {
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [isActive, setIsActive] = useState(group?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const payload: CustomerGroupFormData = { name, description, isActive };
    const result = group ? await updateGroup(group._id, payload) : await createGroup(payload);
    setSubmitting(false);
    if (result === true) {
      await onSave();
    } else {
      setError(result);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {group ? (dict.admin?.editCustomerGroup || 'Edit Customer Group') : (dict.admin?.addCustomerGroup || 'Add Customer Group')}
          </h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.name || 'Name'} *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.description || 'Description'}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  {dict.admin?.active || 'Active'}
                </span>
              </label>
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
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 border border-brand-hover"
              >
                {submitting ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
