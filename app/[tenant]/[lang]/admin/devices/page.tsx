'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { showToast } from '@/lib/toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { getAssignedDeviceId, setAssignedDeviceId } from '@/lib/device-identity';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';

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

const emptyForm: { label: string; serialNumber: string; terminalId: string; branchId: string; ptuNumber: string; ptuStatus: 'pending' | 'approved' } = {
  label: '', serialNumber: '', terminalId: '', branchId: '', ptuNumber: '', ptuStatus: 'pending',
};

type DeviceState = 'inactive' | 'approved' | 'pending';

const STATUS_BADGE: Record<DeviceState, string> = {
  approved: 'bg-win8-success text-white',
  pending: 'bg-win8-warning text-white',
  inactive: 'bg-gray-500 text-white',
};

const deviceState = (d: Device): DeviceState => (!d.isActive ? 'inactive' : d.ptuStatus === 'approved' ? 'approved' : 'pending');

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 transition-[filter]';

export default function DevicesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canCreate = canAccess('devices.create');
  const canEdit = canAccess('devices.edit');
  // Deactivating a device is DELETE /api/devices/[id].
  const canDelete = canAccess('devices.delete');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [devices, setDevices] = useState<Device[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assignedDeviceId, setAssignedDeviceIdState] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    setAssignedDeviceIdState(getAssignedDeviceId(tenant));
  }, [tenant]);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/devices', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setDevices(data.data || []);
      } else {
        setLoadError(data.error || dict?.admin?.failedToLoadDevices || 'Failed to load devices');
      }
    } catch {
      setLoadError(dict?.admin?.failedToLoadDevices || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [dict]);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/branches?isActive=true', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setBranches(data.data || []);
      }
    } catch {
      // Non-fatal: branch dropdown just stays empty if this fails.
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchBranches();
  }, [fetchDevices, fetchBranches]);

  const openAddModal = () => {
    setEditingDevice(null);
    setFormData(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEditModal = (device: Device) => {
    setEditingDevice(device);
    setFormData({
      label: device.label,
      serialNumber: device.serialNumber,
      terminalId: device.terminalId,
      branchId: typeof device.branchId === 'string' ? device.branchId : device.branchId?._id || '',
      ptuNumber: device.ptuNumber || '',
      ptuStatus: device.ptuStatus,
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = editingDevice ? `/api/devices/${editingDevice._id}` : '/api/devices';
      const method = editingDevice ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...formData, branchId: formData.branchId || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(editingDevice ? (dict?.admin?.deviceUpdated || 'Device updated') : (dict?.admin?.deviceRegistered || 'Device registered'));
        setShowModal(false);
        fetchDevices();
      } else {
        setError(data.error || dict?.admin?.failedToSaveDevice || 'Failed to save device');
      }
    } catch {
      setError(dict?.admin?.failedToSaveDevice || 'Failed to save device');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (device: Device) => {
    const confirmMsg = (dict?.admin?.deactivateDeviceConfirm || 'Deactivate device "{label}"? Past receipts will still show its serial number.')
      .replace('{label}', device.label);
    if (!confirm(confirmMsg)) return;
    setDeactivatingId(device._id);
    try {
      const res = await fetch(`/api/devices/${device._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(dict?.admin?.deviceDeactivated || 'Device deactivated');
        fetchDevices();
      } else {
        showToast.error(data.error || dict?.admin?.failedToDeactivateDevice || 'Failed to deactivate device');
      }
    } catch {
      showToast.error(dict?.admin?.failedToDeactivateDevice || 'Failed to deactivate device');
    } finally {
      setDeactivatingId(null);
    }
  };

  const handleAssignThisBrowser = (device: Device) => {
    setAssignedDeviceId(tenant, device._id);
    setAssignedDeviceIdState(device._id);
    const msg = (dict?.admin?.deviceAssignedToBrowser || 'This browser is now assigned to "{label}" ({terminalId})')
      .replace('{label}', device.label)
      .replace('{terminalId}', device.terminalId);
    showToast.success(msg);
  };

  const handleUnassign = () => {
    setAssignedDeviceId(tenant, null);
    setAssignedDeviceIdState(null);
    showToast.success(dict?.admin?.deviceUnassignedFromBrowser || 'This browser is no longer assigned to a device');
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const statusLabel = (d: Device) => {
    const state = deviceState(d);
    if (state === 'inactive') return dict.admin?.deviceInactive || 'Inactive';
    if (state === 'approved') return dict.admin?.devicePtuApprovedBadge || 'PTU Approved';
    return dict.admin?.devicePtuPendingBadge || 'PTU Pending';
  };

  const branchName = (d: Device) =>
    (typeof d.branchId === 'object' ? d.branchId?.name : branches.find((b) => b._id === d.branchId)?.name) || '—';

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingDevices || 'Loading devices…'}</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{loadError}</p>
          <button
            type="button"
            onClick={fetchDevices}
            className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (devices.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {dict.admin?.noDevicesRegistered || 'No devices registered yet'}
        </div>
      );
    }

    const editLabel = dict.common?.edit || 'Edit';
    const assignLabel = dict.admin?.assignThisBrowser || 'Assign this browser';
    const deactivateLabel = dict.admin?.deactivate || 'Deactivate';

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.deviceLabel || 'Label'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.deviceTerminalId || 'Terminal ID'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.deviceSerialNumber || 'Serial Number'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.deviceBranch || 'Branch'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.devicePtuNumber || 'PTU/AC No.'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {devices.map((device) => {
              const isThisBrowser = assignedDeviceId === device._id;
              return (
                <tr key={device._id} className={`hover:bg-gray-100 transition-colors ${isThisBrowser ? 'bg-brand-soft' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium text-gray-900">{device.label}</p>
                    {isThisBrowser && (
                      <p className="text-xs text-brand font-semibold">{dict.admin?.thisBrowser || 'This browser'}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700">{device.terminalId}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700">{device.serialNumber}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{branchName(device)}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700">{device.ptuNumber || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[deviceState(device)]}`}>
                      {statusLabel(device)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal(device)}
                          title={editLabel}
                          aria-label={`${editLabel}: ${device.label}`}
                          className={`${ICON_BUTTON} bg-brand`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                          </svg>
                        </button>
                      )}
                      {device.isActive && !isThisBrowser && (
                        <button
                          type="button"
                          onClick={() => handleAssignThisBrowser(device)}
                          title={assignLabel}
                          aria-label={`${assignLabel}: ${device.label}`}
                          className={`${ICON_BUTTON} bg-win8-info`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v11H4zM8 20h8M12 16v4" />
                          </svg>
                        </button>
                      )}
                      {canDelete && device.isActive && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(device)}
                          disabled={deactivatingId === device._id}
                          title={deactivateLabel}
                          aria-label={`${deactivateLabel}: ${device.label}`}
                          className={`${ICON_BUTTON} bg-win8-danger disabled:opacity-50`}
                        >
                          {deactivatingId === device._id ? (
                            <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const inputClass = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';
  const required = <span className="text-win8-danger">*</span>;

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.devicesTitle || 'Registered Devices (Terminals)'}
          description={dict.admin?.devicesDescription || 'BIR requires each physical POS terminal (BYOD hardware) to be individually identified with a serial number and Terminal ID, printed on every receipt it prints. Register each device your business uses, and assign this browser to the device it runs on.'}
        />

        <div className="space-y-4">
          {assignedDeviceId && (
            <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy flex flex-wrap items-center justify-between gap-2">
              <span>
                {dict.admin?.thisBrowserAssignedTo || 'This browser is assigned to:'}{' '}
                <strong>{devices.find((d) => d._id === assignedDeviceId)?.label || assignedDeviceId}</strong>
              </span>
              <button
                type="button"
                onClick={handleUnassign}
                className="inline-flex items-center justify-center px-4 py-2 border border-win8-danger bg-white text-win8-danger text-sm font-medium hover:bg-gray-100 transition-colors"
              >
                {dict.admin?.unassign || 'Unassign'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <h2 className="text-sm font-bold text-gray-900">
              {dict.admin?.devicesSectionTitle || 'Devices'}
              {!loading && !loadError && (
                <span className="ml-2 text-xs font-normal text-gray-500 tabular-nums">{devices.length.toLocaleString()}</span>
              )}
            </h2>
            {canCreate && (
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                + {dict.admin?.registerDevice || 'Register Device'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showModal} onClose={() => setShowModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">
            {editingDevice ? (dict.admin?.editDevice || 'Edit Device') : (dict.admin?.registerDevice || 'Register Device')}
          </h2>
          <button
            type="button"
            onClick={() => setShowModal(false)}
            title={dict.common?.close || 'Close'}
            aria-label={dict.common?.close || 'Close'}
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
              <label htmlFor="device-label" className={labelClass}>{dict.admin?.deviceLabel || 'Label'} {required}</label>
              <input
                id="device-label"
                type="text"
                required
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder={dict.admin?.deviceLabelPlaceholder || 'e.g. Front Counter iPad'}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="device-terminal" className={labelClass}>{dict.admin?.deviceTerminalId || 'Terminal ID'} {required}</label>
                <input
                  id="device-terminal"
                  type="text"
                  required
                  value={formData.terminalId}
                  onChange={(e) => setFormData({ ...formData, terminalId: e.target.value })}
                  placeholder={dict.admin?.terminalIdPlaceholder || 'e.g. T-01'}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="device-serial" className={labelClass}>{dict.admin?.deviceSerialNumber || 'Serial Number'} {required}</label>
                <input
                  id="device-serial"
                  type="text"
                  required
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  placeholder={dict.admin?.serialNumberPlaceholder || 'Hardware serial number'}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="device-branch" className={labelClass}>{dict.admin?.deviceBranch || 'Branch'}</label>
              <select
                id="device-branch"
                value={formData.branchId}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                className={inputClass}
              >
                <option value="">{dict.admin?.deviceNoBranch || 'Unassigned'}</option>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>
            <hr className="border-gray-300" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="device-ptu" className={labelClass}>{dict.admin?.devicePtuNumber || 'PTU / AC Number'}</label>
                <input
                  id="device-ptu"
                  type="text"
                  value={formData.ptuNumber}
                  onChange={(e) => setFormData({ ...formData, ptuNumber: e.target.value })}
                  placeholder={dict.admin?.ptuNumberPlaceholder || 'Issued after RDO approval'}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="device-ptu-status" className={labelClass}>{dict.admin?.ptuStatusLabel || 'PTU Status'}</label>
                <select
                  id="device-ptu-status"
                  value={formData.ptuStatus}
                  onChange={(e) => setFormData({ ...formData, ptuStatus: e.target.value as 'pending' | 'approved' })}
                  className={inputClass}
                >
                  <option value="pending">{dict.admin?.ptuPending || 'Pending'}</option>
                  <option value="approved">{dict.admin?.ptuApproved || 'Approved'}</option>
                </select>
              </div>
            </div>
            {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
