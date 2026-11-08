'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { RefreshCw, RotateCcw, Save } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, HINT, INPUT, KEY, KEY_PRIMARY, LABEL,
  RegisterPage, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { type ITenantSettings } from '@/types/tenant';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useBrandingSettings } from '@/hooks/useBrandingSettings';
import { useBrandingSave } from '@/hooks/useBrandingSave';
import { usePermissions } from '@/hooks/usePermissions';
import {
  FONT_SOURCES, cleanFontFamily, findBrandingProblems, isGoogleFontUrl, isHttpsUrl,
  type BrandingProblem, type FontSource,
} from '@/lib/branding-helpers';

type Branding = NonNullable<ITenantSettings['advancedBranding']>;

const PROOF_LINK_ID = 'branding-proof-font-link';
const PROOF_FACE_ID = 'branding-proof-font-face';
const PROOF_FAMILY = 'BrandingProof';

/**
 * Loads the font being edited for the proof only, so it can be judged before saving.
 * The real font is applied app-wide by the tenant settings context after a save.
 */
function useProofFont(branding: Branding | undefined): string | undefined {
  const source = branding?.fontSource || 'system';
  const family = cleanFontFamily(branding?.fontFamily || '');
  const googleUrl = branding?.googleFontUrl;
  const customUrl = branding?.customFontUrl;

  useEffect(() => {
    document.getElementById(PROOF_LINK_ID)?.remove();
    document.getElementById(PROOF_FACE_ID)?.remove();
    if (source === 'google' && isGoogleFontUrl(googleUrl)) {
      const link = document.createElement('link');
      link.id = PROOF_LINK_ID;
      link.rel = 'stylesheet';
      link.href = googleUrl!;
      document.head.appendChild(link);
    } else if (source === 'custom' && isHttpsUrl(customUrl)) {
      const style = document.createElement('style');
      style.id = PROOF_FACE_ID;
      style.textContent = `@font-face { font-family: '${PROOF_FAMILY}'; src: url(${JSON.stringify(customUrl)}); font-display: swap; }`;
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById(PROOF_LINK_ID)?.remove();
      document.getElementById(PROOF_FACE_ID)?.remove();
    };
  }, [source, googleUrl, customUrl]);

  if (source === 'custom' && family) return `'${PROOF_FAMILY}', '${family}', sans-serif`;
  if (family) return `'${family}', sans-serif`;
  return undefined;
}

