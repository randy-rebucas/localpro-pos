'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { showToast } from '@/lib/toast';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getDictionaryClient } from '../../dictionaries-client';
import { getCurrencySymbol } from '@/lib/currency';

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
  secondaryColor: string;
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
  // Features
  enableInventory: boolean;
  enableCategories: boolean;
  enableDiscounts: boolean;
  enableLoyaltyProgram: boolean;
  enableCustomerManagement: boolean;
  enableBookingScheduling: boolean;
  enableTableManagement: boolean;
  enableOnAccountSales: boolean;
  enableSuppliers: boolean;
  enableExpenses: boolean;
  enableEmployees: boolean;
  autoOpenDrawerOnShiftStart: boolean;
  autoOpenDrawerOnShiftEnd: boolean;
  // Notifications
  lowStockAlert: boolean;
  lowStockThreshold: number;
  emailNotifications: boolean;
  smsNotifications: boolean;
}

const inputCls = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
const groupLabelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3';
const colorSwatchCls = 'h-[38px] w-14 shrink-0 border border-gray-300 bg-white p-0.5 cursor-pointer';

// Module-level so it keeps a stable identity across renders — defined inside
// the page it remounted on every keystroke/toggle and dropped keyboard focus.
function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-3">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="checkbox-win8 mt-0.5 shrink-0" />
      <div>
        <span className="text-sm font-medium text-gray-900">{label}</span>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
    </label>
  );
}

function SectionCard({ title, desc, children, bodyCls = 'p-6 space-y-4' }: { title: string; desc?: string; children: React.ReactNode; bodyCls?: string }) {
  return (
    <section className="bg-white border border-gray-300">
      <div className="px-6 py-4 border-b border-gray-300">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {desc && <p className="text-sm text-gray-500">{desc}</p>}
      </div>
      <div className={bodyCls}>{children}</div>
    </section>
  );
}

