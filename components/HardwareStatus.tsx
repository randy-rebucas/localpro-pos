'use client';

import { useState, useEffect, useCallback } from 'react';
import { hardwareStatusChecker, HardwareStatus } from '@/lib/hardware/status-checker';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

interface HardwareStatusProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  /** Kept for existing callers; the badge is the only layout. The admin hardware page draws its own panel. */
  compact?: boolean;
}

/** The small overall hardware badge with a refresh button, shown on the register. */
export default function HardwareStatusChecker({
  autoRefresh = true,
  refreshInterval = 10000, // 10 seconds
}: HardwareStatusProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [status, setStatus] = useState<HardwareStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const checkStatus = useCallback(async () => {
    try {
      setLoading(true);
      setStatus(await hardwareStatusChecker.checkAllDevices());
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

  const getOverallStatusColor = () => {
    if (!status) return 'bg-paper';
    switch (status.overallStatus) {
      case 'all-connected':
        return 'bg-brand-soft text-ink';
      case 'partial':
        return 'bg-paper-white text-ink';
      case 'none':
        return 'bg-paper-white text-stamp';
      default:
        return 'bg-paper text-ink';
    }
  };

  return (
    <div className="flex items-center gap-2">
      {loading && !status ? (
        <div className="animate-spin h-4 w-4 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
      ) : status ? (
        <>
          <div className={`px-2 py-1 border border-ink/25 font-receipt text-xs font-medium ${getOverallStatusColor()}`}>
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
