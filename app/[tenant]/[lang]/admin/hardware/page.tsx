'use client';

import { useEffect, useState } from 'react';
import HardwareStatusChecker from '@/components/HardwareStatus';
import HardwareSettings from '@/components/HardwareSettings';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { hardwareService } from '@/lib/hardware';
import { useHardwareSettings } from '@/hooks/useHardwareSettings';
import { getSaveSuccessMessage, getSaveErrorMessage } from '@/lib/hardware-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import { showToast } from '@/lib/toast';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

export default function HardwareAdminPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('hardware.manage');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { settings, loading, saving, message, setMessage, importedFromDevice, fetchSettings, updateHardwareConfig, saveSettings } =
    useHardwareSettings(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  // Sync hardware config to hardware service when settings change
  useEffect(() => {
    if (settings?.hardwareConfig) {
      hardwareService.setConfig(settings.hardwareConfig);
    }
  }, [settings?.hardwareConfig]);

  const handleSave = async () => {
    if (!settings || !dict) return;

    const result = await saveSettings(settings);
    if (result.success) {
      setMessage(null);
      showToast.success(getSaveSuccessMessage(dict));
    } else {
      // The hook already set an inline error; make sure it has text.
      setMessage({ type: 'error', text: result.error || getSaveErrorMessage(dict) });
    }
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const header = (
    <AdminPageHeader
      title={dict.admin?.hardwareSettings || 'Hardware Settings'}
      description={dict.admin?.hardwareSettingsSubtitle || 'Configure printers, barcode scanners, QR readers, cash drawers, and other hardware devices.'}
    />
  );

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header}
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.common?.loading || 'Loading…'}</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header}
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-sm font-bold text-gray-900">{dict.common?.failedToLoadSettingsTitle || 'Failed to Load Settings'}</p>
          <p className="text-win8-danger text-sm font-medium mt-1">
            {message?.text || dict.common?.unableToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.'}
          </p>
          <button
            onClick={() => fetchSettings()}
            className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      {header}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {importedFromDevice && canManage && (
            <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy flex items-center justify-between gap-3 flex-wrap">
              <span>
                {dict.admin?.hardwareImportedFromDevice ||
                  'These settings were loaded from this device and are not saved for your store yet. Review them, then save to apply them to every terminal.'}
              </span>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors shrink-0"
              >
                {saving ? (dict.settings?.saving || 'Saving…') : (dict.admin?.saveForAllTerminals || 'Save for All Terminals')}
              </button>
            </div>
          )}
          <fieldset disabled={!canManage}>
            <HardwareSettings
              hideSaveButton={true}
              config={settings.hardwareConfig ?? {}}
              onChange={(hardwareConfig) => {
                updateHardwareConfig(hardwareConfig);
              }}
            />
          </fieldset>
          {canManage && (
            <div className="bg-white border border-gray-300 p-4 flex items-center justify-end gap-3 flex-wrap">
              {message?.type === 'error' && (
                <p className="mr-auto text-sm font-medium text-win8-danger">{message.text}</p>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {saving ? (dict.settings?.saving || 'Saving…') : (dict.admin?.saveHardwareSettings || 'Save Hardware Settings')}
              </button>
            </div>
          )}
        </div>
        <div className="lg:col-span-1 lg:sticky lg:top-4">
          <HardwareStatusChecker showActions={false} autoRefresh={true} sidebar={true} />
        </div>
      </div>
    </div>
  );
}
