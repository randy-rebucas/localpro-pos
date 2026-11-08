'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { RefreshCw, RotateCcw, Save } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import HardwareSettings, { type HardwarePort } from '@/components/HardwareSettings';
import { ReceiptRow } from '@/components/marketing/primitives';
import { DARK_KEY, DARK_KEY_PRIMARY, ICON, KEY, LedReadout, RegisterPage, ROW_KEY, Strip } from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { hardwareService } from '@/lib/hardware';
import { hardwareStatusChecker, type DeviceStatus, type HardwareStatus } from '@/lib/hardware/status-checker';
import { useHardwareSettings } from '@/hooks/useHardwareSettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatTime } from '@/lib/formatting';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Light = 'on' | 'ready' | 'off' | 'fault';

/** How each status shows on the panel: lit teal when working, dark when unused, red when something is wrong. */
const LIGHT: Record<DeviceStatus['status'], Light> = {
  connected: 'on',
  available: 'ready',
  'not-configured': 'off',
  disconnected: 'fault',
  error: 'fault',
};

const LIGHT_DOT: Record<Light, string> = {
  on: 'bg-[#7df0d6] shadow-[0_0_8px_#7df0d6]',
  ready: 'bg-brand',
  off: 'bg-ink/20',
  fault: 'bg-stamp',
};