export default function AdvancedBrandingPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const { canAccess } = usePermissions();
  const canManage = canAccess('settings.manage');
  const { settings: saved } = useTenantSettings();

  const { settings, loading, error, fetchSettings, updateSetting } = useBrandingSettings(tenant);
  const { saving, save } = useBrandingSave(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (tenant) fetchSettings();
  }, [tenant, fetchSettings]);

  const branding: Branding = settings?.advancedBranding || {};
  const proofFont = useProofFont(settings?.advancedBranding);

  const t = (key: string, fallback: string) => dict?.admin?.[key] || fallback;

  if (!dict || loading) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = t('advancedBranding', 'Advanced Branding');

  if (!settings) {
    return (
      <RegisterPage tagNo="BD" tag={saved?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink" role="alert">
            <h2 className="text-3xl">{dict.settings?.failedToLoad || 'Failed to Load Settings'}</h2>
            <p className="mt-2 font-receipt text-sm text-ink/70">{error || t('settingsLoadFailedHint', 'The store settings could not be loaded. Check your connection and try again.')}</p>
            <button type="button" onClick={() => fetchSettings()} className={`${KEY_PRIMARY} mt-4`}>
              <RefreshCw className={ICON} strokeWidth={1.75} aria-hidden />
              {dict.settings?.retry || 'Retry'}
            </button>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const set = (patch: Partial<Branding>) => updateSetting('advancedBranding', { ...branding, ...patch });
  const source = (branding.fontSource || 'system') as FontSource;
  const dirty = JSON.stringify(settings.advancedBranding || {}) !== JSON.stringify(saved?.advancedBranding || {});
  const problems = findBrandingProblems(branding);
  const problemText: Record<BrandingProblem, string> = {
    fontFamilyRequired: t('brandingFontFamilyRequired', 'Enter the font family name exactly as the font defines it.'),
    googleUrlInvalid: t('brandingGoogleUrlInvalid', 'Use a Google Fonts stylesheet link that starts with https://fonts.googleapis.com/.'),
    customUrlInvalid: t('brandingCustomUrlInvalid', 'Use a font file link that starts with https://.'),
    cssBraces: t('brandingCssBraces', 'The custom CSS has an opening or closing brace without its partner.'),
  };
  const sourceLabel: Record<FontSource, string> = {
    system: t('systemFont', 'System Font'),
    google: t('googleFont', 'Google Font'),
    custom: t('customFont', 'Custom Font'),
  };

  const handleSave = async () => {
    if (problems.length > 0) {
      setShowProblems(true);
      return;
    }
    const cleaned: ITenantSettings = { ...settings, advancedBranding: { ...branding, fontFamily: cleanFontFamily(branding.fontFamily || '') } };
    const result = await save(cleaned);
    if (result.ok) {
      setShowProblems(false);
      toast.success(t('advancedBrandingSaved', 'Advanced branding settings saved successfully!'));
      return;
    }
    const e = result.error;
    toast.error(
      e.kind === 'forbidden' ? t('brandingSaveForbidden', 'You do not have permission to change branding.')
        : e.kind === 'network' ? t('brandingSaveNetwork', 'Could not reach the server. Check your connection and try again.')
          : e.message || t('brandingSaveFailed', 'Branding could not be saved.')
    );
  };

  const discard = () => {
    updateSetting('advancedBranding', saved?.advancedBranding || {});
    setShowProblems(false);
  };

  const fieldsDisabled = !canManage || saving;

  return (
    <RegisterPage
      tagNo="BD"
      tag={saved?.companyName}
      title={title}
      subtitle={t('advancedBrandingDescription', 'Customize fonts, themes, and CSS')}
    >
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* The settings, on a paper slip */}
        <section aria-labelledby="branding-form-heading" className="min-w-0">
          <div className="bg-paper-white px-4 py-4 text-ink sm:px-5">
            <h2 id="branding-form-heading" className="border-b border-dashed border-ink/30 pb-3 text-4xl">{t('brandingTypeface', 'Typeface')}</h2>

            {!canManage && (
              <div className="mt-4"><Strip tone="ok">{t('brandingReadOnly', 'You can view branding but not change it. Ask an admin or owner.')}</Strip></div>
            )}

            <fieldset className="mt-4" disabled={fieldsDisabled}>
              <legend className={LABEL}>{t('fontSource', 'Font Source')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {FONT_SOURCES.map((value) => {
                  const on = source === value;
                  return (
                    <label
                      key={value}
                      className={`flex min-h-[44px] cursor-pointer items-center justify-center border px-2 text-center font-receipt text-xs font-medium uppercase tracking-[0.08em] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-hover has-[:disabled]:cursor-not-allowed ${on ? 'border-ink bg-ink text-paper-white' : 'border-ink/25 text-ink hover:bg-paper'}`}
                    >
                      <input type="radio" name="font-source" value={value} checked={on} onChange={() => set({ fontSource: value })} className="sr-only" />
                      {sourceLabel[value]}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="font-family" className={LABEL}>{t('fontFamilyName', 'Font Family Name')}</label>
                <input
                  id="font-family"
                  type="text"
                  disabled={fieldsDisabled}
                  value={branding.fontFamily || ''}
                  onChange={(e) => set({ fontFamily: e.target.value })}
                  className={INPUT}
                  placeholder={t('fontFamilyPlaceholder', 'e.g., Roboto, Inter, Arial')}
                />
                <p className={HINT}>
                  {source === 'system'
                    ? t('fontFamilySystemHint', 'Leave blank to keep the default type. A name here is used only if the device already has that font.')
                    : t('fontFamilyLinkedHint', 'Must match the family name inside the font, e.g. Inter.')}
                </p>
              </div>

              {source === 'google' && (
                <div>
                  <label htmlFor="google-font-url" className={LABEL}>{t('googleFontURL', 'Google Font URL')}</label>
                  <input
                    id="google-font-url"
                    type="url"
                    disabled={fieldsDisabled}
                    value={branding.googleFontUrl || ''}
                    onChange={(e) => set({ googleFontUrl: e.target.value.trim() })}
                    className={`${INPUT} font-receipt`}
                    placeholder={t('googleFontURLPlaceholder', 'https://fonts.googleapis.com/css2?family=Roboto')}
                  />
                </div>
              )}

              {source === 'custom' && (
                <div>
                  <label htmlFor="custom-font-url" className={LABEL}>{t('customFontURL', 'Custom Font URL')}</label>
                  <input
                    id="custom-font-url"
                    type="url"
                    disabled={fieldsDisabled}
                    value={branding.customFontUrl || ''}
                    onChange={(e) => set({ customFontUrl: e.target.value.trim() })}
                    className={`${INPUT} font-receipt`}
                    placeholder={t('customFontURLPlaceholder', 'https://example.com/fonts/custom-font.woff2')}
                  />
                  <p className={HINT}>{t('customFontUrlHint', 'A .woff2 or .woff file served over HTTPS that allows other sites to load it.')}</p>
                </div>
              )}

              <div>
                <label htmlFor="custom-css" className={LABEL}>{t('customCSS', 'Custom CSS')}</label>
                <textarea
                  id="custom-css"
                  rows={9}
                  spellCheck={false}
                  disabled={fieldsDisabled}
                  value={branding.customTheme?.css || ''}
                  onChange={(e) => set({ customTheme: { ...branding.customTheme, css: e.target.value } })}
                  className={`${INPUT} font-receipt`}
                  placeholder={t('customCSSPlaceholder', ':root { --primary-color: #2563eb; }')}
                />
                <p className={HINT}>{t('customCssScopeHint', 'Applies to your store pages once saved. Admin pages skip it, so a rule that hides something can always be removed here.')}</p>
              </div>

              {showProblems && problems.length > 0 && (
                <Strip tone="error">
                  <ul className="space-y-1">{problems.map((p) => <li key={p}>{problemText[p]}</li>)}</ul>
                </Strip>
              )}
            </div>

            {canManage && (
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-dashed border-ink/30 pt-3">
                {dirty && <span className="mr-auto font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">{t('unsavedChanges', 'Unsaved changes')}</span>}
                <button type="button" onClick={discard} disabled={!dirty || saving} className={KEY}>
                  <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
                  {t('discardChanges', 'Discard')}
                </button>
                <button type="button" onClick={handleSave} disabled={!dirty || saving} className={KEY_PRIMARY}>
                  <Save className={ICON} strokeWidth={1.75} aria-hidden />
                  {saving ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
                </button>
              </div>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>

        {/* A test print in the chosen type */}
        <section aria-labelledby="proof-heading" className="min-w-0">
          <p id="proof-heading" className="font-receipt text-xs font-medium uppercase tracking-[0.14em] text-[#8fe3d0]">{t('brandingProof', 'Test print')}</p>
          <div className="mt-3 mx-auto max-w-sm drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)]">
            <div className="bg-paper-white px-5 py-5 text-ink" style={proofFont ? { fontFamily: proofFont } : undefined}>
              <p className="text-center text-2xl font-bold uppercase leading-tight">{saved?.companyName || t('yourStoreName', 'Your Store Name')}</p>
              <p className="mt-1 text-center text-xs text-ink/70">{t('proofAddress', '000 Sample Street, Sample City')}</p>
              <div className="my-3 border-t border-dashed border-ink/40" />
              <div className="space-y-1 text-sm">
                <ReceiptRow label={t('proofItemOne', 'Sample item × 2')} value="200.00" />
                <ReceiptRow label={t('proofItemTwo', 'Sample item × 1')} value="136.00" />
              </div>
              <div className="my-3 border-t border-dashed border-ink/40" />
              <div className="space-y-1 text-sm">
                <ReceiptRow strong label={t('proofTotal', 'Total')} value="336.00" />
                <ReceiptRow label={t('proofVat', 'VAT (12%) included')} value="36.00" />
              </div>
              <p className="mt-4 text-center text-xs text-ink/60">{t('proofThanks', 'Thank you, come again')}</p>
              <p className="mt-3 border-t border-dashed border-ink/30 pt-2 text-center font-receipt text-[11px] uppercase tracking-[0.08em] text-ink/50">
                {t('proofSampleNote', 'Sample only · not a receipt')}
              </p>
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </div>
          <p className="mt-3 font-receipt text-xs text-white/60">
            {source === 'system' && !branding.fontFamily
              ? t('proofDefaultHint', 'Printed in the default type.')
              : t('proofFontHint', 'Printed in {font}. If it looks like the default type, the font did not load.').replace('{font}', cleanFontFamily(branding.fontFamily || '') || sourceLabel[source])}
          </p>
        </section>
      </div>
    </RegisterPage>
  );
}
