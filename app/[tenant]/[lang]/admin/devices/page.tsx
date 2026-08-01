'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { getAssignedDeviceId, setAssignedDeviceId } from '@/lib/device-identity';

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

const emptyForm: { label: string; serialNumber: string; terminalId: string; ptuNumber: string; ptuStatus: 'pending' | 'approved' } = {
  label: '', serialNumber: '', terminalId: '', ptuNumber: '', ptuStatus: 'pending',
};

export default function DevicesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assignedDeviceId, setAssignedDeviceIdState] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    setAssignedDeviceIdState(getAssignedDeviceId(tenant));
  }, [tenant]);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/devices?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setDevices(data.data || []);
      } else {
        toast.error(data.error || dict?.admin?.failedToLoadDevices || 'Failed to load devices');
      }
    } catch {
      toast.error(dict?.admin?.failedToLoadDevices || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [tenant, dict]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

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
      const url = editingDevice ? `/api/devices/${editingDevice._id}?tenant=${tenant}` : `/api/devices?tenant=${tenant}`;
      const method = editingDevice ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editingDevice ? (dict?.admin?.deviceUpdated || 'Device updated') : (dict?.admin?.deviceRegistered || 'Device registered'));
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
    try {
      const res = await fetch(`/api/devices/${device._id}?tenant=${tenant}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        toast.success(dict?.admin?.deviceDeactivated || 'Device deactivated');
        fetchDevices();
      } else {
        toast.error(data.error || dict?.admin?.failedToDeactivateDevice || 'Failed to deactivate device');
      }
    } catch {
      toast.error(dict?.admin?.failedToDeactivateDevice || 'Failed to deactivate device');
    }
  };

  const handleAssignThisBrowser = (device: Device) => {
    setAssignedDeviceId(tenant, device._id);
    setAssignedDeviceIdState(device._id);
    const msg = (dict?.admin?.deviceAssignedToBrowser || 'This browser is now assigned to "{label}" ({terminalId})')
      .replace('{label}', device.label)
      .replace('{terminalId}', device.terminalId);
    toast.success(msg);
  };

  const handleUnassign = () => {
    setAssignedDeviceId(tenant, null);
    setAssignedDeviceIdState(null);
    toast.success(dict?.admin?.deviceUnassignedFromBrowser || 'This browser is no longer assigned to a device');
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
    <div className="px-4 sm:px-6 py-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{dict.admin?.devicesTitle || 'Registered Devices (Terminals)'}</h1>
        <p className="text-gray-600">
          {dict.admin?.devicesDescription || 'BIR requires each physical POS terminal (BYOD hardware) to be individually identified with a serial number and Terminal ID, printed on every receipt it prints. Register each device your business uses, and assign this browser to the device it runs on.'}
        </p>
      </div>

      {assignedDeviceId && (
        <div className="mb-4 p-3 bg-brand-soft border border-brand text-sm text-gray-800 flex items-center justify-between">
          <span>
            {dict.admin?.thisBrowserAssignedTo || 'This browser is assigned to:'} <strong>{devices.find((d) => d._id === assignedDeviceId)?.label || assignedDeviceId}</strong>
          </span>
          <button onClick={handleUnassign} className="text-red-600 hover:text-red-800 font-medium">
            {dict.admin?.unassign || 'Unassign'}
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-300 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">{dict.admin?.devicesSectionTitle || 'Devices'}</h2>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover"
          >
            {dict.admin?.registerDevice || 'Register Device'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.deviceLabel || 'Label'}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.deviceTerminalId || 'Terminal ID'}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.deviceSerialNumber || 'Serial Number'}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.devicePtuNumber || 'PTU/AC No.'}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {devices.map((device) => (
                <tr key={device._id}>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{device.label}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{device.terminalId}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{device.serialNumber}</td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{device.ptuNumber || '-'}</td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold border ${
                      !device.isActive ? 'bg-gray-100 text-gray-600 border-gray-300'
                      : device.ptuStatus === 'approved' ? 'bg-green-100 text-green-800 border-green-300'
                      : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                    }`}>
                      {!device.isActive
                        ? (dict.admin?.deviceInactive || 'Inactive')
                        : device.ptuStatus === 'approved'
                          ? (dict.admin?.devicePtuApprovedBadge || 'PTU Approved')
                          : (dict.admin?.devicePtuPendingBadge || 'PTU Pending')}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => openEditModal(device)} className="text-brand hover:text-brand-navy-deep">
                        {dict.common?.edit || 'Edit'}
                      </button>
                      {device.isActive && assignedDeviceId !== device._id && (
                        <button onClick={() => handleAssignThisBrowser(device)} className="text-blue-600 hover:text-blue-900">
                          {dict.admin?.assignThisBrowser || 'Assign this browser'}
                        </button>
                      )}
                      {device.isActive && (
                        <button onClick={() => handleDeactivate(device)} className="text-orange-600 hover:text-orange-900">
                          {dict.admin?.deactivate || 'Deactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {devices.length === 0 && (
            <div className="text-center py-8 text-gray-500">{dict.admin?.noDevicesRegistered || 'No devices registered yet'}</div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                {editingDevice ? (dict.admin?.editDevice || 'Edit Device') : (dict.admin?.registerDevice || 'Register Device')}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{dict.admin?.deviceLabel || 'Label'} *</label>
                  <input
                    type="text"
                    required
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder={dict.admin?.deviceLabelPlaceholder || 'e.g. Front Counter iPad'}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.admin?.deviceTerminalId || 'Terminal ID'} *</label>
                    <input
                      type="text"
                      required
                      value={formData.terminalId}
                      onChange={(e) => setFormData({ ...formData, terminalId: e.target.value })}
                      placeholder={dict.admin?.terminalIdPlaceholder || 'e.g. T-01'}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.admin?.deviceSerialNumber || 'Serial Number'} *</label>
                    <input
                      type="text"
                      required
                      value={formData.serialNumber}
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      placeholder={dict.admin?.serialNumberPlaceholder || 'Hardware serial number'}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.admin?.devicePtuNumber || 'PTU / AC Number'}</label>
                    <input
                      type="text"
                      value={formData.ptuNumber}
                      onChange={(e) => setFormData({ ...formData, ptuNumber: e.target.value })}
                      placeholder={dict.admin?.ptuNumberPlaceholder || 'Issued after RDO approval'}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.admin?.ptuStatusLabel || 'PTU Status'}</label>
                    <select
                      value={formData.ptuStatus}
                      onChange={(e) => setFormData({ ...formData, ptuStatus: e.target.value as 'pending' | 'approved' })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    >
                      <option value="pending">{dict.admin?.ptuPending || 'Pending'}</option>
                      <option value="approved">{dict.admin?.ptuApproved || 'Approved'}</option>
                    </select>
                  </div>
                </div>
                {error && (
                  <div className="bg-red-50 text-red-800 border border-red-300 p-3">{error}</div>
                )}
                <div className="flex gap-3 justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
                  >
                    {dict.common?.cancel || 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-brand text-white hover:bg-brand-hover border border-brand-hover disabled:opacity-50"
                  >
                    {saving ? (dict.admin?.saving || 'Saving...') : (dict.common?.save || 'Save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
