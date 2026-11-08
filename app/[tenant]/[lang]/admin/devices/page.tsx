'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { MonitorSmartphone, Pencil, Plus, Power, Unplug } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, DARK_KEY, DARK_KEY_PRIMARY, HINT, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getAssignedDeviceId, setAssignedDeviceId } from '@/lib/device-identity';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';
import { formatDate } from '@/lib/formatting';

interface Device {
  _id: string;
  label: string;
  serialNumber: string;
  terminalId: string;
  ptuNumber?: string;
  ptuStatus: 'pending' | 'approved';
  isActive: boolean;
  branchId?: { _id: string; name: string } | string;
  createdAt: string;
}

interface Branch {
  _id: string;
  name: string;
}

type DeviceForm = { label: string; serialNumber: string; terminalId: string; branchId: string; ptuNumber: string; ptuStatus: 'pending' | 'approved' };

const emptyForm: DeviceForm = {
  label: '', serialNumber: '', terminalId: '', branchId: '', ptuNumber: '', ptuStatus: 'pending',
};

export default function DevicesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('devices.manage');
  const { settings } = useTenantSettings();
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Device | null | undefined>(undefined); // undefined: closed, null: new device
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignedDeviceId, setAssignedDeviceIdState] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    setAssignedDeviceIdState(getAssignedDeviceId(tenant));
  }, [tenant]);

  // Read the dictionary through a ref so its arrival does not refetch the list.
  const dictRef = useRef(dict);
  useEffect(() => { dictRef.current = dict; }, [dict]);
  const t = useCallback((key: string, fallback: string) => dict?.admin?.[key] || fallback, [dict]);

  const fetchDevices = useCallback(async () => {
    const fail = () => dictRef.current?.admin?.failedToLoadDevices || 'Failed to load devices';
    try {
      setLoading(true);
      const res = await fetch('/api/devices', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setDevices(data.data || []);
      else toast.error(data.error || fail());
    } catch {
      toast.error(fail());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/branches?isActive=true', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setBranches(data.data || []);
    } catch {
      // Non-fatal: the branch picker just stays empty if this fails.
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    if (canManage) fetchBranches();
  }, [fetchDevices, fetchBranches, canManage]);

  /** PUT or DELETE one device, then refetch. */
  const send = async (device: Device, method: 'PUT' | 'DELETE', ok: string, fail: string) => {
    setBusyId(device._id);
    try {
      const res = await fetch(`/api/devices/${device._id}`, {
        method,
        credentials: 'include',
        headers: method === 'PUT' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'PUT' ? JSON.stringify({ isActive: true }) : undefined,
      });
      const data = await res.json();
      if (data.success) {
        toast.success(ok);
        await fetchDevices();
      } else {
        toast.error(data.error || fail);
      }
    } catch {
      toast.error(fail);
    } finally {
      setBusyId(null);
    }
  };

  const handleDeactivate = async (device: Device) => {
    const ok = await confirm(
      t('deactivateDeviceTitle', 'Deactivate this terminal?'),
      t('deactivateDeviceConfirm', 'Deactivate device "{label}"? Past receipts will still show its serial number.').replace('{label}', device.label),
      { variant: 'warning', confirmText: t('deactivate', 'Deactivate'), cancelText: dict?.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    await send(device, 'DELETE', t('deviceDeactivated', 'Device deactivated'), t('failedToDeactivateDevice', 'Failed to deactivate device'));
  };

  const handleActivate = (device: Device) =>
    send(device, 'PUT', t('deviceActivated', 'Device activated'), t('failedToActivateDevice', 'Failed to activate device'));

  const handleAssignThisBrowser = (device: Device) => {
    setAssignedDeviceId(tenant, device._id);
    setAssignedDeviceIdState(device._id);
    toast.success(
      t('deviceAssignedToBrowser', 'This browser is now assigned to "{label}" ({terminalId})')
        .replace('{label}', device.label)
        .replace('{terminalId}', device.terminalId)
    );
  };

  const handleUnassign = () => {
    setAssignedDeviceId(tenant, null);
    setAssignedDeviceIdState(null);
    toast.success(t('deviceUnassignedFromBrowser', 'This browser is no longer assigned to a device'));
  };

  // Show the spinner only for the first load, so refetches after a save keep the page (and any open sheet) mounted.
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

  const activeCount = devices.filter((d) => d.isActive).length;
  const ordered = [...devices].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const assigned = assignedDeviceId ? devices.find((d) => d._id === assignedDeviceId) : undefined;
  // Sales only carry a terminal ID when the assigned device is active (see /api/transactions).
  const assignedUsable = !!assigned?.isActive;
  const branchName = (d: Device) =>
    typeof d.branchId === 'object' && d.branchId ? d.branchId.name : branches.find((b) => b._id === d.branchId)?.name;
  const editLabel = dict.common?.edit || 'Edit';

  return (
    <RegisterPage
      tagNo="TM"
      tag={settings?.companyName}
      title={t('devicesSectionTitle', 'Devices')}
      side={<LedReadout value={`${activeCount}/${devices.length}`} label={t('activeNow', 'Active')} />}
    >
      {ConfirmDialog}
      <p className="mt-3 max-w-3xl text-sm text-paper/70">
        {t('devicesDescription', 'BIR requires each physical POS terminal (BYOD hardware) to be individually identified with a serial number and Terminal ID, printed on every receipt it prints. Register each device your business uses, and assign this browser to the device it runs on.')}
      </p>

      {/* Which terminal this browser prints as */}
      <div className="mt-6 flex flex-wrap items-center gap-3 border border-white/15 bg-black/20 px-4 py-3">
        <MonitorSmartphone className="h-5 w-5 shrink-0 text-[#8fe3d0]" strokeWidth={1.75} aria-hidden />
        <p className="mr-auto min-w-0 font-receipt text-sm text-paper">
          {assignedDeviceId ? (
            <>
              {t('thisBrowserAssignedTo', 'This browser is assigned to:')}{' '}
              <strong className="text-paper-white">{assigned ? `${assigned.terminalId} · ${assigned.label}` : '—'}</strong>
            </>
          ) : (
            t('browserNotAssigned', 'This browser is not assigned to a terminal. Its sales print no terminal ID.')
          )}
        </p>
        {assignedDeviceId && (
          <button type="button" onClick={handleUnassign} className={DARK_KEY}>
            <Unplug className={ICON} strokeWidth={1.75} aria-hidden />
            {t('unassign', 'Unassign')}
          </button>
        )}
        {canManage && (
          <button type="button" onClick={() => setEditing(null)} className={DARK_KEY_PRIMARY}>
            <Plus className={ICON} strokeWidth={1.75} aria-hidden />
            {t('registerDevice', 'Register Device')}
          </button>
        )}
      </div>
      {assignedDeviceId && !assignedUsable && (
        <div className="mt-3">
          <Strip tone="error">
            {t('assignedDeviceInactive', 'The terminal this browser is assigned to is inactive or no longer registered, so its sales print no terminal ID. Assign an active terminal.')}
          </Strip>
        </div>
      )}

      {devices.length === 0 ? (
        <div className="mt-6">
          <div className="bg-paper-white px-4 py-14 text-center text-ink">
            <MonitorSmartphone className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
            <p className="font-receipt text-sm text-ink/60">{t('noDevicesRegistered', 'No devices registered yet')}</p>
            {canManage && (
              <button type="button" onClick={() => setEditing(null)} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                {t('registerDevice', 'Register Device')}
              </button>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ) : (
        <ul className={`mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {ordered.map((device) => {
            const isThis = device._id === assignedDeviceId;
            const busy = busyId === device._id;
            const approved = device.ptuStatus === 'approved';
            return (
              // Each terminal is a tag: its ID up top, then what BIR prints from it.
              <li key={device._id} className={`flex min-w-0 flex-col text-ink ${device.isActive ? 'bg-paper-white' : 'border border-dashed border-white/30 bg-paper-white/60'}`}>
                <div className={`flex items-center justify-between gap-2 px-4 py-2 ${device.isActive ? 'bg-ink text-paper-white' : 'bg-ink/10 text-ink/60'}`}>
                  <span className={`font-led text-3xl leading-none ${device.isActive ? 'text-[#7df0d6]' : ''}`}>{device.terminalId}</span>
                  <span className="font-receipt text-[11px] font-medium uppercase tracking-[0.08em]">
                    {!device.isActive
                      ? t('deviceInactive', 'Inactive')
                      : approved ? t('devicePtuApprovedBadge', 'PTU Approved') : t('devicePtuPendingBadge', 'PTU Pending')}
                  </span>
                </div>
                <div className="flex-1 px-4 pb-4 pt-3">
                  <h3 className={`flex flex-wrap items-baseline gap-x-2 break-words font-display text-3xl font-bold uppercase leading-none ${device.isActive ? '' : 'text-ink/50'}`}>
                    <span className="min-w-0 break-words">{device.label}</span>
                    {isThis && <span className="font-receipt text-xs font-medium normal-case tracking-normal text-brand-hover">{t('thisBrowserTag', '(this browser)')}</span>}
                  </h3>
                  <div className="mt-3 space-y-1 border-t border-dashed border-ink/30 pt-3 font-receipt text-xs">
                    <ReceiptRow label={<span className="whitespace-nowrap">{t('deviceSerialNumber', 'Serial Number')}</span>} value={<span className="block max-w-[10rem] truncate sm:max-w-[13rem]" title={device.serialNumber}>{device.serialNumber}</span>} />
                    <ReceiptRow label={<span className="whitespace-nowrap">{t('devicePtuNumber', 'PTU/AC No.')}</span>} value={device.ptuNumber || (approved ? <span className="text-stamp">{t('ptuNumberMissing', 'Missing')}</span> : '—')} />
                    <ReceiptRow label={<span className="whitespace-nowrap">{t('deviceBranch', 'Branch')}</span>} value={<span className="block max-w-[10rem] truncate sm:max-w-[13rem]">{branchName(device) || t('deviceNoBranch', 'Unassigned')}</span>} />
                    {settings && device.createdAt && (
                      <ReceiptRow label={<span className="whitespace-nowrap">{t('deviceRegisteredOn', 'Registered')}</span>} value={formatDate(device.createdAt, settings)} />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-end border-t border-dashed border-ink/25">
                  {device.isActive && !isThis && (
                    <button type="button" onClick={() => handleAssignThisBrowser(device)} className={`${ROW_KEY} mr-auto w-auto gap-2 px-3 font-receipt text-xs uppercase`}>
                      <MonitorSmartphone className={ICON} strokeWidth={1.75} aria-hidden />
                      {t('assignThisBrowser', 'Assign this browser')}
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button type="button" disabled={busy} onClick={() => setEditing(device)} className={`${ROW_KEY} disabled:opacity-40`} aria-label={`${editLabel} ${device.label}`} title={editLabel}>
                        <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                      </button>
                      {device.isActive ? (
                        <button type="button" disabled={busy} onClick={() => handleDeactivate(device)} className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`} aria-label={`${t('deactivate', 'Deactivate')} ${device.label}`} title={t('deactivate', 'Deactivate')}>
                          <Power className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => handleActivate(device)} className={`${ROW_KEY} w-auto gap-2 px-3 font-receipt text-xs uppercase disabled:opacity-40`} aria-label={`${t('activate', 'Activate')} ${device.label}`}>
                          <Power className={ICON} strokeWidth={1.75} aria-hidden />
                          {t('activate', 'Activate')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing !== undefined && (
        <DeviceSheet
          device={editing}
          branches={branches}
          dict={dict}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await fetchDevices();
          }}
        />
      )}
    </RegisterPage>
  );
}

/** Register a terminal, or change its details and PTU status. */
function DeviceSheet({ device, branches, dict, onClose, onSaved }: {
  device: Device | null;
  branches: Branch[];
  dict: TranslationDict;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const [form, setForm] = useState<DeviceForm>(() => device ? {
    label: device.label,
    serialNumber: device.serialNumber,
    terminalId: device.terminalId,
    branchId: typeof device.branchId === 'string' ? device.branchId : device.branchId?._id || '',
    ptuNumber: device.ptuNumber || '',
    ptuStatus: device.ptuStatus,
  } : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Keep the current branch selectable even if it has since been deactivated.
  const currentBranch = device && typeof device.branchId === 'object' && device.branchId ? device.branchId : null;
  const branchChoices = currentBranch && !branches.some((b) => b._id === currentBranch._id) ? [currentBranch, ...branches] : branches;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    const fail = t('failedToSaveDevice', 'Failed to save device');
    try {
      const res = await fetch(device ? `/api/devices/${device._id}` : '/api/devices', {
        method: device ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // An emptied branch or PTU number is sent as '' on an edit so the server clears it.
        body: JSON.stringify({ ...form, branchId: form.branchId || (device ? '' : undefined), ptuNumber: form.ptuNumber.trim() || (device ? '' : undefined) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(device ? t('deviceUpdated', 'Device updated') : t('deviceRegistered', 'Device registered'));
        await onSaved();
      } else {
        setError(data.error || fail);
      }
    } catch {
      setError(fail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={device ? t('editDevice', 'Edit Device') : t('registerDevice', 'Register Device')}
      subtitle={device ? `${device.terminalId} · ${device.label}` : undefined}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="device-form" disabled={saving} className={KEY_PRIMARY}>
            {saving ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="device-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="device-label" className={LABEL}>{t('deviceLabel', 'Label')} *</label>
          <input id="device-label" type="text" required autoFocus maxLength={80} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t('deviceLabelPlaceholder', 'e.g. Front Counter iPad')} className={INPUT} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="device-terminal" className={LABEL}>{t('deviceTerminalId', 'Terminal ID')} *</label>
            <input id="device-terminal" type="text" required maxLength={20} value={form.terminalId} onChange={(e) => setForm({ ...form, terminalId: e.target.value })} placeholder={t('terminalIdPlaceholder', 'e.g. T-01')} className={`${INPUT} font-receipt`} />
          </div>
          <div>
            <label htmlFor="device-serial" className={LABEL}>{t('deviceSerialNumber', 'Serial Number')} *</label>
            <input id="device-serial" type="text" required maxLength={80} value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} placeholder={t('serialNumberPlaceholder', 'Hardware serial number')} className={`${INPUT} font-receipt`} />
          </div>
        </div>
        {device && <p className={HINT}>{t('deviceIdChangeHint', 'Receipts already printed keep the terminal ID and serial number they were printed with.')}</p>}
        <div>
          <label htmlFor="device-branch" className={LABEL}>{t('deviceBranch', 'Branch')}</label>
          <select id="device-branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={INPUT}>
            <option value="">{t('deviceNoBranch', 'Unassigned')}</option>
            {branchChoices.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className={LABEL}>{t('ptuStatusLabel', 'PTU Status')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['pending', 'approved'] as const).map((s) => {
              const on = form.ptuStatus === s;
              return (
                <label key={s} className={`flex min-h-[44px] cursor-pointer items-center justify-center border px-2 font-receipt text-xs font-medium uppercase tracking-[0.08em] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-hover ${on ? 'border-ink bg-ink text-paper-white' : 'border-ink/25 text-ink hover:bg-paper'}`}>
                  <input type="radio" name="device-ptu-status" value={s} checked={on} onChange={() => setForm({ ...form, ptuStatus: s })} className="sr-only" />
                  {s === 'approved' ? t('ptuApproved', 'Approved') : t('ptuPending', 'Pending')}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <label htmlFor="device-ptu" className={LABEL}>{t('devicePtuNumber', 'PTU/AC No.')}</label>
          <input id="device-ptu" type="text" maxLength={60} value={form.ptuNumber} onChange={(e) => setForm({ ...form, ptuNumber: e.target.value })} placeholder={t('ptuNumberPlaceholder', 'Issued after RDO approval')} className={`${INPUT} font-receipt`} />
          {form.ptuStatus === 'approved' && !form.ptuNumber.trim() && (
            <p className={HINT}>{t('ptuNumberMissingHint', 'An approved terminal should have the PTU/AC number from its permit.')}</p>
          )}
        </div>
        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
