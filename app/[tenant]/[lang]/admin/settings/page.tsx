'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Save, ToggleRight } from 'lucide-react';
import DailyReportRecipients from '@/components/settings/DailyReportRecipients';
import ImageUploadField from '@/components/settings/ImageUploadField';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { RegisterPage, Strip, CHECKBOX, HINT, ICON, INPUT, INPUT_BASE, KEY, KEY_PRIMARY, LABEL } from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { isBusinessTypeSelectable } from '@/lib/business-types';
import type { ITenantSettings } from '@/types/tenant';
import { usePermissions } from '@/hooks/usePermissions';
import { getDictionaryClient } from '../../dictionaries-client';

const TIMEZONES = [
  'UTC', 'Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Bangkok',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Australia/Sydney',
];

interface FormData {
  // General
  companyName: string;
  businessType: string;
  taxId: string;
  registrationNumber: string;
  language: string;
  timezone: string;
  currency: string;
  currencySymbol: string;
  currencyPosition: 'before' | 'after';
  dateFormat: string;
  timeFormat: '12h' | '24h';
  // Branding
  primaryColor: string;
  logo: string;
  // Contact
  email: string;
  phone: string;
  website: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  addressCountry: string;
  // Receipt
  receiptHeader: string;
  receiptFooter: string;
  receiptShowLogo: boolean;
  receiptShowAddress: boolean;
  receiptShowPhone: boolean;
  receiptShowEmail: boolean;
  taxEnabled: boolean;
  taxRate: number;
  taxLabel: string;
  pricesIncludeTax: boolean;
  // Features
  enableOnAccountSales: boolean;
  autoOpenDrawerOnShiftStart: boolean;
  autoOpenDrawerOnShiftEnd: boolean;
  // Notifications
  lowStockAlert: boolean;
  lowStockThreshold: number;
  emailNotifications: boolean;
  smsNotifications: boolean;
}

const DEFAULT_FORM: FormData = {
  companyName: '', businessType: '', taxId: '', registrationNumber: '',
  language: 'en', timezone: 'Asia/Manila', currency: 'PHP', currencySymbol: '₱',
  currencyPosition: 'before', dateFormat: 'MM/DD/YYYY', timeFormat: '12h',
  primaryColor: '#35979c',
  logo: '',
  email: '', phone: '', website: '',
  addressStreet: '', addressCity: '', addressState: '', addressZipCode: '', addressCountry: '',
  receiptHeader: '', receiptFooter: '',
  receiptShowLogo: true, receiptShowAddress: true, receiptShowPhone: true, receiptShowEmail: false,
  taxEnabled: false, taxRate: 0, taxLabel: 'VAT', pricesIncludeTax: false,
  enableOnAccountSales: false,
  autoOpenDrawerOnShiftStart: false, autoOpenDrawerOnShiftEnd: false,
  lowStockAlert: true, lowStockThreshold: 10,
  emailNotifications: false, smsNotifications: false,
};

function formFromSettings(s: ITenantSettings): FormData {
  return {
    companyName: s.companyName ?? '',
    businessType: s.businessType ?? '',
    taxId: s.taxId ?? '',
    registrationNumber: s.registrationNumber ?? '',
    language: s.language ?? 'en',
    timezone: s.timezone ?? 'Asia/Manila',
    currency: s.currency ?? 'PHP',
    currencySymbol: s.currencySymbol ?? '₱',
    currencyPosition: s.currencyPosition ?? 'before',
    dateFormat: s.dateFormat ?? 'MM/DD/YYYY',
    timeFormat: s.timeFormat ?? '12h',
    primaryColor: s.primaryColor ?? '#35979c',
    logo: s.logo ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    website: s.website ?? '',
    addressStreet: s.address?.street ?? '',
    addressCity: s.address?.city ?? '',
    addressState: s.address?.state ?? '',
    addressZipCode: s.address?.zipCode ?? '',
    addressCountry: s.address?.country ?? '',
    receiptHeader: s.receiptHeader ?? '',
    receiptFooter: s.receiptFooter ?? '',
    receiptShowLogo: s.receiptShowLogo ?? true,
    receiptShowAddress: s.receiptShowAddress ?? true,
    receiptShowPhone: s.receiptShowPhone ?? true,
    receiptShowEmail: s.receiptShowEmail ?? false,
    taxEnabled: s.taxEnabled ?? false,
    taxRate: s.taxRate ?? 0,
    taxLabel: s.taxLabel ?? 'VAT',
    pricesIncludeTax: s.pricesIncludeTax ?? false,
    enableOnAccountSales: s.enableOnAccountSales ?? false,
    autoOpenDrawerOnShiftStart: s.autoOpenDrawerOnShiftStart ?? false,
    autoOpenDrawerOnShiftEnd: s.autoOpenDrawerOnShiftEnd ?? false,
    lowStockAlert: s.lowStockAlert ?? true,
    lowStockThreshold: s.lowStockThreshold ?? 10,
    emailNotifications: s.emailNotifications ?? false,
    smsNotifications: s.smsNotifications ?? false,
  };
}

