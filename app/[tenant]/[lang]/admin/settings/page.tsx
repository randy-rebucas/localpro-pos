'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Settings } from 'lucide-react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'branding', label: 'Branding' },
  { id: 'contact', label: 'Contact' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'features', label: 'Features' },
  { id: 'notifications', label: 'Notifications' },
];

const TIMEZONES = [
  'UTC', 'Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Bangkok',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Australia/Sydney',
];

const CURRENCIES = [
  { code: 'PHP', label: 'Philippine Peso (PHP)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)' },
  { code: 'JPY', label: 'Japanese Yen (JPY)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
];

const BUSINESS_TYPES = [
  { value: 'retail', label: 'Retail Store' },
  { value: 'restaurant', label: 'Restaurant / Food Service' },
  { value: 'laundry', label: 'Laundry Service' },
  { value: 'service', label: 'Service Business' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'general', label: 'General' },
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
  // Notifications
  lowStockAlert: boolean;
  lowStockThreshold: number;
  emailNotifications: boolean;
  smsNotifications: boolean;
}

export default function AdminSettingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const { refreshSettings } = useTenantSettings();

  const [activeSection, setActiveSection] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormData>({
    companyName: '', businessType: '', taxId: '', registrationNumber: '',
    language: 'en', timezone: 'UTC', currency: 'PHP', currencySymbol: '₱',
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
    lowStockAlert: true, lowStockThreshold: 10,
    emailNotifications: false, smsNotifications: false,
  });

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const json = await res.json();
      if (json.success && json.data) {
        const s = json.data;
        setForm(prev => ({
          ...prev,
          companyName: s.companyName ?? '',
          businessType: s.businessType ?? '',
          taxId: s.taxId ?? '',
          registrationNumber: s.registrationNumber ?? '',
          language: s.language ?? 'en',
          timezone: s.timezone ?? 'UTC',
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
          enableInventory: s.enableInventory ?? true,
          enableCategories: s.enableCategories ?? true,
          enableDiscounts: s.enableDiscounts ?? true,
          enableLoyaltyProgram: s.enableLoyaltyProgram ?? false,
          enableCustomerManagement: s.enableCustomerManagement ?? true,
          enableBookingScheduling: s.enableBookingScheduling ?? false,
          enableTableManagement: s.enableTableManagement ?? false,
          enableOnAccountSales: s.enableOnAccountSales ?? false,
          lowStockAlert: s.lowStockAlert ?? true,
          lowStockThreshold: s.lowStockThreshold ?? 10,
          emailNotifications: s.emailNotifications ?? false,
          smsNotifications: s.smsNotifications ?? false,
        }));
      }
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          businessType: form.businessType,
          taxId: form.taxId,
          registrationNumber: form.registrationNumber,
          language: form.language,
          timezone: form.timezone,
          currency: form.currency,
          currencySymbol: form.currencySymbol,
          currencyPosition: form.currencyPosition,
          dateFormat: form.dateFormat,
          timeFormat: form.timeFormat,
          primaryColor: form.primaryColor,
          secondaryColor: form.secondaryColor,
          logo: form.logo,
          email: form.email,
          phone: form.phone,
          website: form.website,
          address: {
            street: form.addressStreet,
            city: form.addressCity,
            state: form.addressState,
            zipCode: form.addressZipCode,
            country: form.addressCountry,
          },
          receiptHeader: form.receiptHeader,
          receiptFooter: form.receiptFooter,
          receiptShowLogo: form.receiptShowLogo,
          receiptShowAddress: form.receiptShowAddress,
          receiptShowPhone: form.receiptShowPhone,
          receiptShowEmail: form.receiptShowEmail,
          taxEnabled: form.taxEnabled,
          taxRate: form.taxRate,
          taxLabel: form.taxLabel,
          enableInventory: form.enableInventory,
          enableCategories: form.enableCategories,
          enableDiscounts: form.enableDiscounts,
          enableLoyaltyProgram: form.enableLoyaltyProgram,
          enableCustomerManagement: form.enableCustomerManagement,
          enableBookingScheduling: form.enableBookingScheduling,
          enableTableManagement: form.enableTableManagement,
          enableOnAccountSales: form.enableOnAccountSales,
          lowStockAlert: form.lowStockAlert,
          lowStockThreshold: form.lowStockThreshold,
          emailNotifications: form.emailNotifications,
          smsNotifications: form.smsNotifications,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Settings saved');
        await refreshSettings();
      } else {
        toast.error(json.error || 'Failed to save settings');
      }
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
  const checkboxCls = 'w-4 h-4 accent-brand';

  const Toggle = ({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-start gap-3 cursor-pointer py-2">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className={`${checkboxCls} mt-0.5 shrink-0`} />
      <div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
    </label>
  );

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-7 h-7 text-brand flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configure your store preferences and business information</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-4 py-2 text-sm font-medium bg-brand text-white border border-brand-hover hover:bg-brand-hover disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
            <p className="text-sm text-gray-400">Loading settings...</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-6 items-start">

          {/* Left — section nav */}
          <aside className="w-44 shrink-0 sticky top-6">
            <div className="bg-white border border-gray-300">
              <p className="px-4 pt-4 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sections</p>
              <nav className="pb-2">
                {SECTIONS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      activeSection === s.id
                        ? 'bg-brand text-white font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Right — section content */}
          <div className="flex-1 min-w-0">

            {/* General */}
            {activeSection === 'general' && (
              <div className="bg-white border border-gray-300">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">General</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Business identity, locale, and currency settings</p>
                </div>
                <div className="p-5 space-y-6">

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Company / Store Name</label>
                      <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Your business name" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Business Type</label>
                      <select value={form.businessType} onChange={e => set('businessType', e.target.value)} className={inputCls}>
                        <option value="">Select type...</option>
                        {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Tax ID / TIN</label>
                      <input type="text" value={form.taxId} onChange={e => set('taxId', e.target.value)} placeholder="e.g. 123-456-789-000" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Registration Number</label>
                      <input type="text" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} placeholder="DTI / SEC / CDA" className={inputCls} />
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Locale</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Language</label>
                        <select value={form.language} onChange={e => set('language', e.target.value)} className={inputCls}>
                          <option value="en">English</option>
                          <option value="es">Spanish</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Timezone</label>
                        <select value={form.timezone} onChange={e => set('timezone', e.target.value)} className={inputCls}>
                          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Date Format</label>
                        <select value={form.dateFormat} onChange={e => set('dateFormat', e.target.value)} className={inputCls}>
                          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Time Format</label>
                        <select value={form.timeFormat} onChange={e => set('timeFormat', e.target.value as '12h' | '24h')} className={inputCls}>
                          <option value="12h">12-hour (AM/PM)</option>
                          <option value="24h">24-hour</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Currency</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Currency</label>
                        <select value={form.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>
                          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Symbol</label>
                        <input type="text" value={form.currencySymbol} onChange={e => set('currencySymbol', e.target.value)} placeholder="₱" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Symbol Position</label>
                        <select value={form.currencyPosition} onChange={e => set('currencyPosition', e.target.value as 'before' | 'after')} className={inputCls}>
                          <option value="before">Before amount (₱100)</option>
                          <option value="after">After amount (100₱)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Branding */}
            {activeSection === 'branding' && (
              <div className="bg-white border border-gray-300">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Branding</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Colors and logo used across your store and receipts</p>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className={labelCls}>Logo URL</label>
                    <input type="url" value={form.logo} onChange={e => set('logo', e.target.value)} placeholder="https://..." className={inputCls} />
                    {form.logo && (
                      <div className="mt-3 border border-gray-200 p-3 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.logo} alt="Logo preview" className="h-16 object-contain" />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Primary Color</label>
                      <div className="flex gap-2">
                        <input type="color" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} className="h-9 w-14 border border-gray-300 bg-white p-0.5 cursor-pointer" />
                        <input type="text" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} placeholder="#35979c" className={`${inputCls} flex-1`} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Secondary Color</label>
                      <div className="flex gap-2">
                        <input type="color" value={form.secondaryColor || '#000000'} onChange={e => set('secondaryColor', e.target.value)} className="h-9 w-14 border border-gray-300 bg-white p-0.5 cursor-pointer" />
                        <input type="text" value={form.secondaryColor} onChange={e => set('secondaryColor', e.target.value)} placeholder="#000000" className={`${inputCls} flex-1`} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-400">For advanced branding (fonts, themes, custom CSS), go to <span className="text-brand font-medium">Advanced Branding</span> in the sidebar.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Contact */}
            {activeSection === 'contact' && (
              <div className="bg-white border border-gray-300">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Contact Information</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Displayed on receipts and customer-facing documents</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Email Address</label>
                      <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="store@example.com" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone Number</label>
                      <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+63 9XX XXX XXXX" className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Website</label>
                      <input type="url" value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourstore.com" className={inputCls} />
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Address</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Street</label>
                        <input type="text" value={form.addressStreet} onChange={e => set('addressStreet', e.target.value)} placeholder="123 Main St." className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>City / Municipality</label>
                        <input type="text" value={form.addressCity} onChange={e => set('addressCity', e.target.value)} placeholder="City" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Province / State</label>
                        <input type="text" value={form.addressState} onChange={e => set('addressState', e.target.value)} placeholder="Province" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>ZIP Code</label>
                        <input type="text" value={form.addressZipCode} onChange={e => set('addressZipCode', e.target.value)} placeholder="1234" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Country</label>
                        <input type="text" value={form.addressCountry} onChange={e => set('addressCountry', e.target.value)} placeholder="Philippines" className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Receipt */}
            {activeSection === 'receipt' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-300">
                  <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Receipt Content</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Text printed at the top and bottom of every receipt</p>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className={labelCls}>Receipt Header</label>
                      <textarea value={form.receiptHeader} onChange={e => set('receiptHeader', e.target.value)} rows={3} placeholder="e.g. Thank you for shopping with us!" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Receipt Footer</label>
                      <textarea value={form.receiptFooter} onChange={e => set('receiptFooter', e.target.value)} rows={3} placeholder="e.g. All sales are final. Goods once sold cannot be returned." className={inputCls} />
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-300">
                  <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Show on Receipt</h2>
                  </div>
                  <div className="p-5 divide-y divide-gray-50">
                    <Toggle label="Store Logo" desc="Print logo at the top of receipts" checked={form.receiptShowLogo} onChange={v => set('receiptShowLogo', v)} />
                    <Toggle label="Store Address" desc="Print full address on receipts" checked={form.receiptShowAddress} onChange={v => set('receiptShowAddress', v)} />
                    <Toggle label="Phone Number" desc="Print contact phone on receipts" checked={form.receiptShowPhone} onChange={v => set('receiptShowPhone', v)} />
                    <Toggle label="Email Address" desc="Print email on receipts" checked={form.receiptShowEmail} onChange={v => set('receiptShowEmail', v)} />
                  </div>
                </div>

                <div className="bg-white border border-gray-300">
                  <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tax</h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <Toggle label="Enable Tax" desc="Apply tax to all transactions" checked={form.taxEnabled} onChange={v => set('taxEnabled', v)} />
                    {form.taxEnabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className={labelCls}>Tax Rate (%)</label>
                          <input type="number" min={0} max={100} step={0.01} value={form.taxRate} onChange={e => set('taxRate', Number(e.target.value))} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Tax Label</label>
                          <input type="text" value={form.taxLabel} onChange={e => set('taxLabel', e.target.value)} placeholder="VAT" className={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Features */}
            {activeSection === 'features' && (
              <div className="bg-white border border-gray-300">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Feature Flags</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Enable or disable modules for your store</p>
                </div>
                <div className="p-5 divide-y divide-gray-50">
                  <Toggle label="Inventory Tracking" desc="Track stock levels for products" checked={form.enableInventory} onChange={v => set('enableInventory', v)} />
                  <Toggle label="Categories" desc="Organise products into categories" checked={form.enableCategories} onChange={v => set('enableCategories', v)} />
                  <Toggle label="Discounts" desc="Apply discount codes and percentage discounts" checked={form.enableDiscounts} onChange={v => set('enableDiscounts', v)} />
                  <Toggle label="Loyalty Program" desc="Earn and redeem loyalty points at checkout" checked={form.enableLoyaltyProgram} onChange={v => set('enableLoyaltyProgram', v)} />
                  <Toggle label="Customer Management" desc="Maintain a customer database with profiles" checked={form.enableCustomerManagement} onChange={v => set('enableCustomerManagement', v)} />
                  <Toggle label="Booking & Scheduling" desc="Accept service appointments and reservations" checked={form.enableBookingScheduling} onChange={v => set('enableBookingScheduling', v)} />
                  <Toggle label="Table Management" desc="Manage dining tables and floor layout" checked={form.enableTableManagement} onChange={v => set('enableTableManagement', v)} />
                  <Toggle label="On-Account Sales" desc="Allow customers to purchase on credit / pay later" checked={form.enableOnAccountSales} onChange={v => set('enableOnAccountSales', v)} />
                </div>
              </div>
            )}

            {/* Notifications */}
            {activeSection === 'notifications' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-300">
                  <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Inventory Alerts</h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <Toggle label="Low Stock Alerts" desc="Get notified when products fall below the threshold" checked={form.lowStockAlert} onChange={v => set('lowStockAlert', v)} />
                    {form.lowStockAlert && (
                      <div>
                        <label className={labelCls}>Low Stock Threshold (units)</label>
                        <input type="number" min={1} value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', Number(e.target.value))} className={`${inputCls} w-32`} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-300">
                  <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                    <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Notification Channels</h2>
                  </div>
                  <div className="p-5 divide-y divide-gray-50">
                    <Toggle label="Email Notifications" desc="Receive alerts and summaries via email" checked={form.emailNotifications} onChange={v => set('emailNotifications', v)} />
                    <Toggle label="SMS Notifications" desc="Receive alerts via SMS (requires SMS provider)" checked={form.smsNotifications} onChange={v => set('smsNotifications', v)} />
                  </div>
                  <div className="px-5 py-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">For notification templates (booking confirmations, attendance alerts), go to <span className="text-brand font-medium">Notifications</span> in the sidebar.</p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