export default function AdminSettingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { refreshSettings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('settings.manage');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    getDictionaryClient(lang as 'en' | 'es').then(setDict);
  }, [lang]);

  const SECTIONS = [
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

  const [activeSection, setActiveSection] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    companyName: '', businessType: '', taxId: '', registrationNumber: '',
    language: 'en', timezone: 'Asia/Manila', currency: 'PHP', currencySymbol: '₱',
    currencyPosition: 'before', dateFormat: 'MM/DD/YYYY', timeFormat: '12h',
    primaryColor: '#35979c', secondaryColor: '',
    logo: '',
    email: '', phone: '', website: '',
    addressStreet: '', addressCity: '', addressState: '', addressZipCode: '', addressCountry: '',
    receiptHeader: '', receiptFooter: '',
    receiptShowLogo: true, receiptShowAddress: true, receiptShowPhone: true, receiptShowEmail: false,
    taxEnabled: false, taxRate: 0, taxLabel: 'VAT',
    enableInventory: true, enableCategories: true, enableDiscounts: true,
    enableLoyaltyProgram: false, enableCustomerManagement: true,
    enableBookingScheduling: false, enableTableManagement: false, enableOnAccountSales: false,
    enableSuppliers: true, enableExpenses: true, enableEmployees: true,
    autoOpenDrawerOnShiftStart: false, autoOpenDrawerOnShiftEnd: false,
    lowStockAlert: true, lowStockThreshold: 10,
    emailNotifications: false, smsNotifications: false,
  });
  const [savedForm, setSavedForm] = useState<FormData>(form);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const json = await res.json();
      if (json.success && json.data) {
        const s = json.data;
        setForm(prev => {
          const next = {
          ...prev,
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
          secondaryColor: s.secondaryColor ?? '',
          logo: s.logo ?? '',
          email: s.email ?? '',
          phone: s.phone ?? '',
          website: s.website ?? '',
          // GET returns the flat TenantSettings row (addressStreet/addressCity/...
          // columns), not a nested `address` object — only the PUT payload is
          // nested (see lib/tenant-settings-flatten.ts). Reading `s.address?.x`
          // here was always undefined, silently blanking these fields on load.
          addressStreet: s.addressStreet ?? '',
          addressCity: s.addressCity ?? '',
          addressState: s.addressState ?? '',
          addressZipCode: s.addressZipCode ?? '',
          addressCountry: s.addressCountry ?? '',
          receiptHeader: s.receiptHeader ?? '',
          receiptFooter: s.receiptFooter ?? '',
          receiptShowLogo: s.receiptShowLogo ?? true,
          receiptShowAddress: s.receiptShowAddress ?? true,
          receiptShowPhone: s.receiptShowPhone ?? true,
          receiptShowEmail: s.receiptShowEmail ?? false,
          taxEnabled: s.taxEnabled ?? false,
          taxRate: s.taxRate ?? 0,
          taxLabel: s.taxLabel ?? 'VAT',
          enableInventory: s.enableInventory ?? true,
          enableCategories: s.enableCategories ?? true,
          enableDiscounts: s.enableDiscounts ?? true,
          enableLoyaltyProgram: s.enableLoyaltyProgram ?? false,
          enableCustomerManagement: s.enableCustomerManagement ?? true,
          enableBookingScheduling: s.enableBookingScheduling ?? false,
          enableTableManagement: s.enableTableManagement ?? false,
          enableOnAccountSales: s.enableOnAccountSales ?? false,
          enableSuppliers: s.enableSuppliers ?? true,
          enableExpenses: s.enableExpenses ?? true,
          enableEmployees: s.enableEmployees ?? true,
          autoOpenDrawerOnShiftStart: s.autoOpenDrawerOnShiftStart ?? false,
          autoOpenDrawerOnShiftEnd: s.autoOpenDrawerOnShiftEnd ?? false,
          lowStockAlert: s.lowStockAlert ?? true,
          lowStockThreshold: s.lowStockThreshold ?? 10,
          emailNotifications: s.emailNotifications ?? false,
          smsNotifications: s.smsNotifications ?? false,
          };
          setSavedForm(next);
          return next;
        });
      } else {
        // Never fall through to an editable form of defaults — saving a tab
        // from that state would overwrite the real settings.
        setLoadError(json.error || dict?.settings?.failedToLoad || 'Failed to load settings');
      }
    } catch {
      setLoadError(dict?.settings?.failedToLoad || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [tenant, dict]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormError(null);
    setForm(f => ({ ...f, [key]: value }));
  };

  // Only the fields owned by the active tab are sent on save — the API does a
  // per-key $set so a stale read of other tabs' fields (loaded once at mount)
  // never overwrites concurrent changes made elsewhere.
  const SECTION_FIELDS: Record<string, (keyof FormData)[]> = {
    general: ['companyName', 'businessType', 'taxId', 'registrationNumber', 'language', 'timezone', 'currency', 'currencySymbol', 'currencyPosition', 'dateFormat', 'timeFormat'],
    branding: ['primaryColor', 'secondaryColor', 'logo'],
    contact: ['email', 'phone', 'website'],
    receipt: ['receiptHeader', 'receiptFooter', 'receiptShowLogo', 'receiptShowAddress', 'receiptShowPhone', 'receiptShowEmail', 'taxEnabled', 'taxRate', 'taxLabel'],
    features: ['enableInventory', 'enableCategories', 'enableDiscounts', 'enableLoyaltyProgram', 'enableCustomerManagement', 'enableBookingScheduling', 'enableTableManagement', 'enableOnAccountSales', 'enableSuppliers', 'enableExpenses', 'enableEmployees', 'autoOpenDrawerOnShiftStart', 'autoOpenDrawerOnShiftEnd'],
    notifications: ['lowStockAlert', 'lowStockThreshold', 'emailNotifications', 'smsNotifications'],
  };
  // Fields a tab owns that are sent in a different shape (the address goes
  // out as a nested `address` object), so they're not in SECTION_FIELDS but
  // still count toward its dirty state.
  const EXTRA_DIRTY_FIELDS: Record<string, (keyof FormData)[]> = {
    contact: ['addressStreet', 'addressCity', 'addressState', 'addressZipCode', 'addressCountry'],
  };

  const isSectionDirty = (sectionId: string): boolean =>
    [...(SECTION_FIELDS[sectionId] || []), ...(EXTRA_DIRTY_FIELDS[sectionId] || [])]
      .some(key => form[key] !== savedForm[key]);

  const switchSection = (sectionId: string) => {
    if (sectionId === activeSection) return;
    if (isSectionDirty(activeSection)) {
      const confirmMsg = dict?.settings?.unsavedChangesConfirm
        || 'You have unsaved changes in this section. Switch tabs and discard them?';
      if (!window.confirm(confirmMsg)) return;
      setForm(savedForm);
    }
    setFormError(null);
    setActiveSection(sectionId);
  };

  const HEX_COLOR_RE = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  const SAFE_LOGO_URL_RE = /^https:\/\/[^\s"'<>]+$/i;
  const TAX_LABEL_MAX_LEN = 32;
  const RECEIPT_TEXT_MAX_LEN = 500;
  const LOW_STOCK_THRESHOLD_MAX = 100000;

  const validateActiveSection = (): string | null => {
    if (activeSection === 'general' && form.currency && form.currency.length !== 3) {
      return dict?.validation?.invalidCurrencyCode || 'Invalid currency code';
    }
    if (activeSection === 'branding') {
      if (form.primaryColor && !HEX_COLOR_RE.test(form.primaryColor)) {
        return (dict?.validation?.invalidColorFormat || 'Invalid color format for {field}. Use hex format (e.g., #FF5733)').replace('{field}', dict?.settings?.primaryColor || 'Primary Color');
      }
      if (form.secondaryColor && !HEX_COLOR_RE.test(form.secondaryColor)) {
        return (dict?.validation?.invalidColorFormat || 'Invalid color format for {field}. Use hex format (e.g., #FF5733)').replace('{field}', dict?.settings?.secondaryColor || 'Secondary Color');
      }
      if (form.logo && !SAFE_LOGO_URL_RE.test(form.logo)) {
        return dict?.validation?.invalidLogoUrl || 'Logo URL must be a valid https:// address';
      }
    }
    if (activeSection === 'receipt') {
      if (form.taxEnabled && (form.taxRate < 0 || form.taxRate > 100)) {
        return dict?.validation?.taxRateRange || 'Tax rate must be between 0 and 100';
      }
      if (form.taxLabel && form.taxLabel.length > TAX_LABEL_MAX_LEN) {
        return dict?.validation?.taxLabelTooLong || `Tax label must be ${TAX_LABEL_MAX_LEN} characters or fewer`;
      }
      if (form.receiptHeader.length > RECEIPT_TEXT_MAX_LEN || form.receiptFooter.length > RECEIPT_TEXT_MAX_LEN) {
        return dict?.validation?.receiptTextTooLong || `Receipt header/footer must be ${RECEIPT_TEXT_MAX_LEN} characters or fewer`;
      }
    }
    if (activeSection === 'notifications' && form.lowStockAlert
      && (form.lowStockThreshold < 1 || form.lowStockThreshold > LOW_STOCK_THRESHOLD_MAX)) {
      return dict?.validation?.lowStockThresholdRange
        || `Low stock threshold must be between 1 and ${LOW_STOCK_THRESHOLD_MAX}`;
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validateActiveSection();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const key of SECTION_FIELDS[activeSection] || []) {
        payload[key] = form[key];
      }
      if (activeSection === 'contact') {
        payload.address = {
          street: form.addressStreet,
          city: form.addressCity,
          state: form.addressState,
          zipCode: form.addressZipCode,
          country: form.addressCountry,
        };
      }

      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        showToast.success(dict?.settings?.saved || 'Settings saved');
        // Snapshot every field this tab owns (incl. the address fields, which
        // are sent nested rather than as flat keys) so the dirty check is exact.
        const savedKeys = [...(SECTION_FIELDS[activeSection] || []), ...(EXTRA_DIRTY_FIELDS[activeSection] || [])];
        setSavedForm(f => {
          const next = { ...f };
          for (const key of savedKeys) (next as Record<string, unknown>)[key] = form[key];
          return next;
        });
        await refreshSettings();
      } else {
        showToast.error(json.error || dict?.settings?.error || 'Failed to save settings');
      }
    } catch {
      showToast.error(dict?.settings?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const formErrorBox = formError && (
    <div role="alert" className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">{formError}</div>
  );

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.settings?.title || 'Settings'}
        description={dict?.settings?.subtitle || 'Configure your store preferences and business information'}
        actions={canManage && !loadError ? (
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? (dict?.settings?.saving || 'Saving…') : (dict?.settings?.save || 'Save Settings')}
          </button>
        ) : undefined}
      />

      <div className="space-y-4">
        {!loading && !loadError && !canManage && (
          <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            {dict?.settings?.readOnlyNotice || "You don't have permission to change settings. Contact an admin or manager."}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict?.settings?.loading || 'Loading settings…'}</p>
          </div>
        ) : loadError ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">{loadError}</p>
            <button onClick={fetchSettings} className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors">
              {dict?.settings?.retry || 'Retry'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-start">

            {/* Section nav */}
            <aside className="w-full md:w-48 shrink-0 md:sticky md:top-6">
              <div className="bg-white border border-gray-300">
                <p className="hidden md:block px-4 pt-4 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{dict?.settings?.sectionsNavLabel || 'Sections'}</p>
                <nav aria-label={dict?.settings?.sectionsNavLabel || 'Sections'} className="flex md:flex-col overflow-x-auto md:pb-2">
                  {SECTIONS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => switchSection(s.id)}
                      aria-current={activeSection === s.id ? 'page' : undefined}
                      className={`shrink-0 md:w-full text-left px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                        activeSection === s.id
                          ? 'bg-brand text-white font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Section content */}
            <fieldset disabled={!canManage} className="flex-1 min-w-0 space-y-4">

              {activeSection === 'general' && (
                <SectionCard
                  title={dict?.settings?.tabs?.general || 'General'}
                  desc={dict?.settings?.generalSectionDesc || 'Business identity, locale, and currency settings'}
                  bodyCls="p-6 space-y-6"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{dict?.settings?.companyStoreNameLabel || 'Company / Store Name'}</label>
                      <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder={dict?.settings?.businessNamePlaceholder || 'Your business name'} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{dict?.settings?.businessType || 'Business Type'}</label>
                      <select value={form.businessType} onChange={e => set('businessType', e.target.value)} className={inputCls}>
                        <option value="">{dict?.settings?.selectTypePlaceholder || 'Select type...'}</option>
                        {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>{dict?.settings?.taxIdEin || 'Tax ID / TIN'}</label>
                      <input type="text" value={form.taxId} onChange={e => set('taxId', e.target.value)} placeholder={dict?.settings?.taxIdPlaceholderExample || 'e.g. 123-456-789-000'} className={`${inputCls} font-mono`} />
                    </div>
                    <div>
                      <label className={labelCls}>{dict?.settings?.registrationNumberLabel || 'Registration Number'}</label>
                      <input type="text" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} placeholder={dict?.settings?.registrationNumberDtiPlaceholder || 'DTI / SEC / CDA'} className={`${inputCls} font-mono`} />
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-5">
                    <p className={groupLabelCls}>{dict?.settings?.localeSectionLabel || 'Locale'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>{dict?.settings?.language || 'Language'}</label>
                        <select value={form.language} onChange={e => set('language', e.target.value)} className={inputCls}>
                          <option value="en">{dict?.settings?.englishOption || 'English'}</option>
                          <option value="es">{dict?.settings?.spanishOption || 'Spanish'}</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.timezone || 'Timezone'}</label>
                        <select value={form.timezone} onChange={e => set('timezone', e.target.value)} className={inputCls}>
                          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.dateFormat || 'Date Format'}</label>
                        <select value={form.dateFormat} onChange={e => set('dateFormat', e.target.value)} className={inputCls}>
                          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.timeFormat || 'Time Format'}</label>
                        <select value={form.timeFormat} onChange={e => set('timeFormat', e.target.value as '12h' | '24h')} className={inputCls}>
                          <option value="12h">{dict?.settings?.timeFormat12h || '12-hour (AM/PM)'}</option>
                          <option value="24h">{dict?.settings?.timeFormat24h || '24-hour'}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-5">
                    <p className={groupLabelCls}>{dict?.settings?.currencySectionLabel || 'Currency'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>{dict?.settings?.currencySectionLabel || 'Currency'}</label>
                        <select
                          value={form.currency}
                          onChange={e => {
                            const code = e.target.value;
                            setFormError(null);
                            setForm(f => ({ ...f, currency: code, currencySymbol: getCurrencySymbol(code) }));
                          }}
                          className={inputCls}
                        >
                          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.currencySymbol || 'Symbol'}</label>
                        <input type="text" value={form.currencySymbol} onChange={e => set('currencySymbol', e.target.value)} placeholder="₱" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.currencyPosition || 'Symbol Position'}</label>
                        <select value={form.currencyPosition} onChange={e => set('currencyPosition', e.target.value as 'before' | 'after')} className={inputCls}>
                          <option value="before">{dict?.settings?.currencyPositionBefore || 'Before amount (₱100)'}</option>
                          <option value="after">{dict?.settings?.currencyPositionAfter || 'After amount (100₱)'}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {formErrorBox}
                </SectionCard>
              )}

              {activeSection === 'branding' && (
                <SectionCard
                  title={dict?.settings?.tabs?.branding || 'Branding'}
                  desc={dict?.settings?.brandingSectionDesc || 'Colors and logo used across your store and receipts'}
                >
                  <div>
                    <label className={labelCls}>{dict?.settings?.logoUrl || 'Logo URL'}</label>
                    <input type="url" value={form.logo} onChange={e => set('logo', e.target.value)} placeholder="https://..." className={inputCls} />
                    <p className="text-xs text-gray-400 mt-1">{dict?.settings?.logoUrlHint || 'Must be a secure (https://) image URL'}</p>
                    {form.logo && SAFE_LOGO_URL_RE.test(form.logo) && (
                      <div className="mt-3 border border-gray-300 bg-gray-50 p-3 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.logo} alt={dict?.settings?.logoPreviewAlt || 'Logo preview'} className="h-16 object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>{dict?.settings?.primaryColor || 'Primary Color'}</label>
                      <div className="flex gap-2">
                        <input type="color" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} aria-label={dict?.settings?.primaryColor || 'Primary Color'} className={colorSwatchCls} />
                        <input type="text" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} placeholder="#35979c" className={`${inputCls} flex-1 font-mono`} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{dict?.settings?.secondaryColor || 'Secondary Color'}</label>
                      <div className="flex gap-2">
                        <input type="color" value={form.secondaryColor || '#000000'} onChange={e => set('secondaryColor', e.target.value)} aria-label={dict?.settings?.secondaryColor || 'Secondary Color'} className={colorSwatchCls} />
                        <input type="text" value={form.secondaryColor} onChange={e => set('secondaryColor', e.target.value)} placeholder="#000000" className={`${inputCls} flex-1 font-mono`} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                    {dict?.settings?.advancedBrandingHintPrefix || 'For advanced branding (fonts, themes, custom CSS), go to'}{' '}
                    <Link href={`/${tenant}/${lang}/admin/advanced-branding`} className="font-semibold text-brand hover:underline">
                      {dict?.settings?.advancedBrandingHintLink || 'Advanced Branding'}
                    </Link>{' '}
                    {dict?.settings?.advancedBrandingHintSuffix || 'in the sidebar.'}
                  </div>
                  {formErrorBox}
                </SectionCard>
              )}

              {activeSection === 'contact' && (
                <SectionCard
                  title={dict?.settings?.contactInformation || 'Contact Information'}
                  desc={dict?.settings?.contactSectionDesc || 'Displayed on receipts and customer-facing documents'}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>{dict?.settings?.emailAddressLabel || 'Email Address'}</label>
                      <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="store@example.com" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{dict?.settings?.phoneNumberLabel || 'Phone Number'}</label>
                      <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+63 9XX XXX XXXX" className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{dict?.settings?.website || 'Website'}</label>
                      <input type="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourstore.com" className={inputCls} />
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <p className={groupLabelCls}>{dict?.settings?.addressSectionLabel || 'Address'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>{dict?.settings?.streetLabel || 'Street'}</label>
                        <input type="text" value={form.addressStreet} onChange={e => set('addressStreet', e.target.value)} placeholder={dict?.settings?.streetPlaceholder || '123 Main St.'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.cityMunicipalityLabel || 'City / Municipality'}</label>
                        <input type="text" value={form.addressCity} onChange={e => set('addressCity', e.target.value)} placeholder={dict?.settings?.cityPlaceholder || 'City'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.provinceStateLabel || 'Province / State'}</label>
                        <input type="text" value={form.addressState} onChange={e => set('addressState', e.target.value)} placeholder={dict?.settings?.provincePlaceholder || 'Province'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.zipCodeLabel || 'ZIP Code'}</label>
                        <input type="text" value={form.addressZipCode} onChange={e => set('addressZipCode', e.target.value)} placeholder={dict?.settings?.zipPlaceholder || '1234'} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>{dict?.settings?.country || 'Country'}</label>
                        <input type="text" value={form.addressCountry} onChange={e => set('addressCountry', e.target.value)} placeholder={dict?.settings?.countryPlaceholder || 'Philippines'} className={inputCls} />
                      </div>
                    </div>
                  </div>
                  {formErrorBox}
                </SectionCard>
              )}

              {activeSection === 'receipt' && (
                <>
                  <SectionCard
                    title={dict?.settings?.receiptContentTitle || 'Receipt Content'}
                    desc={dict?.settings?.receiptContentSectionDesc || 'Text printed at the top and bottom of every receipt'}
                  >
                    <div>
                      <label className={labelCls}>{dict?.settings?.receiptHeader || 'Receipt Header'}</label>
                      <textarea value={form.receiptHeader} onChange={e => set('receiptHeader', e.target.value)} rows={3} maxLength={RECEIPT_TEXT_MAX_LEN} placeholder={dict?.settings?.receiptHeaderExamplePlaceholder || 'e.g. Thank you for shopping with us!'} className={`${inputCls} resize-none`} />
                      <p className="text-xs text-gray-400 mt-1 text-right tabular-nums">{form.receiptHeader.length}/{RECEIPT_TEXT_MAX_LEN}</p>
                    </div>
                    <div>
                      <label className={labelCls}>{dict?.settings?.receiptFooter || 'Receipt Footer'}</label>
                      <textarea value={form.receiptFooter} onChange={e => set('receiptFooter', e.target.value)} rows={3} maxLength={RECEIPT_TEXT_MAX_LEN} placeholder={dict?.settings?.receiptFooterExamplePlaceholder || 'e.g. All sales are final. Goods once sold cannot be returned.'} className={`${inputCls} resize-none`} />
                      <p className="text-xs text-gray-400 mt-1 text-right tabular-nums">{form.receiptFooter.length}/{RECEIPT_TEXT_MAX_LEN}</p>
                    </div>
                  </SectionCard>

                  <SectionCard title={dict?.settings?.showOnReceiptTitle || 'Show on Receipt'} bodyCls="px-6 py-2 divide-y divide-gray-200">
                    <Toggle label={dict?.settings?.storeLogoLabel || 'Store Logo'} desc={dict?.settings?.storeLogoDesc || 'Print logo at the top of receipts'} checked={form.receiptShowLogo} onChange={v => set('receiptShowLogo', v)} />
                    <Toggle label={dict?.settings?.storeAddressLabel || 'Store Address'} desc={dict?.settings?.storeAddressDesc || 'Print full address on receipts'} checked={form.receiptShowAddress} onChange={v => set('receiptShowAddress', v)} />
                    <Toggle label={dict?.settings?.phoneNumberLabel || 'Phone Number'} desc={dict?.settings?.phoneNumberDesc || 'Print contact phone on receipts'} checked={form.receiptShowPhone} onChange={v => set('receiptShowPhone', v)} />
                    <Toggle label={dict?.settings?.emailAddressLabel || 'Email Address'} desc={dict?.settings?.emailAddressDesc || 'Print email on receipts'} checked={form.receiptShowEmail} onChange={v => set('receiptShowEmail', v)} />
                  </SectionCard>

                  <SectionCard title={dict?.settings?.taxSectionTitle || 'Tax'} bodyCls="px-6 py-2">
                    <Toggle label={dict?.settings?.enableTax || 'Enable Tax'} desc={dict?.settings?.enableTaxDesc || 'Apply tax to all transactions'} checked={form.taxEnabled} onChange={v => set('taxEnabled', v)} />
                    {form.taxEnabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-200 pt-4 pb-4">
                        <div>
                          <label className={labelCls}>{dict?.settings?.taxRate || 'Tax Rate (%)'}</label>
                          <input type="number" min={0} max={100} step={0.01} value={form.taxRate} onChange={e => set('taxRate', Number(e.target.value))} className={`${inputCls} tabular-nums`} />
                        </div>
                        <div>
                          <label className={labelCls}>{dict?.settings?.taxLabel || 'Tax Label'}</label>
                          <input type="text" value={form.taxLabel} onChange={e => set('taxLabel', e.target.value)} maxLength={TAX_LABEL_MAX_LEN} placeholder="VAT" className={inputCls} />
                        </div>
                      </div>
                    )}
                    {formError && <div className="pb-4">{formErrorBox}</div>}
                  </SectionCard>
                </>
              )}

              {activeSection === 'features' && (
                <>
                  <SectionCard
                    title={dict?.settings?.featureFlagsTitle || 'Feature Flags'}
                    desc={dict?.settings?.featureFlagsDesc || 'Enable or disable modules for your store'}
                    bodyCls="px-6 py-2 grid grid-cols-1 lg:grid-cols-2 gap-x-8"
                  >
                    <Toggle label={dict?.settings?.inventoryTrackingLabel || 'Inventory Tracking'} desc={dict?.settings?.inventoryTrackingDesc || 'Track stock levels for products'} checked={form.enableInventory} onChange={v => set('enableInventory', v)} />
                    <Toggle label={dict?.settings?.categoriesLabel || 'Categories'} desc={dict?.settings?.categoriesDesc || 'Organise products into categories'} checked={form.enableCategories} onChange={v => set('enableCategories', v)} />
                    <Toggle label={dict?.settings?.discountsLabel || 'Discounts'} desc={dict?.settings?.discountsDesc || 'Apply discount codes and percentage discounts'} checked={form.enableDiscounts} onChange={v => set('enableDiscounts', v)} />
                    <Toggle label={dict?.settings?.loyaltyProgram || 'Loyalty Program'} desc={dict?.settings?.loyaltyProgramDescShort || 'Earn and redeem loyalty points at checkout'} checked={form.enableLoyaltyProgram} onChange={v => set('enableLoyaltyProgram', v)} />
                    <Toggle label={dict?.settings?.customerManagementLabel || 'Customer Management'} desc={dict?.settings?.customerManagementDescShort || 'Maintain a customer database with profiles'} checked={form.enableCustomerManagement} onChange={v => set('enableCustomerManagement', v)} />
                    <Toggle label={dict?.settings?.bookingScheduling || 'Booking & Scheduling'} desc={dict?.settings?.bookingSchedulingDescShort || 'Accept service appointments and reservations'} checked={form.enableBookingScheduling} onChange={v => set('enableBookingScheduling', v)} />
                    <Toggle label={dict?.settings?.tableManagementLabel || 'Table Management'} desc={dict?.settings?.tableManagementDesc || 'Manage dining tables and floor layout'} checked={form.enableTableManagement} onChange={v => set('enableTableManagement', v)} />
                    <Toggle label={dict?.settings?.onAccountSalesLabel || 'On-Account Sales'} desc={dict?.settings?.onAccountSalesDescShort || 'Allow customers to purchase on credit / pay later'} checked={form.enableOnAccountSales} onChange={v => set('enableOnAccountSales', v)} />
                    <Toggle label={dict?.settings?.suppliersLabel || 'Suppliers'} desc={dict?.settings?.suppliersDescShort || 'Manage suppliers and purchase orders'} checked={form.enableSuppliers} onChange={v => set('enableSuppliers', v)} />
                    <Toggle label={dict?.settings?.expensesLabel || 'Expenses'} desc={dict?.settings?.expensesDescShort || 'Track business expenses'} checked={form.enableExpenses} onChange={v => set('enableExpenses', v)} />
                    <Toggle label={dict?.settings?.employeesLabel || 'Employees'} desc={dict?.settings?.employeesDescShort || 'Manage staff accounts and roles'} checked={form.enableEmployees} onChange={v => set('enableEmployees', v)} />
                  </SectionCard>

                  <SectionCard
                    title={dict?.admin?.cashDrawer || 'Cash Drawer'}
                    desc={dict?.settings?.cashDrawerSectionDesc || 'Requires a cash drawer configured under Hardware settings'}
                    bodyCls="px-6 py-2 divide-y divide-gray-200"
                  >
                    <Toggle label={dict?.settings?.autoOpenShiftStartLabel || 'Auto-Open on Shift Start'} desc={dict?.settings?.autoOpenShiftStartDesc || 'Automatically pop open the cash drawer when a cashier starts their shift'} checked={form.autoOpenDrawerOnShiftStart} onChange={v => set('autoOpenDrawerOnShiftStart', v)} />
                    <Toggle label={dict?.settings?.autoOpenShiftEndLabel || 'Auto-Open on Shift End'} desc={dict?.settings?.autoOpenShiftEndDesc || 'Automatically pop open the cash drawer when a cashier ends their shift'} checked={form.autoOpenDrawerOnShiftEnd} onChange={v => set('autoOpenDrawerOnShiftEnd', v)} />
                  </SectionCard>
                </>
              )}

              {activeSection === 'notifications' && (
                <>
                  <SectionCard title={dict?.settings?.inventoryAlertsTitle || 'Inventory Alerts'} bodyCls="px-6 py-2">
                    <Toggle label={dict?.settings?.enableLowStockAlerts || 'Low Stock Alerts'} desc={dict?.settings?.lowStockAlertDesc || 'Get notified when products fall below the threshold'} checked={form.lowStockAlert} onChange={v => set('lowStockAlert', v)} />
                    {form.lowStockAlert && (
                      <div className="border-t border-gray-200 pt-4 pb-4">
                        <label className={labelCls}>{dict?.settings?.lowStockThresholdUnitsLabel || 'Low Stock Threshold (units)'}</label>
                        <input type="number" min={1} max={LOW_STOCK_THRESHOLD_MAX} value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', Number(e.target.value))} className="w-32 border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100 tabular-nums" />
                      </div>
                    )}
                    {formError && <div className="pb-4">{formErrorBox}</div>}
                  </SectionCard>

                  <SectionCard title={dict?.settings?.notificationChannels || 'Notification Channels'} bodyCls="px-6 py-2 divide-y divide-gray-200">
                    <Toggle label={dict?.settings?.emailNotificationsLabel || 'Email Notifications'} desc={dict?.settings?.emailNotificationsDescShort || 'Receive alerts and summaries via email'} checked={form.emailNotifications} onChange={v => set('emailNotifications', v)} />
                    <Toggle label={dict?.settings?.smsNotificationsLabel || 'SMS Notifications'} desc={dict?.settings?.smsNotificationsDescShort || 'Receive alerts via SMS (requires SMS provider)'} checked={form.smsNotifications} onChange={v => set('smsNotifications', v)} />
                  </SectionCard>

                  <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                    {dict?.settings?.notificationTemplatesHintPrefix || 'For notification templates (booking confirmations, attendance alerts), go to'}{' '}
                    <Link href={`/${tenant}/${lang}/admin/notification-templates`} className="font-semibold text-brand hover:underline">
                      {dict?.settings?.notificationTemplatesHintLink || 'Notifications'}
                    </Link>{' '}
                    {dict?.settings?.notificationTemplatesHintSuffix || 'in the sidebar.'}
                  </div>
                </>
              )}

            </fieldset>
          </div>
        )}
      </div>
    </div>
  );
}
