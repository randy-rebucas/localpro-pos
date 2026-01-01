'use client';

import { useState, useEffect, useCallback } from 'react';
import { hardwareStatusChecker, DeviceStatus, HardwareStatus } from '@/lib/hardware/status-checker';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface HardwareStatusProps {
  compact?: boolean;
  showActions?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  sidebar?: boolean;
}

export default function HardwareStatusChecker({
  compact = false,
  showActions = true,
  autoRefresh = true,
  refreshInterval = 10000, // 10 seconds
  sidebar = false,
}: HardwareStatusProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null);
  const [status, setStatus] = useState<HardwareStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      const currentStatus = await hardwareStatusChecker.checkAllDevices();
      setStatus(currentStatus);
    } catch (error) {
      console.error('Failed to check hardware status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();

    if (autoRefresh) {
      const interval = setInterval(checkStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [checkStatus, autoRefresh, refreshInterval]);

  const testDevice = useCallback(async (deviceType: string) => {
    setTesting(deviceType);
    try {
      const result = await hardwareStatusChecker.testDevice(deviceType);
      alert(result.message);
      // Refresh status after test
      setTimeout(checkStatus, 1000);
    } catch (error: any) {
      alert(error.message || dict?.common?.testFailed || 'Test failed');
    } finally {
      setTesting(null);
    }
  }, [checkStatus]);

  const getStatusColor = (deviceStatus: DeviceStatus) => {
    switch (deviceStatus.status) {
      case 'connected':
      case 'available':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'disconnected':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'not-configured':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (deviceStatus: DeviceStatus) => {
    switch (deviceStatus.status) {
      case 'connected':
      case 'available':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'disconnected':
        return (
          <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'not-configured':
        return (
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getOverallStatusColor = () => {
    if (!status) return 'bg-gray-100';
    switch (status.overallStatus) {
      case 'all-connected':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'none':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {loading ? (
          <div className="animate-spin h-4 w-4 border-b-2 border-blue-600"></div>
        ) : status ? (
          <>
            <div className={`px-2 py-1 border border-gray-300 text-xs font-medium ${getOverallStatusColor()}`}>
              {status.overallStatus === 'all-connected' ? (dict?.components?.hardwareStatus?.allConnected || dict?.common?.allConnected || 'All Connected') :
               status.overallStatus === 'partial' ? (dict?.components?.hardwareStatus?.partial || dict?.common?.partial || 'Partial') : (dict?.components?.hardwareStatus?.notConfigured || dict?.common?.notConfigured || 'Not Configured')}
            </div>
            <button
              onClick={checkStatus}
              className="text-gray-500 hover:text-gray-700"
              title={dict?.common?.refreshStatus || 'Refresh status'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className={`bg-white border border-gray-300 ${sidebar ? 'p-4' : 'p-6'}`}>
        <div className={`flex items-center justify-center ${sidebar ? 'py-4' : 'py-8'}`}>
          <div className={`animate-spin border-b-2 border-blue-600 ${sidebar ? 'h-6 w-6' : 'h-8 w-8'}`}></div>
          {!sidebar && <span className="ml-3 text-gray-600">{dict?.components?.hardwareStatus?.checkingHardwareStatus || 'Checking hardware status...'}</span>}
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={`bg-white border border-gray-300 ${sidebar ? 'p-4' : 'p-6'}`}>
        <p className={`text-gray-600 ${sidebar ? 'text-sm' : ''}`}>
          {sidebar ? (dict?.common?.unableToCheckStatus || 'Unable to check status') : (dict?.common?.unableToCheckHardwareStatus || 'Unable to check hardware status')}
        </p>
      </div>
    );
  }

  if (sidebar) {
    return (
      <div className="bg-white border border-gray-300 p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Status</h3>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="p-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-50"
            title={dict?.common?.refreshStatus || 'Refresh status'}
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="mb-3">
          <div className={`px-2 py-1 border border-gray-300 text-xs font-medium text-center ${getOverallStatusColor()}`}>
            {status.overallStatus === 'all-connected' ? (dict?.common?.allConnected || 'All Connected') :
             status.overallStatus === 'partial' ? (dict?.common?.partialConnection || 'Partial Connection') : (dict?.common?.notConfigured || 'Not Configured')}
          </div>
        </div>

        <div className="space-y-2">
          {status.devices.map((device, index) => (
            <div
              key={index}
              className={`border border-gray-300 p-2.5 ${getStatusColor(device)}`}
            >
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  {getStatusIcon(device)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <h4 className="text-sm font-semibold text-gray-900 truncate">{device.name}</h4>
                  </div>
                  <span className={`px-1.5 py-0.5 border border-gray-300 text-xs font-medium ${
                    device.status === 'connected' || device.status === 'available'
                      ? 'bg-green-100 text-green-800'
                      : device.status === 'disconnected'
                      ? 'bg-yellow-100 text-yellow-800'
                      : device.status === 'error'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {device.status.replace('-', ' ')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {status.devices.length === 0 && (
          <div className="text-center py-4 text-gray-500 text-sm">
            <p>{dict?.components?.hardwareStatus?.noDevices || 'No devices'}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-300 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{dict?.components?.hardwareStatus?.title || 'Hardware Status'}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {(dict?.components?.hardwareStatus?.lastChecked || 'Last checked: {time}').replace('{time}', status.lastCheck.toLocaleTimeString())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 border border-gray-300 text-sm font-medium ${getOverallStatusColor()}`}>
            {status.overallStatus === 'all-connected' ? (dict?.components?.hardwareStatus?.allConnected || dict?.common?.allConnected || 'All Connected') :
             status.overallStatus === 'partial' ? (dict?.components?.hardwareStatus?.partialConnection || dict?.common?.partialConnection || 'Partial Connection') : (dict?.components?.hardwareStatus?.notConfigured || dict?.common?.notConfigured || 'Not Configured')}
          </div>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
            title={dict?.common?.refreshStatus || 'Refresh status'}
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {status.devices.map((device, index) => (
          <div
            key={index}
            className={`border border-gray-300 p-4 ${getStatusColor(device)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                {getStatusIcon(device)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{device.name}</h3>
                    <span className={`px-2 py-0.5 border border-gray-300 text-xs font-medium ${
                      device.status === 'connected' || device.status === 'available'
                        ? 'bg-green-100 text-green-800'
                        : device.status === 'disconnected'
                        ? 'bg-yellow-100 text-yellow-800'
                        : device.status === 'error'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {device.status.replace('-', ' ')}
                    </span>
                  </div>
                  {device.message && (
                    <p className="text-sm text-gray-600 mt-1">{device.message}</p>
                  )}
                </div>
              </div>
              {showActions && (
                <div className="flex items-center gap-2 ml-4">
                  {(device.type === 'printer' || device.type === 'cash-drawer') && (
                    <button
                      onClick={() => testDevice(device.type)}
                      disabled={testing === device.type || device.status === 'not-configured'}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed border border-blue-700"
                    >
                      {testing === device.type ? (dict?.components?.hardwareStatus?.testing || 'Testing...') : (dict?.components?.hardwareStatus?.test || 'Test')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {status.devices.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>{dict?.components?.hardwareStatus?.noHardwareDevicesConfigured || 'No hardware devices configured'}</p>
        </div>
      )}
    </div>
  );
}

