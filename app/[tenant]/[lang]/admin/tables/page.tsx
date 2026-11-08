'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Armchair, Pencil, Plus, Power, RotateCcw, Users } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, DARK_KEY, DARK_KEY_PRIMARY, HINT, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';

type TableStatus = 'open' | 'occupied' | 'check-requested';

interface TableRow {
  _id: string;
  name: string;
  capacity?: number | null;
  status: TableStatus;
  isActive: boolean;
}

/** A dark key while it is switched on. */
const DARK_KEY_ON = 'flex min-h-[44px] items-center justify-center gap-2 border border-paper-white bg-paper-white px-4 font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink touch-manipulation';

const STATUSES: TableStatus[] = ['open', 'occupied', 'check-requested'];

/** The band across the top of each table tile, the way a host stand marks its floor board. */
const STATUS_BAND: Record<TableStatus, string> = {
  open: 'bg-brand text-ink',
  occupied: 'bg-ink text-paper-white',
  'check-requested': 'bg-stamp text-paper-white',
};

export default function TablesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('tables.configure');
  const tableManagementEnabled = settings?.enableTableManagement !== false;
  const { confirm, Dialog: confirmDialog } = useConfirm();

  // Read through a ref so the dictionary arriving does not refetch the list.
  const dictRef = useRef<TranslationDict | null>(null);
  dictRef.current = dict;
  const tt = (key: string, fallback: string) => dictRef.current?.tables?.[key] || fallback;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const fetchTables = useCallback(async () => {
    const msg = (key: string, fallback: string) => dictRef.current?.tables?.[key] || fallback;
    try {
      setLoading(true);
      const res = await fetch(
        `/api/tables?tenant=${tenant}&isActive=${showInactive ? 'all' : 'true'}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (data.success) setTables(data.data || []);
      else toast.error(data.error || msg('failedToLoadTables', 'Failed to load tables'));
    } catch {
      toast.error(msg('errorLoadingTables', 'Error loading tables'));
    } finally {
      setLoading(false);
    }
  }, [tenant, showInactive]);

  useEffect(() => {
    if (tenant) fetchTables();
  }, [fetchTables, tenant]);

  /** PATCH or DELETE one table, then refetch. Returns whether it worked. */
  const send = async (table: TableRow, method: 'PATCH' | 'DELETE', body: object | null, ok: string, fail: string, error: string) => {
    setBusyId(table._id);
    try {
      const res = await fetch(`/api/tables/${table._id}?tenant=${tenant}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (data.success) {
        toast.success(ok);
        await fetchTables();
      } else {
        toast.error(data.error || fail);
      }
    } catch {
      toast.error(error);
    } finally {
      setBusyId(null);
    }
  };

  const handleDeactivate = async (table: TableRow) => {
    const ok = await confirm(
      tt('deactivateTitle', 'Deactivate table?'),
      tt('deactivateConfirm', 'Deactivate table "{name}"?').replace('{name}', table.name),
      { variant: 'danger', confirmText: dict?.admin?.deactivate || 'Deactivate', cancelText: dict?.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    await send(table, 'DELETE', null,
      tt('tableDeactivated', 'Table deactivated'), tt('failedToDeactivate', 'Failed to deactivate'), tt('errorDeactivatingTable', 'Error deactivating table'));
  };

  const handleReactivate = (table: TableRow) =>
    send(table, 'PATCH', { isActive: true },
      tt('tableReactivated', 'Table reactivated'), tt('failedToReactivate', 'Failed to reactivate'), tt('errorReactivatingTable', 'Error reactivating table'));

  const handleResetStatus = async (table: TableRow) => {
    const ok = await confirm(
      tt('resetTitle', 'Reset {name} to open?').replace('{name}', table.name),
      tt('resetConfirm', 'Use this when a table stays occupied after its guests have left. It is marked open and unlinked from its order; the order itself is not changed.'),
      { confirmText: tt('resetToOpen', 'Reset to Open'), cancelText: dict?.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    // Clear the order link too, as a completed sale does, so the table really is free.
    await send(table, 'PATCH', { status: 'open', currentOrderId: null },
      tt('tableReset', 'Table reset to open'), tt('failedToResetStatus', 'Failed to reset status'), tt('errorResettingStatus', 'Error resetting table status'));
  };

  const openForm = (table: TableRow | null) => {
    setSelectedTable(table);
    setShowModal(true);
  };

  // Show the spinner only for the first load, so refetches keep the board (and any open sheet) on screen.
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (!loading && !loadedOnce) setLoadedOnce(true);

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const activeTables = tables.filter((t) => t.isActive);
  const displayed = showInactive ? tables : activeTables;
  const openCount = activeTables.filter((t) => t.status === 'open').length;
  const seatTotal = activeTables.reduce((n, t) => n + (t.capacity || 0), 0);

  const statusLabels: Record<TableStatus, string> = {
    open: tt('statusOpen', 'Open'),
    occupied: tt('statusOccupied', 'Occupied'),
    'check-requested': tt('statusCheckRequested', 'Check Requested'),
  };
  const editLabel = dict.common?.edit || 'Edit';
  const deactivateLabel = dict.admin?.deactivate || 'Deactivate';
  const reactivateLabel = tt('reactivate', 'Reactivate');
  const resetLabel = tt('resetToOpen', 'Reset to Open');

  return (
    <RegisterPage
      tagNo="TB"
      tag={settings?.companyName}
      title={tt('title', 'Tables')}
      subtitle={`${activeTables.length} ${activeTables.length !== 1 ? tt('activeTables', 'active tables') : tt('activeTable', 'active table')}${seatTotal ? ` · ${seatTotal} ${tt('seats', 'seats')}` : ''}`}
      side={<LedReadout value={`${openCount}/${activeTables.length}`} label={tt('openNow', 'Open now')} />}
    >
      {confirmDialog}

      {!tableManagementEnabled && (
        <div className="mt-6 border-l-4 border-stamp bg-paper-white px-4 py-4 text-ink" role="status">
          <h2 className="text-2xl sm:text-3xl">{tt('tableManagementNotAvailable', 'Table Management Not Available')}</h2>
          <p className="mt-2 text-sm">{tt('tableManagementNotAvailableDesc', 'Table management is turned off for this store.')}</p>
          <p className="mt-2 text-sm text-ink/70">{tt('tableManagementNotAvailableHint', 'Enable it under Settings → Feature Flags.')}</p>
        </div>
      )}

      {/* Floor counts, and the keys to show retired tables or add one */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ul className="mr-auto flex flex-wrap gap-2" aria-label={tt('statusKey', 'Status key')}>
          {STATUSES.map((s) => (
            <li key={s} className={`flex min-h-[32px] items-center gap-2 px-2 font-receipt text-xs uppercase ${STATUS_BAND[s]}`}>
              {statusLabels[s]}
              <span className="font-semibold">{activeTables.filter((t) => t.status === s).length}</span>
            </li>
          ))}
        </ul>
        <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive((v) => !v)} className={showInactive ? DARK_KEY_ON : DARK_KEY}>
          <Power className={ICON} strokeWidth={1.75} aria-hidden />
          {tt('showInactive', 'Show inactive')}
        </button>
        {canManage && (
          <button
            type="button"
            onClick={() => openForm(null)}
            disabled={!tableManagementEnabled}
            className={`${DARK_KEY_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand`}
          >
            <Plus className={ICON} strokeWidth={1.75} aria-hidden />
            {tt('addTable', 'Add Table')}
          </button>
        )}
      </div>

      {displayed.length === 0 ? (
        <div className="mt-6">
          <div className="bg-paper-white px-4 py-14 text-center text-ink">
            <Armchair className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
            <p className="font-receipt text-sm text-ink/60">{tt('noTablesYet', 'No tables configured yet')}</p>
            {canManage && tableManagementEnabled && (
              <button type="button" onClick={() => openForm(null)} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                {tt('addTable', 'Add Table')}
              </button>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ) : (
        <ul className={`mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {displayed.map((table) => {
            const busy = busyId === table._id;
            return (
              <li
                key={table._id}
                className={`flex min-w-0 flex-col text-ink ${table.isActive ? 'bg-paper-white' : 'border border-dashed border-white/30 bg-paper-white/60'}`}
              >
                <p className={`px-3 py-1.5 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] ${table.isActive ? STATUS_BAND[table.status] ?? STATUS_BAND.open : 'bg-ink/10 text-ink/60'}`}>
                  {table.isActive ? statusLabels[table.status] ?? statusLabels.open : (dict.admin?.inactive || 'Inactive')}
                </p>
                <div className="flex-1 px-3 pb-3 pt-2">
                  <h3 className={`break-words font-display text-3xl font-bold uppercase leading-none sm:text-4xl ${table.isActive ? '' : 'text-ink/50'}`}>{table.name}</h3>
                  {table.capacity != null && (
                    <p className="mt-2 flex items-center gap-1.5 font-receipt text-xs text-ink/60">
                      <Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                      {table.capacity} {tt('seats', 'seats')}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex justify-end border-t border-dashed border-ink/25">
                    {table.isActive ? (
                      <>
                        {table.status !== 'open' && (
                          <button type="button" disabled={busy} onClick={() => handleResetStatus(table)} className={`${ROW_KEY} disabled:opacity-40`} aria-label={`${resetLabel} ${table.name}`} title={resetLabel}>
                            <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
                          </button>
                        )}
                        <button type="button" disabled={busy} onClick={() => openForm(table)} className={`${ROW_KEY} disabled:opacity-40`} aria-label={`${editLabel} ${table.name}`} title={editLabel}>
                          <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                        <button type="button" disabled={busy} onClick={() => handleDeactivate(table)} className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`} aria-label={`${deactivateLabel} ${table.name}`} title={deactivateLabel}>
                          <Power className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => handleReactivate(table)} className={`${ROW_KEY} w-auto gap-2 px-3 font-receipt text-xs uppercase disabled:opacity-40`} aria-label={`${reactivateLabel} ${table.name}`}>
                        <Power className={ICON} strokeWidth={1.75} aria-hidden />
                        {reactivateLabel}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && activeTables.some((t) => t.status !== 'open') && (
        <p className="mt-4 flex items-center gap-2 font-receipt text-xs text-white/60">
          <RotateCcw className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          {tt('resetToOpenHint', '"Reset to Open" clears stuck occupied status')}
        </p>
      )}

      {showModal && (
        <TableSheet
          table={selectedTable}
          tenant={tenant}
          dict={dict}
          onClose={() => setShowModal(false)}
          onSaved={async () => {
            setShowModal(false);
            await fetchTables();
          }}
        />
      )}
    </RegisterPage>
  );
}

/** Add or rename a table and set how many it seats. */
function TableSheet({ table, tenant, dict, onClose, onSaved }: {
  table: TableRow | null;
  tenant: string;
  dict: TranslationDict;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(table?.name || '');
  const [capacity, setCapacity] = useState(table?.capacity?.toString() || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const tt = (key: string, fallback: string) => dict.tables?.[key] || fallback;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(tt('tableNameRequired', 'Table name is required')); return; }
    const cap = capacity.trim() ? Number(capacity) : null;
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 100)) { setError(tt('capacityError', 'Capacity must be 1–100')); return; }

    setSaving(true);
    try {
      const res = await fetch(table ? `/api/tables/${table._id}?tenant=${tenant}` : `/api/tables?tenant=${tenant}`, {
        method: table ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // null clears the seat count on an edit; a new table simply has none.
        body: JSON.stringify({ name: name.trim(), capacity: cap ?? (table ? null : undefined) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(table ? tt('tableUpdated', 'Table updated') : tt('tableCreated', 'Table created'));
        await onSaved();
      } else {
        setError(data.error || tt('failedToSaveTable', 'Failed to save table'));
      }
    } catch {
      setError(tt('errorSavingTable', 'Error saving table'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={table ? tt('editTable', 'Edit Table') : tt('addTable', 'Add Table')}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="table-form" disabled={saving} className={KEY_PRIMARY}>
            {saving ? (dict.common?.saving || 'Saving...') : table ? tt('saveChanges', 'Save Changes') : tt('addTable', 'Add Table')}
          </button>
        </>
      }
    >
      <form id="table-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="table-form-name" className={LABEL}>{tt('tableName', 'Table Name')} *</label>
          <input
            id="table-form-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
            placeholder={tt('tableNamePlaceholder', 'e.g. T1, Table 5, Patio A')}
            maxLength={50}
            autoFocus
            required
          />
        </div>
        <div>
          <label htmlFor="table-form-capacity" className={LABEL}>{tt('seatingCapacity', 'Seating Capacity')} ({dict.common?.optional || 'optional'})</label>
          <input
            id="table-form-capacity"
            type="number"
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className={`${INPUT} font-receipt`}
            placeholder={tt('capacityPlaceholder', 'e.g. 4')}
            min={1}
            max={100}
          />
          <p className={HINT}>1–100</p>
        </div>
        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
