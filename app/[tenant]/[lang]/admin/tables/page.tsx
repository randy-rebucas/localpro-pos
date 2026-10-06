'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';

interface TableRow {
  _id: string;
  name: string;
  capacity?: number;
  status: 'open' | 'occupied' | 'check-requested';
  isActive: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-win8-success text-white',
  occupied: 'bg-win8-danger text-white',
  'check-requested': 'bg-win8-warning text-white',
};

const STATUS_FALLBACK_LABEL: Record<string, string> = {
  open: 'Open',
  occupied: 'Occupied',
  'check-requested': 'Check Requested',
};

const SMALL_ACTION = 'px-3 py-1 text-xs font-semibold text-white hover:brightness-110 transition-[filter]';

export default function TablesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Stored untranslated (server message, or which fallback to show) so fetchTables
  // doesn't depend on dict and refetch when the dictionary arrives.
  const [loadError, setLoadError] = useState<{ server?: string; fallback: 'failedToLoadTables' | 'errorLoadingTables' } | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableRow | null>(null);
  const [formData, setFormData] = useState({ name: '', capacity: '' });

  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canCreate = canAccess('tables.create');
  // Edit + reactivate are config PATCHes; deactivate is DELETE; "reset to open" is a status-only PATCH.
  const canEdit = canAccess('tables.edit');
  const canDelete = canAccess('tables.delete');
  const canUpdateStatus = canAccess('tables.update_status');
  const tableManagementEnabled = supportsFeature(settings ?? undefined, 'tableManagement');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const fetchTables = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch(
        `/api/tables?tenant=${tenant}&isActive=${showInactive ? 'all' : 'true'}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (data.success) setTables(data.data || []);
      else setLoadError({ server: data.error, fallback: 'failedToLoadTables' });
    } catch {
      setLoadError({ fallback: 'errorLoadingTables' });
    } finally {
      setLoading(false);
    }
  }, [tenant, showInactive]);

  useEffect(() => {
    if (tenant) fetchTables();
  }, [fetchTables, tenant]);

  const openAdd = () => {
    setSelectedTable(null);
    setFormData({ name: '', capacity: '' });
    setShowModal(true);
  };

  const openEdit = (table: TableRow) => {
    setSelectedTable(table);
    setFormData({ name: table.name, capacity: table.capacity?.toString() || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast.error(dict?.tables?.tableNameRequired || 'Table name is required'); return; }
    if (formData.capacity) {
      const cap = parseInt(formData.capacity);
      if (isNaN(cap) || cap < 1 || cap > 100) { toast.error(dict?.tables?.capacityError || 'Capacity must be 1–100'); return; }
    }

    const method = selectedTable ? 'PATCH' : 'POST';
    const url = selectedTable
      ? `/api/tables/${selectedTable._id}?tenant=${tenant}`
      : `/api/tables?tenant=${tenant}`;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name.trim(),
          capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(selectedTable ? (dict?.tables?.tableUpdated || 'Table updated') : (dict?.tables?.tableCreated || 'Table created'));
        setShowModal(false);
        fetchTables();
      } else {
        toast.error(data.error || dict?.tables?.failedToSaveTable || 'Failed to save table');
      }
    } catch {
      toast.error(dict?.tables?.errorSavingTable || 'Error saving table');
    }
  };

  const handleDeactivate = async (table: TableRow) => {
    if (!confirm((dict?.tables?.deactivateConfirm || 'Deactivate table "{name}"?').replace('{name}', table.name))) return;
    try {
      const res = await fetch(`/api/tables/${table._id}?tenant=${tenant}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) { toast.success(dict?.tables?.tableDeactivated || 'Table deactivated'); fetchTables(); }
      else toast.error(data.error || dict?.tables?.failedToDeactivate || 'Failed to deactivate');
    } catch {
      toast.error(dict?.tables?.errorDeactivatingTable || 'Error deactivating table');
    }
  };

  const handleReactivate = async (table: TableRow) => {
    try {
      const res = await fetch(`/api/tables/${table._id}?tenant=${tenant}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: true }),
      });
      const data = await res.json();
      if (data.success) { toast.success(dict?.tables?.tableReactivated || 'Table reactivated'); fetchTables(); }
      else toast.error(data.error || dict?.tables?.failedToReactivate || 'Failed to reactivate');
    } catch {
      toast.error(dict?.tables?.errorReactivatingTable || 'Error reactivating table');
    }
  };

  const handleResetStatus = async (table: TableRow) => {
    try {
      const res = await fetch(`/api/tables/${table._id}?tenant=${tenant}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'open' }),
      });
      const data = await res.json();
      if (data.success) { toast.success(dict?.tables?.tableReset || 'Table reset to open'); fetchTables(); }
      else toast.error(data.error || dict?.tables?.failedToResetStatus || 'Failed to reset status');
    } catch {
      toast.error(dict?.tables?.errorResettingStatus || 'Error resetting table status');
    }
  };

  const activeTables = tables.filter((t) => t.isActive);
  const displayed = showInactive ? tables : activeTables;

  const statusLabels: Record<string, string> = {
    open: dict?.tables?.statusOpen || 'Open',
    occupied: dict?.tables?.statusOccupied || 'Occupied',
    'check-requested': dict?.tables?.statusCheckRequested || 'Check Requested',
  };

  const formTitle = selectedTable ? (dict?.tables?.editTable || 'Edit Table') : (dict?.tables?.addTable || 'Add Table');

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict?.tables?.loadingTables || 'Loading tables…'}</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">
            {loadError.server ||
              dict?.tables?.[loadError.fallback] ||
              (loadError.fallback === 'failedToLoadTables' ? 'Failed to load tables' : 'Error loading tables')}
          </p>
          <button
            type="button"
            onClick={fetchTables}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (displayed.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          <p>{dict?.tables?.noTablesYet || 'No tables configured yet'}</p>
          {canCreate && tableManagementEnabled && (
            <button
              type="button"
              onClick={openAdd}
              className="mt-4 px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
            >
              + {dict?.tables?.addTable || 'Add Table'}
            </button>
          )}
        </div>
      );
    }

    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayed.map((table) => (
            <div
              key={table._id}
              className={`bg-white border p-4 ${table.isActive ? 'border-gray-300' : 'border-dashed border-gray-300 opacity-60'}`}
            >
              <div className="flex justify-between items-start gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-900 truncate" title={table.name}>{table.name}</h3>
                <span
                  className={`shrink-0 px-2 py-0.5 text-xs font-semibold ${
                    table.isActive ? STATUS_BADGE[table.status] || 'bg-gray-500 text-white' : 'bg-gray-500 text-white'
                  }`}
                >
                  {table.isActive
                    ? statusLabels[table.status] || STATUS_FALLBACK_LABEL[table.status] || table.status
                    : dict?.admin?.inactive || 'Inactive'}
                </span>
              </div>

              <p className="text-xs text-gray-500 tabular-nums">
                {table.capacity ? `${table.capacity} ${dict?.tables?.seats || 'seats'}` : '—'}
              </p>

              {(canEdit || canDelete || canUpdateStatus) && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {table.isActive ? (
                    <>
                      {canUpdateStatus && table.status !== 'open' && (
                        <button
                          type="button"
                          onClick={() => handleResetStatus(table)}
                          className={`${SMALL_ACTION} bg-win8-warning`}
                        >
                          {dict?.tables?.resetToOpen || 'Reset to Open'}
                        </button>
                      )}
                      {canEdit && (<button
                        type="button"
                        onClick={() => openEdit(table)}
                        className={`${SMALL_ACTION} bg-brand`}
                      >
                        {dict?.common?.edit || 'Edit'}
                      </button>)}
                      {canDelete && (<button
                        type="button"
                        onClick={() => handleDeactivate(table)}
                        className={`${SMALL_ACTION} bg-win8-danger`}
                      >
                        {dict?.admin?.deactivate || 'Deactivate'}
                      </button>)}
                    </>
                  ) : (
                    canEdit && <button
                      type="button"
                      onClick={() => handleReactivate(table)}
                      className={`${SMALL_ACTION} bg-win8-success`}
                    >
                      {dict?.tables?.reactivate || 'Reactivate'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {activeTables.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {Object.keys(STATUS_BADGE).map((key) => (
              <span key={key} className={`px-2 py-0.5 font-semibold ${STATUS_BADGE[key]}`}>
                {statusLabels[key] || STATUS_FALLBACK_LABEL[key]}
              </span>
            ))}
            <span className="ml-auto">{dict?.tables?.resetToOpenHint || '"Reset to Open" clears stuck occupied status'}</span>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict?.tables?.title || 'Tables'}
          description={`${activeTables.length} ${activeTables.length !== 1 ? (dict?.tables?.activeTables || 'active tables') : (dict?.tables?.activeTable || 'active table')}`}
        />

        <div className="space-y-4">
          {!tableManagementEnabled && (
            <div className="bg-white border border-win8-warning p-4 flex items-start gap-3" role="status">
              <span className="w-8 h-8 shrink-0 bg-win8-warning text-white flex items-center justify-center" aria-hidden="true">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-win8-warning">
                  {dict?.tables?.tableManagementNotAvailable || 'Table Management Not Available'}
                </h2>
                <p className="text-sm text-gray-700 mt-0.5">
                  {dict?.tables?.tableManagementNotAvailableDesc || 'Table management is turned off for this store.'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {dict?.tables?.tableManagementNotAvailableHint || 'Enable it under Settings → Feature Flags.'}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="checkbox-win8"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              {dict?.tables?.showInactive || 'Show inactive'}
            </label>
            {canCreate && (
              <button
                type="button"
                onClick={openAdd}
                disabled={!tableManagementEnabled}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                + {dict?.tables?.addTable || 'Add Table'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showModal} onClose={() => setShowModal(false)} widthClass="max-w-md">
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{formTitle}</h2>
          <button
            type="button"
            onClick={() => setShowModal(false)}
            title={dict?.common?.close || 'Close'}
            aria-label={dict?.common?.close || 'Close'}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <label htmlFor="table-name" className="block text-xs font-medium text-gray-600 mb-1">
                {dict?.tables?.tableName || 'Table Name'} <span className="text-win8-danger">*</span>
              </label>
              <input
                id="table-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                placeholder={dict?.tables?.tableNamePlaceholder || 'e.g. T1, Table 5, Patio A'}
                maxLength={50}
                autoFocus
                required
              />
            </div>
            <div>
              <label htmlFor="table-capacity" className="block text-xs font-medium text-gray-600 mb-1">
                {dict?.tables?.seatingCapacity || 'Seating Capacity'}
              </label>
              <input
                id="table-capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                className="w-full border border-gray-300 px-3 py-2 text-sm tabular-nums"
                placeholder={dict?.tables?.capacityPlaceholder || 'e.g. 4'}
                min={1}
                max={100}
              />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict?.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {selectedTable ? (dict?.tables?.saveChanges || 'Save Changes') : (dict?.tables?.addTable || 'Add Table')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