type SectionId = 'general' | 'branding' | 'contact' | 'receipt' | 'features' | 'notifications';

const ADDRESS_FIELDS = ['addressStreet', 'addressCity', 'addressState', 'addressZipCode', 'addressCountry'] as const;

// Which tab owns each field. Saving sends only the fields that changed, from any tab, and the
// API $sets only the keys it receives, so values loaded once at mount never overwrite later edits made elsewhere.
const SECTION_FIELDS: Record<SectionId, (keyof FormData)[]> = {
  general: ['companyName', 'businessType', 'taxId', 'registrationNumber', 'language', 'timezone', 'currency', 'currencySymbol', 'currencyPosition', 'dateFormat', 'timeFormat'],
  branding: ['primaryColor', 'logo'],
  contact: ['email', 'phone', 'website', ...ADDRESS_FIELDS],
  receipt: ['receiptHeader', 'receiptFooter', 'receiptShowLogo', 'receiptShowAddress', 'receiptShowPhone', 'receiptShowEmail', 'taxEnabled', 'taxRate', 'taxLabel', 'pricesIncludeTax'],
  features: ['enableOnAccountSales', 'autoOpenDrawerOnShiftStart', 'autoOpenDrawerOnShiftEnd'],
  notifications: ['lowStockAlert', 'lowStockThreshold', 'emailNotifications', 'smsNotifications'],
};
const SECTION_ORDER = Object.keys(SECTION_FIELDS) as SectionId[];

const HEX_COLOR_RE = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
/** `<input type="color">` only takes #rrggbb. */
const toColorInput = (value: string) => {
  if (/^#[A-Fa-f0-9]{6}$/.test(value)) return value.toLowerCase();
  if (/^#[A-Fa-f0-9]{3}$/.test(value)) return `#${value.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase();
  return '#000000';
};

const SELECT = `${INPUT} font-receipt`;
const COLOR_SWATCH = 'h-11 w-14 shrink-0 cursor-pointer border border-ink/25 bg-white p-1 disabled:cursor-not-allowed';

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 border-b border-dashed border-ink/15 py-3 last:border-b-0">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={`${CHECKBOX} mt-0.5`} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {desc && <span className="mt-0.5 block text-xs text-ink/60">{desc}</span>}
      </span>
    </label>
  );
}

/** A number field that can be emptied while typing; the form only takes a value once it parses. */
function NumberField({ id, value, onChange, min, max, step, className }: {
  id: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  // Follow outside changes (load, reset) without fighting the user's own typing.
  if (seen !== value) {
    setSeen(value);
    if (text.trim() === '' || Number(text) !== value) setText(String(value));
  }
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.valueAsNumber;
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setText(String(value))}
      className={className}
    />
  );
}

/** One part of the setup slip. */
function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="border-t border-dashed border-ink/30 pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-3xl sm:text-4xl">{title}</h2>
      {desc && <p className="mt-1 text-sm text-ink/60">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return <p className="mb-3 font-receipt text-xs font-semibold uppercase tracking-[0.14em] text-brand-hover">{children}</p>;
}

