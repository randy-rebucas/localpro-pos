'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { useCustomerGroupsList, type CustomerGroup, type CustomerGroupFormData } from '@/hooks/useCustomerGroupsList';
import { usePermissions } from '@/hooks/usePermissions';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const SPINNER_SM = <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>;

export default function CustomerGroupsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CustomerGroup | null>(null);
  // Remounts the form on every open so it re-initializes even when reopening the same group.
  const [formKey, setFormKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { canAccess } = usePermissions();
  const canCreate = canAccess('customer_groups.create');
  // Edit + activate/deactivate are PUT /api/customer-groups/[id].
  const canEdit = canAccess('customer_groups.edit');
  const canDelete = canAccess('customer_groups.delete');
  const showRowActions = canEdit || canDelete;

  const {
    groups,
    loading,
    error: listError,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    toggleGroupStatus,
  } = useCustomerGroupsList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const openForm = (group: CustomerGroup | null) => {
    setEditingGroup(group);
    setFormKey((k) => k + 1);
    setShowModal(true);
  };

  const handleDelete = async (group: CustomerGroup) => {
    if (!dict) return;
    const template = dict.admin?.deleteCustomerGroupNamed || 'Delete customer group "{name}"? This cannot be undone.';
    if (!confirm(template.replace('{name}', group.name))) return;

    setBusyId(group._id);
    const result = await deleteGroup(group._id);
    setBusyId(null);
    if (result === true) {
      showToast.success(dict.admin?.customerGroupDeleted || 'Customer group deleted');
      await fetchGroups();
    } else {
      showToast.error(result);
    }
  };

  const handleToggle = async (group: CustomerGroup) => {
    setBusyId(group._id);
    const result = await toggleGroupStatus(group._id, !group.isActive);
    setBusyId(null);
    if (result === true) {
      showToast.success(
        group.isActive
          ? (dict?.admin?.customerGroupDeactivated || 'Customer group deactivated')
          : (dict?.admin?.customerGroupActivated || 'Customer group activated')
      );
      await fetchGroups();
    } else {
      showToast.error(result);
    }
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const editLabel = dict.common?.edit || 'Edit';
  const deleteLabel = dict.common?.delete || 'Delete';
  const activateLabel = dict.admin?.activate || 'Activate';
  const deactivateLabel = dict.admin?.deactivate || 'Deactivate';

  const renderBody = () => {
    if (loading && groups.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingCustomerGroups || 'Loading customer groups…'}</p>
        </div>
      );
    }

    if (listError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{dict.admin?.failedToLoadCustomerGroups || 'Failed to load customer groups'}</p>
          <p className="text-xs text-gray-500 mt-1">{listError}</p>
          <button
            type="button"
            onClick={() => fetchGroups()}
            disabled={loading}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {loading ? (dict.common?.loading || 'Loading…') : (dict.common?.retry || 'Retry')}
          </button>
        </div>
      );
    }

    if (groups.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {dict.admin?.noCustomerGroupsYet || 'No customer groups yet.'}
        </div>
      );
    }

    return (
      <div className="relative border border-gray-300 bg-white" aria-busy={loading}>
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20" aria-live="polite">
            <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
          </div>
        )}
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.name || 'Name'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.description || 'Description'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.admin?.members || 'Members'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
                {showRowActions && <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {groups.map((group) => {
                const busy = busyId === group._id;
                return (
                  <tr key={group._id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{group.name}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {group.description ? (
                        <p className="max-w-[360px] truncate" title={group.description}>{group.description}</p>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900">
                      {(group.memberCount ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold ${group.isActive ? 'bg-win8-success text-white' : 'bg-gray-500 text-white'}`}>
                        {group.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                      </span>
                    </td>
                    {showRowActions && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {canEdit && (<button
                            type="button"
                            onClick={() => openForm(group)}
                            title={editLabel}
                            aria-label={`${editLabel}: ${group.name}`}
                            className={`${ICON_BUTTON} bg-brand`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                            </svg>
                          </button>)}
                          {canEdit && (<button
                            type="button"
                            onClick={() => handleToggle(group)}
                            disabled={busy}
                            title={group.isActive ? deactivateLabel : activateLabel}
                            aria-label={`${group.isActive ? deactivateLabel : activateLabel}: ${group.name}`}
                            className={`${ICON_BUTTON} ${group.isActive ? 'bg-win8-danger' : 'bg-win8-success'}`}
                          >
                            {busy ? SPINNER_SM : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d={group.isActive ? 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10' : 'm5 12 5 5L20 7'} />
                              </svg>
                            )}
                          </button>)}
                          {canDelete && (<button
                            type="button"
                            onClick={() => handleDelete(group)}
                            disabled={busy}
                            title={deleteLabel}
                            aria-label={`${deleteLabel}: ${group.name}`}
                            className={`${ICON_BUTTON} bg-win8-danger`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                            </svg>
                          </button>)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.customerGroups || 'Customer Groups'}
          description={dict.admin?.customerGroupsSubtitle || 'Organize customers into groups for targeted pricing, promotions, and reporting'}
          actions={canCreate && (
            <button
              type="button"
              onClick={() => openForm(null)}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors whitespace-nowrap"
            >
              + {dict.admin?.newCustomerGroup || 'New Customer Group'}
            </button>
          )}
        />

        <div className="space-y-4">{renderBody()}</div>
      </div>

      <Win8Drawer open={showModal} onClose={() => setShowModal(false)}>
        <CustomerGroupForm
          key={formKey}
          group={editingGroup}
          onClose={() => setShowModal(false)}
          onSave={async () => {
            showToast.success(
              editingGroup
                ? (dict.admin?.customerGroupUpdated || 'Customer group updated')
                : (dict.admin?.customerGroupCreated || 'Customer group created')
            );
            setShowModal(false);
            await fetchGroups();
          }}
          dict={dict}
          createGroup={createGroup}
          updateGroup={updateGroup}
        />
      </Win8Drawer>
    </>
  );
}

function CustomerGroupForm({
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

  const closeLabel = dict.common?.close || 'Close';

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {group ? (dict.admin?.editCustomerGroup || 'Edit Customer Group') : (dict.admin?.newCustomerGroup || 'New Customer Group')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          title={closeLabel}
          aria-label={closeLabel}
          className="text-white/70 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label htmlFor="group-name" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.name || 'Name'} <span className="text-win8-danger">*</span>
            </label>
            <input
              id="group-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label htmlFor="group-description" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.description || 'Description'} <span className="text-gray-400 font-normal">({dict.common?.optional || 'optional'})</span>
            </label>
            <textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full border border-gray-300 px-3 py-2 text-sm bg-white resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right tabular-nums">{description.length}/500</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-win8"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            {dict.admin?.active || 'Active'}
          </label>
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
            disabled={submitting}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {submitting ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
          </button>
        </div>
      </form>
    </>
  );
}