export default function HardwareAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('settings.manage');
  const { settings: tenantSettings } = useTenantSettings();
  const [dict, setDict] = useState<any>(null);
  const [status, setStatus] = useState<HardwareStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const { saved, draft, setDraft, dirty, loading, saving, loadError, fetchSettings, saveSettings, discard } = useHardwareSettings(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const t = (key: string, fallback: string): string => dict?.admin?.[key] || fallback;
  const hs = (key: string, fallback: string): string => dict?.components?.hardwareStatus?.[key] || fallback;
  const hw = (key: string, fallback: string): string => dict?.components?.hardwareSettings?.[key] || fallback;

  const checkStatus = useCallback(async (fresh = false) => {
    if (fresh) hardwareStatusChecker.clearCache();
    setChecking(true);
    try {
      setStatus(await hardwareStatusChecker.checkAllDevices());
    } catch (error) {
      console.error('Failed to check hardware status:', error);
    } finally {
      setChecking(false);
    }
  }, []);

  // Point this browser's hardware at the saved setup once it loads.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    if (saved) hardwareService.setConfig(saved);
  }, [saved]);

  // Re-check shortly after each edit (tests use the settings on screen), and every 10 seconds.
  useEffect(() => {
    if (!draft) return;
    const id = setTimeout(() => checkStatus(true), 400);
    return () => clearTimeout(id);
  }, [draft, checkStatus]);
  useEffect(() => {
    const id = setInterval(() => checkStatus(), 10000);
    return () => clearInterval(id);
  }, [checkStatus]);

  // Leaving with unsaved edits: put this browser back on the saved setup, and warn on reload or close.
  useEffect(() => () => {
    if (savedRef.current) hardwareService.setConfig(savedRef.current);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const handleSave = async () => {
    const result = await saveSettings();
    if (result.success) {
      toast.success(t('hardwareSettingsSavedSuccess', 'Hardware settings saved successfully!'));
      checkStatus(true);
      return;
    }
    if (result.reason === 'cancelled') return;
    toast.error(
      result.reason === 'forbidden' ? (dict?.settings?.unauthorized || "You don't have permission to change hardware settings.")
        : result.reason === 'network' ? t('failedToSaveHardwareSettingsConnection', 'Failed to save hardware settings. Please check your connection.')
          : result.reason === 'timeout' ? (dict?.common?.requestTimedOut || 'The request timed out. Please try again.')
          : result.error || t('failedToSaveHardwareSettings', 'Failed to save hardware settings')
    );
  };

  const handleDiscard = () => {
    discard();
    if (saved) hardwareService.setConfig(saved);
  };

  const title = t('hardwareSettings', 'Hardware Settings');

  if (!dict || (loading && !draft)) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  if (loadError || !draft) {
    return (
      <RegisterPage tagNo="HW" tag={tenantSettings?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink" role="alert">
            <h2 className="text-3xl">{dict.common?.failedToLoadSettingsTitle || 'Failed to Load Settings'}</h2>
            <p className="mt-2 text-sm">{dict.common?.unableToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.'}</p>
            <button type="button" onClick={() => fetchSettings()} className={`${KEY} mt-4`}>
              <RefreshCw className={ICON} strokeWidth={1.75} aria-hidden />
              {dict.common?.retry || 'Retry'}
            </button>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const statusLabel = (s: DeviceStatus['status']) => ({
    connected: hs('statusConnected', 'Connected'),
    available: hs('statusAvailable', 'Available'),
    disconnected: hs('statusDisconnected', 'Disconnected'),
    error: hs('statusError', 'Error'),
    'not-configured': hs('statusNotConfigured', 'Not Configured'),
  })[s];

  const portName: Record<HardwarePort, string> = {
    printer: hw('receiptPrinter', 'Receipt Printer'),
    'cash-drawer': hw('cashDrawer', 'Cash Drawer'),
    'barcode-scanner': hw('barcodeScanner', 'Barcode Scanner'),
    'qr-reader': hw('qrCodeReader', 'QR Code Reader'),
    touchscreen: hw('touchscreenDisplay', 'Touchscreen Display'),
  };

  const lights: Partial<Record<HardwarePort, React.ReactNode>> = {};
  for (const d of status?.devices || []) {
    lights[d.type] = (
      <span className="flex items-center gap-2 font-receipt text-[11px] uppercase tracking-[0.08em] text-ink/70">
        <span className={`h-2.5 w-2.5 ${LIGHT_DOT[LIGHT[d.status]]}`} aria-hidden />
        {statusLabel(d.status)}
      </span>
    );
  }

  const counted = (status?.devices || []).filter((d) => d.type !== 'touchscreen');
  const readyCount = counted.filter((d) => d.status === 'connected' || d.status === 'available').length;

  return (
    <RegisterPage
      tagNo="HW"
      tag={tenantSettings?.companyName}
      title={title}
      subtitle={t('hardwareSettingsSubtitle', 'Configure printers, barcode scanners, QR readers, cash drawers, and other hardware devices.')}
      side={status ? <LedReadout value={`${readyCount}/${counted.length}`} label={t('hardwareReady', 'Ready')} /> : undefined}
    >
      {!canManage && (
        <div className="mt-6 max-w-2xl">
          <Strip tone="error">{t('hardwareViewOnly', 'You can look but not change these settings. Ask an admin or owner.')}</Strip>
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* The back of the till: one port per peripheral */}
        <div className="min-w-0">
          <div className="bg-paper-white px-4 py-5 text-ink sm:px-6">
            <HardwareSettings
              config={draft}
              onChange={setDraft}
              dict={dict}
              lang={lang}
              storeName={tenantSettings?.companyName}
              lights={lights}
              disabled={!canManage}
            />
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>

        {/* Self-test slip, the way a printer prints its own diagnostics */}
        <aside className="min-w-0 xl:sticky xl:top-6" aria-live="polite">
          <div className="bg-paper-white px-4 py-4 font-receipt text-xs text-ink">
            <div className="flex items-start justify-between gap-2 border-b border-dashed border-ink/30 pb-3">
              <div>
                <h2 className="text-3xl">{t('selfTest', 'Self-test')}</h2>
                <p className="mt-1 text-ink/60">
                  {status
                    ? hs('lastChecked', 'Last checked: {time}').replace('{time}', tenantSettings ? formatTime(status.lastCheck, tenantSettings) : status.lastCheck.toLocaleTimeString())
                    : hs('checkingHardwareStatus', 'Checking hardware status...')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => checkStatus(true)}
                disabled={checking}
                className={`${ROW_KEY} -mr-2 -mt-1 shrink-0 disabled:opacity-50`}
                aria-label={dict.common?.refreshStatus || 'Refresh status'}
                title={dict.common?.refreshStatus || 'Refresh status'}
              >
                <RefreshCw className={`${ICON} ${checking ? 'animate-spin motion-reduce:animate-none' : ''}`} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <ul className="divide-y divide-dashed divide-ink/20">
              {(status?.devices || []).map((d) => (
                <li key={d.type} className="py-2.5">
                  <ReceiptRow
                    label={<span className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 ${LIGHT_DOT[LIGHT[d.status]]}`} aria-hidden />{portName[d.type]}</span>}
                    value={<span className={LIGHT[d.status] === 'fault' ? 'font-semibold text-stamp' : ''}>{statusLabel(d.status)}</span>}
                  />
                  <p className="mt-1 pl-4 leading-relaxed text-ink/60">
                    {hs(d.code, d.message || '')}
                    {d.detail && <span className="block break-all text-ink/80">{d.detail}</span>}
                  </p>
                </li>
              ))}
            </ul>
            <p className="border-t border-dashed border-ink/30 pt-3 text-ink/60">
              {t('selfTestScope', 'Checks this browser on this device only. Each till keeps its own pairing.')}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </aside>
      </div>

      {canManage && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-white/15 bg-brand-navy-deep/95 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto font-receipt text-xs uppercase tracking-[0.08em] text-white/70" role="status">
              {dirty ? t('unsavedHardwareChanges', 'Unsaved changes') : t('hardwareAllSaved', 'All changes saved')}
            </p>
            {dirty && (
              <button type="button" onClick={handleDiscard} disabled={saving} className={DARK_KEY}>
                <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
                {t('discardChanges', 'Discard')}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className={`${DARK_KEY_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand`}
            >
              <Save className={ICON} strokeWidth={1.75} aria-hidden />
              {saving ? (dict.common?.saving || 'Saving...') : t('saveHardwareSettings', 'Save Hardware Settings')}
            </button>
          </div>
        </div>
      )}
    </RegisterPage>
  );
}
