'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBranchesList, type Branch } from '@/hooks/useBranchesList';
import { useBranchForm } from '@/hooks/useBranchForm';
import { useUsersList } from '@/hooks/useUsersList';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import {
  getStatusColor,
  getStatusLabel,
  formatAddress,
  getManagerName,
  getDeactivateConfirmMessage,
} from '@/lib/branches-helpers';

const ICON_BUTTON =
  'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';

const ICONS = {
  edit: 'M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  deactivate: 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  activate: 'm5 12 5 5L20 7',
  close: 'M6 18 18 6M6 6l12 12',
} as const;

function Icon({ path, className = 'w-4 h-4' }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span className={`win8-spinner ${small ? 'win8-spinner-sm' : 'text-brand mx-auto'}`}>
      <span /><span /><span /><span /><span />
    </span>
  );
}

export default function BranchesPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  // The drawer subject stays set after close so the header doesn't blank during the slide-out;
  // formKey remounts the form (fresh useBranchForm state) on every open.
  const [formOpen, setFormOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { canAccess } = usePermissions();
  const canCreate = canAccess('branches.create');
  // Edit + activate/deactivate are PUT /api/branches/[id].
  const canEdit = canAccess('branches.edit');

  const { branches, loading, error, fetchBranches, toggleBranchStatus } = useBranchesList();
  const { users: staff, fetchUsers } = useUsersList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBranches((error) => toast.error(error));
    fetchUsers((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openForm = (branch: Branch | null) => {
    setEditingBranch(branch);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const handleToggleBranchStatus = async (branch: Branch) => {
    if (!dict) return;
    if (branch.isActive) {
      const message = dict.admin?.deactivateBranchNamedConfirm
        ? dict.admin.deactivateBranchNamedConfirm.replace('{name}', branch.name)
        : getDeactivateConfirmMessage(dict);
      if (!confirm(message)) return;
    }

    setBusyId(branch._id);
    await toggleBranchStatus(
      branch._id,
      branch.isActive,
      (message) => {
        toast.success(message);
        fetchBranches();
      },
      (error) => toast.error(error)
    );
    setBusyId(null);
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const hasFilters = query !== '' || statusFilter !== '';
  const filteredBranches = branches.filter(
    (b) =>
      (!statusFilter || b.isActive === (statusFilter === 'active')) &&
      (!query ||
        b.name.toLowerCase().includes(query) ||
        (b.code || '').toLowerCase().includes(query) ||
        (b.address?.city || '').toLowerCase().includes(query))
  );

  const columns = [
    dict.admin?.name || 'Name',
    dict.admin?.code || 'Code',
    dict.admin?.address || 'Address',
    dict.admin?.manager || 'Manager',
    dict.admin?.status || 'Status',
  ];

  const renderBody = () => {
    if (loading && branches.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <Spinner />
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingBranches || 'Loading branches…'}</p>
        </div>
      );
    }

    if (error && branches.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchBranches()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (filteredBranches.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noBranchesMatch || 'No branches match your filters.')
            : (dict.admin?.noBranchesYet || 'No branches yet.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              {columns.map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
              ))}
              {canEdit && (
                <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredBranches.map((branch) => {
              const busy = busyId === branch._id;
              const address = formatAddress(branch.address);
              const contact = [branch.phone, branch.email].filter(Boolean).join(' · ');
              const toggleLabel = branch.isActive
                ? (dict.admin?.deactivate || 'Deactivate')
                : (dict.admin?.activate || 'Activate');
              return (
                <tr key={branch._id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{branch.name}</p>
                    {contact && <p className="text-xs text-gray-400">{contact}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{branch.code || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[240px] truncate" title={address}>{address}</td>
                  <td className="px-4 py-3 text-gray-700">{getManagerName(branch.managerId)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(branch.isActive)}`}>
                      {getStatusLabel(branch.isActive, dict)}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openForm(branch)}
                          title={dict.common?.edit || 'Edit'}
                          aria-label={dict.common?.edit || 'Edit'}
                          className={`${ICON_BUTTON} bg-brand`}
                        >
                          <Icon path={ICONS.edit} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBranchStatus(branch)}
                          disabled={busy}
                          title={toggleLabel}
                          aria-label={toggleLabel}
                          className={`${ICON_BUTTON} ${branch.isActive ? 'bg-win8-danger' : 'bg-win8-success'}`}
                        >
                          {busy ? <Spinner small /> : <Icon path={branch.isActive ? ICONS.deactivate : ICONS.activate} />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.branches || 'Branches'}
          description={dict.admin?.branchesSubtitle || 'Manage store branches and locations'}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <div className="flex gap-3 flex-wrap">
              <div className="relative">
                <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={dict.admin?.searchBranches || 'Search by name, code or city…'}
                  aria-label={dict.admin?.searchBranches || 'Search by name, code or city…'}
                  className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-64"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as '' | 'active' | 'inactive')}
                aria-label={dict.admin?.filterByStatus || 'Filter by Status'}
                className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
              >
                <option value="">{dict.admin?.allStatuses || 'All Statuses'}</option>
                <option value="active">{dict.admin?.active || 'Active'}</option>
                <option value="inactive">{dict.admin?.inactive || 'Inactive'}</option>
              </select>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => openForm(null)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                + {dict.admin?.addBranch || 'Add Branch'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={formOpen} onClose={() => setFormOpen(false)} widthClass="max-w-2xl">
        <BranchForm
          key={formKey}
          branch={editingBranch}
          users={staff.filter((u) => u.isActive)}
          onClose={() => setFormOpen(false)}
          onSave={() => {
            fetchBranches();
            setFormOpen(false);
          }}
          dict={dict}
        />
      </Win8Drawer>
    </>
  );
}

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

function BranchForm({
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
  const { formData, setFormData, submitting, error, handleSubmit } = useBranchForm(branch);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(
      async () => {
        toast.success(dict?.common?.branchSavedSuccess || 'Branch saved successfully');
        onSave();
      },
      () => {
        // Error is shown inline at the bottom of the drawer body
      }
    );
  };

  const setAddress = (field: 'street' | 'city' | 'state' | 'zipCode' | 'country', value: string) =>
    setFormData({ ...formData, address: { ...(formData.address || {}), [field]: value } });

  const optional = <span className="text-gray-400 font-normal">({dict?.common?.optional || 'optional'})</span>;
  const closeLabel = dict?.common?.close || 'Close';

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {branch ? (dict?.admin?.editBranch || 'Edit Branch') : (dict?.admin?.addBranch || 'Add Branch')}
        </h2>
        <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
          <Icon path={ICONS.close} className="w-5 h-5" />
        </button>
      </div>
      <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="branch-name" className={LABEL}>
                {dict?.admin?.name || 'Name'} <span className="text-win8-danger">*</span>
              </label>
              <input
                id="branch-name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="branch-code" className={LABEL}>
                {dict?.admin?.code || 'Code'} {optional}
              </label>
              <input
                id="branch-code"
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className={`${INPUT} font-mono`}
                placeholder={dict?.admin?.branchCodePlaceholder || 'BR001'}
              />
            </div>
          </div>

          <hr className="border-gray-300" />

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {dict?.admin?.address || 'Address'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={formData.address?.street || ''}
                onChange={(e) => setAddress('street', e.target.value)}
                className={`${INPUT} sm:col-span-2`}
                placeholder={dict?.admin?.streetPlaceholder || 'Street'}
                aria-label={dict?.admin?.streetPlaceholder || 'Street'}
              />
              <input
                type="text"
                value={formData.address?.city || ''}
                onChange={(e) => setAddress('city', e.target.value)}
                className={INPUT}
                placeholder={dict?.admin?.cityPlaceholder || 'City'}
                aria-label={dict?.admin?.cityPlaceholder || 'City'}
              />
              <input
                type="text"
                value={formData.address?.state || ''}
                onChange={(e) => setAddress('state', e.target.value)}
                className={INPUT}
                placeholder={dict?.admin?.statePlaceholder || 'State'}
                aria-label={dict?.admin?.statePlaceholder || 'State'}
              />
              <input
                type="text"
                value={formData.address?.zipCode || ''}
                onChange={(e) => setAddress('zipCode', e.target.value)}
                className={INPUT}
                placeholder={dict?.admin?.zipPlaceholder || 'ZIP Code'}
                aria-label={dict?.admin?.zipPlaceholder || 'ZIP Code'}
              />
              <input
                type="text"
                value={formData.address?.country || ''}
                onChange={(e) => setAddress('country', e.target.value)}
                className={INPUT}
                placeholder={dict?.admin?.countryPlaceholder || 'Country'}
                aria-label={dict?.admin?.countryPlaceholder || 'Country'}
              />
            </div>
          </div>

          <hr className="border-gray-300" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="branch-phone" className={LABEL}>{dict?.admin?.phone || 'Phone'}</label>
              <input
                id="branch-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="branch-email" className={LABEL}>{dict?.admin?.email || 'Email'}</label>
              <input
                id="branch-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label htmlFor="branch-manager" className={LABEL}>
              {dict?.admin?.manager || 'Manager'} {optional}
            </label>
            <select
              id="branch-manager"
              value={formData.managerId}
              onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
              className={`${INPUT} bg-white`}
            >
              <option value="">{dict?.admin?.noManager || 'No manager'}</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>

          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
          >
            {dict?.common?.cancel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {submitting
              ? (dict?.common?.saving || 'Saving…')
              : branch
                ? (dict?.admin?.saveChanges || 'Save Changes')
                : (dict?.admin?.addBranch || 'Add Branch')}
          </button>
        </div>
      </form>
    </>
  );
}