export default function AdminSettingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { settings: tenantSettings, ensureSettings, applySettings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('settings.manage');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const SECTIONS: { id: SectionId; label: string }[] = [
    { id: 'general', label: dict?.settings?.tabs?.general || 'General' },
    { id: 'branding', label: dict?.settings?.tabs?.branding || 'Branding' },
    { id: 'contact', label: dict?.settings?.tabs?.contact || 'Contact' },
    { id: 'receipt', label: dict?.settings?.tabs?.receipt || 'Receipt' },
    { id: 'features', label: dict?.settings?.tabs?.features || 'Features' },
    { id: 'notifications', label: dict?.settings?.tabs?.notifications || 'Notifications' },
  ];

  const CURRENCIES = [
    { code: 'PHP', label: dict?.settings?.currencyPHP || 'Philippine Peso (PHP)' },
    { code: 'USD', label: dict?.settings?.currencyUSD || 'US Dollar (USD)' },
    { code: 'EUR', label: dict?.settings?.currencyEUR || 'Euro (EUR)' },
    { code: 'GBP', label: dict?.settings?.currencyGBP || 'British Pound (GBP)' },
    { code: 'SGD', label: dict?.settings?.currencySGD || 'Singapore Dollar (SGD)' },
    { code: 'JPY', label: dict?.settings?.currencyJPY || 'Japanese Yen (JPY)' },
    { code: 'AUD', label: dict?.settings?.currencyAUD || 'Australian Dollar (AUD)' },
  ];

  const BUSINESS_TYPES = [
    { value: 'retail', label: dict?.settings?.businessTypeRetail || 'Retail Store' },
    { value: 'restaurant', label: dict?.settings?.businessTypeRestaurant || 'Restaurant / Food Service' },
    { value: 'laundry', label: dict?.settings?.businessTypeLaundry || 'Laundry Service' },
    { value: 'service', label: dict?.settings?.businessTypeService || 'Service Business' },
    { value: 'pharmacy', label: dict?.settings?.businessTypePharmacy || 'Pharmacy' },
    { value: 'general', label: dict?.settings?.businessTypeGeneralOption || 'General' },
  ];

  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  // What the server last held, so Save sends only real changes and each tab can show it has unsaved edits.
  const [baseline, setBaseline] = useState<FormData>(DEFAULT_FORM);

  // Form is initialised from TenantSettingsContext (already loaded by the
  // layout) instead of a separate GET /api/tenants/[slug]/settings.
  const dictRef = useRef(dict);
  useEffect(() => { dictRef.current = dict; }, [dict]);

  const fetchSettings = useCallback(async () => {
    try {
      const result = await ensureSettings();
      if (result.error) throw new Error(result.error);
      if (result.settings) {
        const next = formFromSettings(result.settings);
        setForm(next);
        setBaseline(next);
      }
    } catch {
      toast.error(dictRef.current?.settings?.failedToLoad || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [ensureSettings]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const changedKeys = (Object.keys(form) as (keyof FormData)[]).filter((k) => form[k] !== baseline[k]);
  const dirtySections = new Set(SECTION_ORDER.filter((id) => SECTION_FIELDS[id].some((k) => changedKeys.includes(k))));

  const validate = (): { section: SectionId; message: string } | null => {
    if (dirtySections.has('general') && form.currency && form.currency.length !== 3) {
      return { section: 'general', message: dict?.validation?.invalidCurrencyCode || 'Invalid currency code' };
    }
    if (dirtySections.has('branding')) {
      const colorError = (field: string) =>
        (dict?.validation?.invalidColorFormat || 'Invalid color format for {field}. Use hex format (e.g., #FF5733)').replace('{field}', field);
      if (form.primaryColor && !HEX_COLOR_RE.test(form.primaryColor)) {
        return { section: 'branding', message: colorError(dict?.settings?.primaryColor || 'Primary Color') };
      }
    }
    if (dirtySections.has('receipt') && form.taxEnabled && (form.taxRate < 0 || form.taxRate > 100)) {
      return { section: 'receipt', message: dict?.validation?.taxRateRange || 'Tax rate must be between 0 and 100' };
    }
    if (dirtySections.has('notifications') && (!Number.isInteger(form.lowStockThreshold) || form.lowStockThreshold < 0)) {
      return { section: 'notifications', message: dict?.settings?.lowStockThresholdInvalid || 'Low stock threshold must be a whole number, 0 or more' };
    }
    return null;
  };

  const handleSave = async () => {
    if (savingRef.current || changedKeys.length === 0) return;
    const problem = validate();
    if (problem) {
      setActiveSection(problem.section);
      toast.error(problem.message);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    const sent = form;
    try {
      const payload: Record<string, unknown> = {};
      for (const key of changedKeys) {
        if (!(ADDRESS_FIELDS as readonly string[]).includes(key)) payload[key] = sent[key];
      }
      if (changedKeys.some((k) => (ADDRESS_FIELDS as readonly string[]).includes(k))) {
        payload.address = {
          street: sent.addressStreet,
          city: sent.addressCity,
          state: sent.addressState,
          zipCode: sent.addressZipCode,
          country: sent.addressCountry,
        };
      }

      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(dict?.settings?.saved || 'Settings saved');
        // Edits typed while the request was in flight stay unsaved.
        setBaseline(sent);
        // Merge the saved settings into context (no extra GET)
        applySettings({ ...(payload as Partial<ITenantSettings>), ...(json.data || {}) });
      } else {
        toast.error(json.error || dict?.settings?.error || 'Failed to save settings');
      }
    } catch {
      toast.error(dict?.settings?.error || 'Failed to save settings');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const s = dict?.settings ?? {};
  const unsavedLabel = (s.unsavedChangesCount || '{count} unsaved changes').replace('{count}', String(changedKeys.length));

  if (loading) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
          <span className="sr-only">{s.loading || 'Loading settings...'}</span>
        </div>
      </div>
    );
  }

  return (
    <RegisterPage
      tag={form.companyName || baseline.companyName || undefined}
      tagNo="CFG"
      title={s.title || 'Settings'}
      subtitle={s.subtitle || 'Configure your store preferences and business information'}
    >
      {!canManage && (
        <div className="mt-6">
          <Strip tone="error">{s.readOnlyNotice || "You don't have permission to change settings. Contact an admin or manager."}</Strip>
        </div>
      )}

      {/* Function keys pick which part of the setup slip to print. */}
      <nav aria-label={s.sectionsNavLabel || 'Sections'} className="mt-6 grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6">
        {SECTIONS.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            aria-current={activeSection === id ? 'true' : undefined}
            className={`flex min-h-[44px] min-w-0 items-center gap-2 border px-3 py-2 text-left font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${
              activeSection === id
                ? 'border-paper-white bg-paper-white text-ink'
                : 'border-white/15 bg-black/25 text-paper/80 hover:border-[#8fe3d0] hover:text-paper-white'
            }`}
          >
            <span className="opacity-60" aria-hidden>F{index + 1}</span>
            <span className="min-w-0 flex-1 break-words">{label}</span>
            {dirtySections.has(id) && (
              <span className={`h-2 w-2 shrink-0 ${activeSection === id ? 'bg-brand-hover' : 'bg-[#8fe3d0]'}`} title={s.unsavedChanges || 'Unsaved changes'}>
                <span className="sr-only">{s.unsavedChanges || 'Unsaved changes'}</span>
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-1 bg-paper-white text-ink">
        <fieldset disabled={!canManage} className="min-w-0 space-y-8 px-4 py-6 sm:px-6 lg:px-8">

          {activeSection === 'general' && (
            <Section title={s.tabs?.general || 'General'} desc={s.generalSectionDesc || 'Business identity, locale, and currency settings'}>
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="set-companyName" className={LABEL}>{s.companyStoreNameLabel || 'Company / Store Name'}</label>
                    <input id="set-companyName" type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder={s.businessNamePlaceholder || 'Your business name'} className={INPUT} />
                  </div>
                  <div>
                    <label htmlFor="set-businessType" className={LABEL}>{s.businessType || 'Business Type'}</label>
                    <select id="set-businessType" value={form.businessType} onChange={e => set('businessType', e.target.value)} className={SELECT}>
                      <option value="">{s.selectTypePlaceholder || 'Select type...'}</option>
                      {BUSINESS_TYPES.filter(t => isBusinessTypeSelectable(t.value, tenantSettings?.businessType)).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="set-taxId" className={LABEL}>{s.taxIdEin || 'Tax ID / TIN'}</label>
                    <input id="set-taxId" type="text" value={form.taxId} onChange={e => set('taxId', e.target.value)} placeholder={s.taxIdPlaceholderExample || 'e.g. 123-456-789-000'} className={`${INPUT} font-receipt`} />
                  </div>
                  <div>
                    <label htmlFor="set-registrationNumber" className={LABEL}>{s.registrationNumberLabel || 'Registration Number'}</label>
                    <input id="set-registrationNumber" type="text" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} placeholder={s.registrationNumberDtiPlaceholder || 'DTI / SEC / CDA'} className={`${INPUT} font-receipt`} />
                  </div>
                </div>

                <div>
                  <SubHead>{s.localeSectionLabel || 'Locale'}</SubHead>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="set-language" className={LABEL}>{s.language || 'Language'}</label>
                      <select id="set-language" value={form.language} onChange={e => set('language', e.target.value)} className={SELECT}>
                        <option value="en">{s.englishOption || 'English'}</option>
                        <option value="es">{s.spanishOption || 'Spanish'}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="set-timezone" className={LABEL}>{s.timezone || 'Timezone'}</label>
                      <select id="set-timezone" value={form.timezone} onChange={e => set('timezone', e.target.value)} className={SELECT}>
                        {!TIMEZONES.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="set-dateFormat" className={LABEL}>{s.dateFormat || 'Date Format'}</label>
                      <select id="set-dateFormat" value={form.dateFormat} onChange={e => set('dateFormat', e.target.value)} className={SELECT}>
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="set-timeFormat" className={LABEL}>{s.timeFormat || 'Time Format'}</label>
                      <select id="set-timeFormat" value={form.timeFormat} onChange={e => set('timeFormat', e.target.value as '12h' | '24h')} className={SELECT}>
                        <option value="12h">{s.timeFormat12h || '12-hour (AM/PM)'}</option>
                        <option value="24h">{s.timeFormat24h || '24-hour'}</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <SubHead>{s.currencySectionLabel || 'Currency'}</SubHead>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="set-currency" className={LABEL}>{s.currencySectionLabel || 'Currency'}</label>
                      <select id="set-currency" value={form.currency} onChange={e => set('currency', e.target.value)} className={SELECT}>
                        {!CURRENCIES.some(c => c.code === form.currency) && <option value={form.currency}>{form.currency}</option>}
                        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="set-currencySymbol" className={LABEL}>{s.currencySymbol || 'Symbol'}</label>
                      <input id="set-currencySymbol" type="text" value={form.currencySymbol} onChange={e => set('currencySymbol', e.target.value)} placeholder="₱" className={`${INPUT} font-receipt`} />
                    </div>
                    <div>
                      <label htmlFor="set-currencyPosition" className={LABEL}>{s.currencyPosition || 'Symbol Position'}</label>
                      <select id="set-currencyPosition" value={form.currencyPosition} onChange={e => set('currencyPosition', e.target.value as 'before' | 'after')} className={SELECT}>
                        <option value="before">{s.currencyPositionBefore || 'Before amount (₱100)'}</option>
                        <option value="after">{s.currencyPositionAfter || 'After amount (100₱)'}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {activeSection === 'branding' && (
            <Section title={s.tabs?.branding || 'Branding'} desc={s.brandingSectionDesc || 'Colors and logo used across your store and receipts'}>
              <div className="space-y-6">
                {/* Uploads to Cloudinary (1pos/{slug}/branding/), same as the main settings page */}
                <ImageUploadField
                  tenant={tenant}
                  label={s.logoUrl || 'Logo'}
                  value={form.logo || ''}
                  onChange={(url) => set('logo', url)}
                  recommendedSize={s.logoRecommendedSize || '200x200px (square) or 400x100px (wide)'}
                  helpText={s.logoHelp || 'Shown on your login page and receipts.'}
                  labels={dict?.settings as Record<string, unknown> | undefined}
                  previewClassName="h-16 w-16"
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="set-primaryColor" className={LABEL}>{s.primaryColor || 'Primary Color'}</label>
                    <div className="flex gap-2">
                      <input type="color" aria-label={s.primaryColor || 'Primary Color'} value={toColorInput(form.primaryColor)} onChange={e => set('primaryColor', e.target.value)} className={COLOR_SWATCH} />
                      <input id="set-primaryColor" type="text" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} placeholder="#35979c" className={`${INPUT_BASE} min-w-0 flex-1 font-receipt`} />
                    </div>
                  </div>
                </div>
                <p className={HINT}>
                  {s.advancedBrandingHintPrefix || 'For advanced branding (fonts, themes, custom CSS), go to'}{' '}
                  <Link href={`/${tenant}/${lang}/admin/advanced-branding`} className="font-semibold text-brand-hover underline underline-offset-2 hover:text-ink">
                    {s.advancedBrandingHintLink || 'Advanced Branding'}
                  </Link>{' '}
                  {s.advancedBrandingHintSuffix || 'in the sidebar.'}
                </p>
              </div>
            </Section>
          )}

          {activeSection === 'contact' && (
            <Section title={s.contactInformation || 'Contact Information'} desc={s.contactSectionDesc || 'Displayed on receipts and customer-facing documents'}>
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="set-email" className={LABEL}>{s.emailAddressLabel || 'Email Address'}</label>
                    <input id="set-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="store@example.com" className={INPUT} />
                  </div>
                  <div>
                    <label htmlFor="set-phone" className={LABEL}>{s.phoneNumberLabel || 'Phone Number'}</label>
                    <input id="set-phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+63 9XX XXX XXXX" className={INPUT} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="set-website" className={LABEL}>{s.website || 'Website'}</label>
                    <input id="set-website" type="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourstore.com" className={INPUT} />
                  </div>
                </div>

                <div>
                  <SubHead>{s.addressSectionLabel || 'Address'}</SubHead>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="set-street" className={LABEL}>{s.streetLabel || 'Street'}</label>
                      <input id="set-street" type="text" value={form.addressStreet} onChange={e => set('addressStreet', e.target.value)} placeholder={s.streetPlaceholder || '123 Main St.'} className={INPUT} />
                    </div>
                    <div>
                      <label htmlFor="set-city" className={LABEL}>{s.cityMunicipalityLabel || 'City / Municipality'}</label>
                      <input id="set-city" type="text" value={form.addressCity} onChange={e => set('addressCity', e.target.value)} placeholder={s.cityPlaceholder || 'City'} className={INPUT} />
                    </div>
                    <div>
                      <label htmlFor="set-state" className={LABEL}>{s.provinceStateLabel || 'Province / State'}</label>
                      <input id="set-state" type="text" value={form.addressState} onChange={e => set('addressState', e.target.value)} placeholder={s.provincePlaceholder || 'Province'} className={INPUT} />
                    </div>
                    <div>
                      <label htmlFor="set-zip" className={LABEL}>{s.zipCodeLabel || 'ZIP Code'}</label>
                      <input id="set-zip" type="text" value={form.addressZipCode} onChange={e => set('addressZipCode', e.target.value)} placeholder={s.zipPlaceholder || '1234'} className={`${INPUT} font-receipt`} />
                    </div>
                    <div>
                      <label htmlFor="set-country" className={LABEL}>{s.country || 'Country'}</label>
                      <input id="set-country" type="text" value={form.addressCountry} onChange={e => set('addressCountry', e.target.value)} placeholder={s.countryPlaceholder || 'Philippines'} className={INPUT} />
                    </div>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {activeSection === 'receipt' && (
            <>
              <Section title={s.receiptContentTitle || 'Receipt Content'} desc={s.receiptContentSectionDesc || 'Text printed at the top and bottom of every receipt'}>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label htmlFor="set-receiptHeader" className={LABEL}>{s.receiptHeader || 'Receipt Header'}</label>
                    <textarea id="set-receiptHeader" value={form.receiptHeader} onChange={e => set('receiptHeader', e.target.value)} rows={3} placeholder={s.receiptHeaderExamplePlaceholder || 'e.g. Thank you for shopping with us!'} className={`${INPUT} font-receipt`} />
                  </div>
                  <div>
                    <label htmlFor="set-receiptFooter" className={LABEL}>{s.receiptFooter || 'Receipt Footer'}</label>
                    <textarea id="set-receiptFooter" value={form.receiptFooter} onChange={e => set('receiptFooter', e.target.value)} rows={3} placeholder={s.receiptFooterExamplePlaceholder || 'e.g. All sales are final. Goods once sold cannot be returned.'} className={`${INPUT} font-receipt`} />
                  </div>
                </div>
              </Section>

              <Section title={s.showOnReceiptTitle || 'Show on Receipt'}>
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  <div>
                    <Toggle label={s.storeLogoLabel || 'Store Logo'} desc={s.storeLogoDesc || 'Print logo at the top of receipts'} checked={form.receiptShowLogo} onChange={v => set('receiptShowLogo', v)} />
                    <Toggle label={s.storeAddressLabel || 'Store Address'} desc={s.storeAddressDesc || 'Print full address on receipts'} checked={form.receiptShowAddress} onChange={v => set('receiptShowAddress', v)} />
                  </div>
                  <div>
                    <Toggle label={s.phoneNumberLabel || 'Phone Number'} desc={s.phoneNumberDesc || 'Print contact phone on receipts'} checked={form.receiptShowPhone} onChange={v => set('receiptShowPhone', v)} />
                    <Toggle label={s.emailAddressLabel || 'Email Address'} desc={s.emailAddressDesc || 'Print email on receipts'} checked={form.receiptShowEmail} onChange={v => set('receiptShowEmail', v)} />
                  </div>
                </div>
              </Section>

              <Section title={s.taxSectionTitle || 'Tax'}>
                <Toggle label={s.enableTax || 'Enable Tax'} desc={s.enableTaxDesc || 'Apply tax to all transactions'} checked={form.taxEnabled} onChange={v => set('taxEnabled', v)} />
                {form.taxEnabled && (
                  <>
                    <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="set-taxRate" className={LABEL}>{s.taxRate || 'Tax Rate (%)'}</label>
                        <NumberField id="set-taxRate" min={0} max={100} step={0.01} value={form.taxRate} onChange={v => set('taxRate', v)} className={`${INPUT} font-receipt`} />
                      </div>
                      <div>
                        <label htmlFor="set-taxLabel" className={LABEL}>{s.taxLabel || 'Tax Label'}</label>
                        <input id="set-taxLabel" type="text" value={form.taxLabel} onChange={e => set('taxLabel', e.target.value)} placeholder="VAT" className={`${INPUT} font-receipt`} />
                      </div>
                    </div>
                    <div className="pt-2">
                      <Toggle label={s.pricesIncludeTax || 'Prices already include tax'} desc={s.pricesIncludeTaxDesc || 'On: a ₱112 item charges ₱112, with the tax inside it. Off: tax is added on top at checkout.'} checked={form.pricesIncludeTax} onChange={v => set('pricesIncludeTax', v)} />
                    </div>
                  </>
                )}
              </Section>
            </>
          )}

          {activeSection === 'features' && (
            <>
              <Section title={s.modulesTitle || 'Modules'} desc={s.modulesMovedDesc || 'Inventory, categories, discounts, loyalty, customers, bookings and tables are switched on and off on the Feature Flags page.'}>
                <Link href={`/${tenant}/${lang}/admin/feature-flags`} className={`${KEY} w-full sm:w-fit`}>
                  <ToggleRight className={ICON} strokeWidth={1.75} aria-hidden />
                  {s.openFeatureFlags || 'Open Feature Flags'}
                </Link>
              </Section>

              <Section title={s.salesOptionsTitle || 'Sales'}>
                <Toggle label={s.onAccountSalesLabel || 'On-Account Sales'} desc={s.onAccountSalesDescShort || 'Allow customers to purchase on credit / pay later'} checked={form.enableOnAccountSales} onChange={v => set('enableOnAccountSales', v)} />
              </Section>

              <Section title={dict?.admin?.cashDrawer || 'Cash Drawer'} desc={s.cashDrawerSectionDesc || 'Requires a cash drawer configured under Hardware settings'}>
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  <div><Toggle label={s.autoOpenShiftStartLabel || 'Auto-Open on Shift Start'} desc={s.autoOpenShiftStartDesc || 'Automatically pop open the cash drawer when a cashier starts their shift'} checked={form.autoOpenDrawerOnShiftStart} onChange={v => set('autoOpenDrawerOnShiftStart', v)} /></div>
                  <div><Toggle label={s.autoOpenShiftEndLabel || 'Auto-Open on Shift End'} desc={s.autoOpenShiftEndDesc || 'Automatically pop open the cash drawer when a cashier ends their shift'} checked={form.autoOpenDrawerOnShiftEnd} onChange={v => set('autoOpenDrawerOnShiftEnd', v)} /></div>
                </div>
              </Section>
            </>
          )}

          {activeSection === 'notifications' && (
            <>
              <Section title={s.inventoryAlertsTitle || 'Inventory Alerts'}>
                <Toggle label={s.enableLowStockAlerts || 'Low Stock Alerts'} desc={s.lowStockAlertDesc || 'Get notified when products fall below the threshold'} checked={form.lowStockAlert} onChange={v => set('lowStockAlert', v)} />
                {form.lowStockAlert && (
                  <div className="pt-3">
                    <label htmlFor="set-lowStockThreshold" className={LABEL}>{s.lowStockThresholdUnitsLabel || 'Low Stock Threshold (units)'}</label>
                    <NumberField id="set-lowStockThreshold" min={0} step={1} value={form.lowStockThreshold} onChange={v => set('lowStockThreshold', v)} className={`${INPUT_BASE} w-32 font-receipt`} />
                    <p className={HINT}>{s.lowStockZeroHint || 'Set 0 to alert only when a product is out of stock.'}</p>
                  </div>
                )}
              </Section>

              <Section title={s.dailyReportTitle || 'Daily Sales Report'}>
                {/* Saves on its own key, apart from the total line below. */}
                <DailyReportRecipients tenant={tenant} labels={{ ...(dict?.settings || {}), save: s.saveRecipients || 'Save recipients' }} showTitle={false} />
              </Section>

              <Section title={s.notificationChannels || 'Notification Channels'}>
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  <div><Toggle label={s.emailNotificationsLabel || 'Email Notifications'} desc={s.emailNotificationsDescShort || 'Receive alerts and summaries via email'} checked={form.emailNotifications} onChange={v => set('emailNotifications', v)} /></div>
                  <div><Toggle label={s.smsNotificationsLabel || 'SMS Notifications'} desc={s.smsNotificationsDescShort || 'Receive alerts via SMS (requires SMS provider)'} checked={form.smsNotifications} onChange={v => set('smsNotifications', v)} /></div>
                </div>
                <p className={`${HINT} mt-4`}>
                  {s.notificationTemplatesHintPrefix || 'For notification templates (booking confirmations, attendance alerts), go to'}{' '}
                  <Link href={`/${tenant}/${lang}/admin/notification-templates`} className="font-semibold text-brand-hover underline underline-offset-2 hover:text-ink">
                    {s.notificationTemplatesHintLink || 'Notifications'}
                  </Link>{' '}
                  {s.notificationTemplatesHintSuffix || 'in the sidebar.'}
                </p>
              </Section>
            </>
          )}
        </fieldset>

        {/* The total line: what is waiting to be saved, and the key that saves it. Stays in view on long tabs. */}
        {canManage && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/30 bg-paper-white px-4 py-3 sm:px-6 lg:px-8">
            <p className="font-receipt text-xs uppercase tracking-[0.08em] text-ink/60" aria-live="polite">
              {changedKeys.length > 0 ? unsavedLabel : (s.allSaved || 'All changes saved')}
            </p>
            <button type="button" onClick={handleSave} disabled={saving || changedKeys.length === 0} className={KEY_PRIMARY}>
              <Save className={ICON} strokeWidth={1.75} aria-hidden />
              {saving ? (s.saving || 'Saving...') : (s.save || 'Save Settings')}
            </button>
          </div>
        )}
      </div>
      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
    </RegisterPage>
  );
}
