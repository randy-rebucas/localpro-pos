'use client';

import { useState, useEffect, useCallback } from 'react';
import { hardwareStatusChecker, DeviceStatus, HardwareStatus } from '@/lib/hardware/status-checker';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { showToast } from '@/lib/toast';

interface HardwareStatusProps {
  compact?: boolean;
  showActions?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  sidebar?: boolean;
}

// Win8 flat status colors: solid fill, white text.
const DEVICE_STATUS_BADGE: Record<string, string> = {
  connected: 'bg-win8-success text-white',
  available: 'bg-win8-success text-white',
  disconnected: 'bg-win8-warning text-white',
  error: 'bg-win8-danger text-white',
  'not-configured': 'bg-gray-500 text-white',
};

const DEVICE_STATUS_DOT: Record<string, string> = {
  connected: 'bg-win8-success',
  available: 'bg-win8-success',
  disconnected: 'bg-win8-warning',
  error: 'bg-win8-danger',
  'not-configured': 'bg-gray-300',
};

const OVERALL_STATUS_BADGE: Record<string, string> = {
  'all-connected': 'bg-win8-success text-white',
  partial: 'bg-win8-warning text-white',
  none: 'bg-win8-danger text-white',
};

const SMALL_SPINNER = <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>;

export default function HardwareStatusChecker({
  compact = false,
  showActions = true,
  autoRefresh = true,
  refreshInterval = 10000, // 10 seconds
  sidebar = false,
}: HardwareStatusProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
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
      if (result.success) {
        showToast.success(result.message);
      } else {
        showToast.error(result.message);
      }
      // Refresh status after test
      setTimeout(checkStatus, 1000);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      showToast.error(error.message || dict?.common?.testFailed || 'Test failed');
    } finally {
      setTesting(null);
    }
  }, [checkStatus, dict]);

  const t = (key: string, fallback: string): string =>
    dict?.components?.hardwareStatus?.[key] || dict?.common?.[key] || fallback;

  const getDeviceStatusLabel = (deviceStatus: string) => {
    switch (deviceStatus) {
      case 'connected': return t('statusConnected', 'Connected');
      case 'available': return t('statusAvailable', 'Available');
      case 'disconnected': return t('statusDisconnected', 'Disconnected');
      case 'error': return t('statusError', 'Error');
      case 'not-configured': return t('statusNotConfigured', 'Not Configured');
      default: return deviceStatus.replace('-', ' ');
    }
  };

  const getOverallLabel = (short = false) => {
    if (!status) return '';
    switch (status.overallStatus) {
      case 'all-connected': return t('allConnected', 'All Connected');
      case 'partial': return short ? t('partial', 'Partial') : t('partialConnection', 'Partial Connection');
      default: return t('notConfigured', 'Not Configured');
    }
  };

  const overallBadge = status ? (OVERALL_STATUS_BADGE[status.overallStatus] || 'bg-gray-500 text-white') : 'bg-gray-500 text-white';

  const refreshButton = (
    <button
      type="button"
      onClick={checkStatus}
      disabled={loading}
      title={t('refreshStatus', 'Refresh status')}
      aria-label={t('refreshStatus', 'Refresh status')}
      className="inline-flex items-center justify-center p-2.5 border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
    >
      {loading ? SMALL_SPINNER : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )}
    </button>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {loading && !status ? (
          <span className="text-brand">{SMALL_SPINNER}</span>
        ) : status ? (
          <>
            <span className={`px-2 py-0.5 text-xs font-semibold ${overallBadge}`}>{getOverallLabel(true)}</span>
            <button
              type="button"
              onClick={checkStatus}
              className="text-gray-500 hover:text-gray-700"
              title={t('refreshStatus', 'Refresh status')}
              aria-label={t('refreshStatus', 'Refresh status')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className="text-center py-12 bg-white border border-gray-300">
        <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
        <p className="mt-3 text-gray-400 text-sm">{t('checkingHardwareStatus', 'Checking hardware status…')}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-12 bg-white border border-gray-300">
        <p className="text-win8-danger text-sm font-medium">
          {sidebar ? t('unableToCheckStatus', 'Unable to check status') : t('unableToCheckHardwareStatus', 'Unable to check hardware status')}
        </p>
        <button
          type="button"
          onClick={checkStatus}
          className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
        >
          {dict?.common?.retry || 'Retry'}
        </button>
      </div>
    );
  }

  if (sidebar) {
    return (
      <section className="bg-white border border-gray-300">
        <div className="px-5 py-4 border-b border-gray-300 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t('sidebarTitle', 'Device Status')}</h2>
            <p className="text-xs text-gray-400 tabular-nums">
              {t('lastChecked', 'Last checked: {time}').replace('{time}', status.lastCheck.toLocaleTimeString())}
            </p>
          </div>
          {refreshButton}
        </div>

        <div className={`px-5 py-2 text-xs font-semibold text-center ${overallBadge}`}>{getOverallLabel()}</div>

        {status.devices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400 italic text-center">{t('noDevices', 'No devices')}</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {status.devices.map((device, index) => (
              <li key={index} className="px-5 py-3 flex items-center gap-3">
                <span className={`inline-block w-2.5 h-2.5 shrink-0 ${DEVICE_STATUS_DOT[device.status] || 'bg-gray-300'}`} aria-hidden="true" />
                <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate" title={device.message || device.name}>
                  {device.name}
                </span>
                <span className={`px-2 py-0.5 text-xs font-semibold shrink-0 ${DEVICE_STATUS_BADGE[device.status] || 'bg-gray-500 text-white'}`}>
                  {getDeviceStatusLabel(device.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="bg-white border border-gray-300">
      <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('title', 'Hardware Status')}</h2>
          <p className="text-sm text-gray-500 tabular-nums">
            {t('lastChecked', 'Last checked: {time}').replace('{time}', status.lastCheck.toLocaleTimeString())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-semibold ${overallBadge}`}>{getOverallLabel()}</span>
          {refreshButton}
        </div>
      </div>

      {status.devices.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {t('noHardwareDevicesConfigured', 'No hardware devices configured')}
        </div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {status.devices.map((device: DeviceStatus, index) => (
            <li key={index} className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-gray-100 transition-colors">
              <div className="flex items-start gap-3 min-w-0">
                <span className={`inline-block w-2.5 h-2.5 mt-1.5 shrink-0 ${DEVICE_STATUS_DOT[device.status] || 'bg-gray-300'}`} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900">{device.name}</h3>
                    <span className={`px-2 py-0.5 text-xs font-semibold ${DEVICE_STATUS_BADGE[device.status] || 'bg-gray-500 text-white'}`}>
                      {getDeviceStatusLabel(device.status)}
                    </span>
                  </div>
                  {device.message && <p className="text-xs text-gray-500 mt-1">{device.message}</p>}
                </div>
              </div>
              {showActions && (device.type === 'printer' || device.type === 'cash-drawer') && (
                <button
                  type="button"
                  onClick={() => testDevice(device.type)}
                  disabled={testing === device.type || device.status === 'not-configured'}
                  className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {testing === device.type ? t('testing', 'Testing…') : t('test', 'Test')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
