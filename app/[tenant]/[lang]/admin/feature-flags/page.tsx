'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { RotateCcw } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import { useFeatureFlagsSettings } from '@/hooks/useFeatureFlagsSettings';
import { useConfirm } from '@/lib/confirm';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { DARK_KEY, DARK_KEY_PRIMARY, ICON, LedReadout, RegisterPage, Strip } from '@/components/admin/register-ui';
import {
  FEATURE_FLAGS,
  getFeatureFlagDefault,
  getFeatureFlagDescription,
  getFeatureFlagLabel,
  type FeatureFlagKey,
} from '@/lib/feature-flags-helpers';
import type { ITenantSettings } from '@/types/tenant';

type Dict = Record<string, Record<string, string | undefined> | undefined>;

const flagValue = (s: ITenantSettings | null | undefined, key: FeatureFlagKey): boolean => {
  const v = (s as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === 'boolean' ? v : getFeatureFlagDefault(key);
};

export default function FeatureFlagsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict | null>(null);
  const { settings: tenantSettings } = useTenantSettings();
  const businessTypeConfig = tenantSettings ? getBusinessTypeConfig(getBusinessType(tenantSettings)) : null;
  const { canAccess } = usePermissions();
  const canManage = canAccess('settings.manage');
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const [saveError, setSaveError] = useState('');

  const { settings, loading, saving, loadError, fetchSettings, updateSetting, saveSettings } =
    useFeatureFlagsSettings(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then((d) => setDict(d as unknown as Dict));
  }, [lang]);

  // Load once per tenant; a language switch must not throw away unsaved key presses.
  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const a = (key: string, fallback: string) => dict?.admin?.[key] || fallback;

  const changed = useMemo(
    () => FEATURE_FLAGS.filter((k) => settings && flagValue(settings, k) !== flagValue(tenantSettings, k)),
    [settings, tenantSettings]
  );
  const onCount = settings ? FEATURE_FLAGS.filter((k) => flagValue(settings, k)).length : 0;

  const handleSave = async () => {
    if (!settings || saving || changed.length === 0) return;
    setSaveError('');
    const switchingOff = changed.filter((k) => !flagValue(settings, k));
    if (switchingOff.length > 0) {
      const ok = await confirm(
        a('ffSwitchOffTitle', 'Switch off {n} feature(s)?').replace('{n}', String(switchingOff.length)),
        `${switchingOff.map((k) => getFeatureFlagLabel(k, dict)).join(', ')}. ${a('ffSwitchOffMessage', 'Staff stop seeing these screens and the till stops offering them. Nothing is deleted: switch them back on and everything is still there.')}`,
        { confirmText: a('ffSwitchOffConfirm', 'Switch off'), cancelText: dict?.common?.cancel || 'Cancel', variant: 'warning' }
      );
      if (!ok) return;
    }
    const result = await saveSettings(settings);
    if (result.success) {
      toast.success(a('featureFlagsSavedSuccess', 'Feature flags saved successfully!'));
      return;
    }
    if ('cancelled' in result && result.cancelled) return;
    const text =
      result.status === 401 || result.status === 403
        ? dict?.settings?.unauthorized || 'Unauthorized. Please login with admin account.'
        : result.network
          ? a('failedToSaveFeatureFlagsConnection', 'Failed to save feature flags. Please check your connection.')
          : a('failedToSaveFeatureFlags', 'Failed to save feature flags');
    setSaveError(text);
    toast.error(text);
  };

  const undoChanges = () => {
    for (const k of changed) updateSetting(k, flagValue(tenantSettings, k));
    setSaveError('');
  };

  if (!dict || (loading && !settings && !loadError)) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const side = settings ? (
    <LedReadout value={`${onCount}/${FEATURE_FLAGS.length}`} label={a('ffKeysOn', 'Switched on')} />
  ) : undefined;

  return (
    <RegisterPage
      tagNo="FN"
      tag={tenantSettings?.companyName}
      title={a('featureFlags', 'Feature Flags')}
      subtitle={a('featureFlagsSubtitle', 'Enable or disable system-wide features. Changes affect the entire application.')}
      side={side}
    >
      {ConfirmDialog}

      {!settings && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Strip tone="error">
              {loadError || dict?.common?.unableToLoadSettings || 'Unable to load tenant settings. Please check your connection and try again.'}
            </Strip>
          </div>
          <button type="button" onClick={() => fetchSettings()} className={DARK_KEY}>
            <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      )}

      {settings && (
        <>
          {!canManage && (
            <div className="mt-6">
              <Strip tone="ok">{a('ffReadOnly', 'You can see which features are on. Ask an admin or owner to change them.')}</Strip>
            </div>
          )}

          {businessTypeConfig && (
            <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-l-4 border-brand bg-black/20 px-4 py-3">
              <span className="font-receipt text-xs uppercase tracking-[0.08em] text-[#8fe3d0]">
                {a('currentBusinessTypeLabel', 'Current Business Type: {name}').replace('{name}', businessTypeConfig.name)}
              </span>
              <span className="min-w-0 flex-1 text-sm text-paper/70">
                {a('businessTypeAutoConfiguredNote', 'Default features for this business type are auto-configured. You can override them below.')}
              </span>
            </div>
          )}

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {FEATURE_FLAGS.map((key, i) => {
              const on = flagValue(settings, key);
              const isChanged = changed.includes(key);
              const label = getFeatureFlagLabel(key, dict);
              return (
                <li
                  key={key}
                  className={`flex flex-col border-t-4 bg-paper-white text-ink ${on ? 'border-brand' : 'border-ink/30'}`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-dashed border-ink/25 px-4 py-2">
                    <span className="font-receipt text-xs tracking-[0.08em] text-ink/60">F{String(i + 1).padStart(2, '0')}</span>
                    {isChanged ? (
                      <span className="font-receipt text-[11px] uppercase tracking-[0.08em] text-stamp">{a('ffNotSaved', 'Not saved')}</span>
                    ) : (
                      <span className={`font-receipt text-[11px] uppercase tracking-[0.08em] ${on ? 'text-brand-hover' : 'text-ink/50'}`}>
                        {on ? a('ffStateOn', 'On') : a('ffStateOff', 'Off')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col px-4 py-3">
                    <h3 className="font-display text-2xl font-bold uppercase leading-tight">{label}</h3>
                    <p className="mt-1 flex-1 text-sm text-ink/70">{getFeatureFlagDescription(key, dict)}</p>
                    <div role="group" aria-label={label} className="mt-3 flex">
                      {[true, false].map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          aria-pressed={on === value}
                          disabled={!canManage || saving}
                          onClick={() => updateSetting(key, value)}
                          className={`min-h-[44px] flex-1 border px-3 font-receipt text-xs font-medium uppercase tracking-[0.08em] transition-colors touch-manipulation disabled:cursor-not-allowed ${
                            on === value
                              ? value
                                ? 'border-brand bg-brand text-ink'
                                : 'border-ink bg-ink text-paper-white'
                              : 'border-ink/25 text-ink/60 hover:bg-paper disabled:hover:bg-transparent'
                          } ${value ? '' : '-ml-px'}`}
                        >
                          {value ? a('ffStateOn', 'On') : a('ffStateOff', 'Off')}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {canManage && (
            <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 bg-brand-navy-deep/95 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              {saveError ? (
                <div className="mr-auto min-w-0 flex-1"><Strip tone="error">{saveError}</Strip></div>
              ) : (
                changed.length > 0 && (
                  <span className="mr-auto font-receipt text-xs uppercase tracking-[0.08em] text-[#8fe3d0]">
                    {a('ffUnsavedCount', '{n} not saved').replace('{n}', String(changed.length))}
                  </span>
                )
              )}
              {changed.length > 0 && (
                <button type="button" onClick={undoChanges} disabled={saving} className={DARK_KEY}>
                  {a('ffUndo', 'Undo')}
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || changed.length === 0}
                className={`${DARK_KEY_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand`}
              >
                {saving ? dict?.settings?.saving || 'Saving...' : a('saveFeatureFlags', 'Save Feature Flags')}
              </button>
            </div>
          )}
        </>
      )}
    </RegisterPage>
  );
}
