'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CircleAlert, LoaderCircle } from 'lucide-react';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { Barcode, LineTag, ReceiptRow, type Translate } from '@/components/marketing/primitives';
import PublicShell from '@/components/marketing/PublicShell';
import TurnstileWidget, { TURNSTILE_SITE_KEY, type TurnstileHandle } from '@/components/TurnstileWidget';
import PasswordInput from '@/components/ui/PasswordInput';
import { usePublicCopy } from '@/hooks/usePublicCopy';
import { isBusinessTypeOpenForSignup } from '@/lib/business-types';
import { detectLocation } from '@/lib/location-detection';
import { validatePassword as validatePasswordLib } from '@/lib/validation';

const CURRENCIES = [
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British Pound'],
  ['CAD', 'Canadian Dollar'],
  ['AUD', 'Australian Dollar'],
  ['MXN', 'Mexican Peso'],
  ['PHP', 'Philippine Peso'],
  ['JPY', 'Japanese Yen'],
  ['CNY', 'Chinese Yuan'],
  ['INR', 'Indian Rupee'],
  ['SGD', 'Singapore Dollar'],
  ['HKD', 'Hong Kong Dollar'],
  ['THB', 'Thai Baht'],
  ['IDR', 'Indonesian Rupiah'],
  ['MYR', 'Malaysian Ringgit'],
  ['BRL', 'Brazilian Real'],
  ['ZAR', 'South African Rand'],
];

const INPUT = 'w-full border-2 border-ink/25 bg-paper-white px-4 py-3 text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none disabled:opacity-60';

function Field({ id, label, required, hint, children }: { id: string; label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
        {required && (
          <span className="text-stamp" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1.5 font-receipt text-xs text-ink/65">{hint}</p>}
    </div>
  );
}

type SlipDetails = {
  name: string;
  companyName: string;
  slug: string;
  businessLabel: string;
  currency: string;
  adminName: string;
};

/** The store as a receipt. It fills in as the form is typed, and never shows the password. */
function StoreSlip({ details, t, children }: { details: SlipDetails; t: Translate; children?: ReactNode }) {
  const pending = <span className="text-ink/40">—</span>;
  const clipped = (value: string) => (value ? <span className="inline-block max-w-36 truncate align-bottom">{value}</span> : pending);

  return (
    <div className="drop-shadow-[0_14px_16px_rgb(0_0_0/0.35)]">
      <div className="mk-tear-b relative bg-paper-white px-6 pb-9 pt-6 font-receipt text-xs leading-relaxed text-ink">
        <p className="break-words text-center text-base font-semibold uppercase leading-snug">{details.name || t('slipPlaceholder', 'Your store name')}</p>
        {details.companyName && <p className="break-words text-center">{details.companyName}</p>}
        <div className="my-3 border-t border-dashed border-ink/40" />
        <div className="space-y-1">
          <ReceiptRow label={t('slipLink', 'Store link')} value={details.slug ? clipped(`/${details.slug}`) : pending} />
          <ReceiptRow label={t('slipType', 'Type')} value={clipped(details.businessLabel)} />
          <ReceiptRow label={t('slipCurrency', 'Currency')} value={details.currency} />
          <ReceiptRow label={t('slipOwner', 'Owner')} value={clipped(details.adminName)} />
        </div>
        <div className="my-3 border-t border-dashed border-ink/40" />
        <ReceiptRow label={t('slipTrial', '14-day trial')} value={`${details.currency} 0.00`} />
        <div className="mt-1 text-sm">
          <ReceiptRow label={t('slipDue', 'Due today')} value={`${details.currency} 0.00`} strong />
        </div>
        <Barcode className="mx-auto mt-4 h-9 w-44" />
        {children}
      </div>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const { lang, t, shellT } = usePublicCopy('signup');
  // Password rules are translated in the app dictionary, which this page otherwise doesn't need.
  const [appDict, setAppDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [formData, setFormData] = useState({
    // Store info
    slug: '',
    name: '',
    companyName: '',
    businessType: 'general' as 'retail' | 'general',
    // Admin user info
    adminEmail: '',
    adminPassword: '',
    adminName: '',
    // Optional
    currency: 'PHP',
    language: 'en',
    phone: '',
    email: '',
  });
  const [businessTypes, setBusinessTypes] = useState<{ type: string }[]>([]);
  const [loadingBusinessTypes, setLoadingBusinessTypes] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [phonePlaceholder, setPhonePlaceholder] = useState('+63 912 345 6789');
  const [detectingLocation, setDetectingLocation] = useState(true);

  useEffect(() => {
    getDictionaryClient(lang).then(setAppDict);
  }, [lang]);

  // Load business types
  useEffect(() => {
    const loadBusinessTypes = async () => {
      try {
        const res = await fetch('/api/business-types');
        const data = await res.json();
        if (data.success) {
          setBusinessTypes(data.data.filter((type: { type: string }) => isBusinessTypeOpenForSignup(type.type)));
        }
      } catch (err) {
        console.error('Failed to load business types:', err);
      } finally {
        setLoadingBusinessTypes(false);
      }
    };
    loadBusinessTypes();
  }, []);

  // Detect location on component mount
  useEffect(() => {
    const detectUserLocation = async () => {
      try {
        const detected = await detectLocation();
        if (detected) {
          setFormData((prev) => ({
            ...prev,
            currency: detected.currency,
            language: detected.language,
          }));
          if (detected.phoneFormat) {
            setPhonePlaceholder(detected.phoneFormat.placeholder);
          }
        }
      } catch (err) {
        console.error('Failed to detect location:', err);
        // Keep defaults if detection fails
      } finally {
        setDetectingLocation(false);
      }
    };

    detectUserLocation();
  }, []);

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);

  const validatePassword = (password: string) => {
    if (!appDict) return [];
    const translate = (key: string, fallback: string) => {
      const keys = key.split('.');
      let value: any = appDict; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) break;
      }
      return value || fallback;
    };
    return validatePasswordLib(password, translate).errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPasswordErrors([]);

    // Validate password
    const pwdErrors = validatePassword(formData.adminPassword);
    if (pwdErrors.length > 0) {
      setPasswordErrors(pwdErrors);
      return;
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      setError(t('slugFormatError', 'Your store link can only use lowercase letters, numbers and hyphens.'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/tenants/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, turnstileToken }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push(`/${data.data.tenant.slug}/${formData.language}/login`);
        }, 3000);
      } else {
        turnstile.current?.reset();
        setError(data.error || t('createFailed', 'We could not create your store. Please try again.'));
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      turnstile.current?.reset();
      setError(err.message || t('genericError', 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const update = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData({ ...formData, [field]: e.target.value });

  const typeCopy: Record<string, { name: string; desc: string }> = {
    retail: { name: t('typeRetail', 'Retail'), desc: t('typeRetailDesc', 'Shelves, barcodes and stock per branch') },
    general: { name: t('typeGeneral', 'General'), desc: t('typeGeneralDesc', 'A flexible setup for anything else') },
  };

  const slip: SlipDetails = {
    name: formData.name,
    companyName: formData.companyName,
    slug: formData.slug,
    businessLabel: typeCopy[formData.businessType]?.name ?? '',
    currency: formData.currency,
    adminName: formData.adminName,
  };

  if (success) {
    return (
      <PublicShell t={shellT}>
        <section aria-labelledby="signup-success-heading" className="bg-brand-navy-deep px-4 py-16 text-paper-white lg:py-24">
          <div className="mx-auto max-w-md">
            <h1 id="signup-success-heading" className="text-center text-6xl sm:text-7xl">
              {t('successHeading', 'You’re open')}
            </h1>
            <p className="mb-8 mt-4 text-center leading-relaxed text-paper/85">
              {t('successMessage', 'Your store is ready. We’ll take you to the login page in a moment. Use your admin email and password.')}
            </p>
            <div className="relative">
              <StoreSlip details={slip} t={t} />
              <span className="mk-stamp absolute right-5 top-14 border-[3px] border-stamp px-2 py-0.5 font-display text-3xl font-extrabold uppercase text-stamp" aria-hidden="true">
                {t('openedStamp', 'Opened')}
              </span>
            </div>
            <Link
              href={`/${formData.slug}/${formData.language}/login`}
              className="group mt-8 flex items-center justify-center gap-2 bg-paper-white px-6 py-4 font-semibold text-ink hover:bg-brand-soft"
            >
              {t('goToLogin', 'Go to login')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell t={shellT}>
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <aside className="bg-brand-navy-deep px-4 py-12 text-paper-white sm:px-6 lg:px-8 lg:py-14">
          <div className="lg:sticky lg:top-24 lg:ml-auto lg:max-w-md">
            <LineTag no="00" className="text-[#8fe3d0]">
              {t('tag', '14-day free trial')}
            </LineTag>
            <h1 className="mt-4 text-6xl sm:text-7xl">{t('heading', 'Open your store')}</h1>
            <p className="mt-4 leading-relaxed text-paper/85">{t('subheading', 'No credit card needed. Fill in the form and watch your store print.')}</p>
            <div className="mt-8 hidden lg:block" aria-hidden="true">
              <div className="h-3 bg-[#0b1820]" />
              <div className="mx-4">
                <StoreSlip details={slip} t={t} />
              </div>
            </div>
          </div>
        </aside>

        <div className="bg-paper px-4 py-12 sm:px-6 lg:px-12 lg:py-14">
          <form onSubmit={handleSubmit} className="max-w-2xl space-y-10">
            {error && (
              <div role="alert" className="flex items-start gap-3 border-l-4 border-stamp bg-paper-white p-4 text-sm">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-stamp" strokeWidth={1.75} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <fieldset className="space-y-5">
              <legend className="w-full">
                <LineTag no="01">{t('sectionStore', 'Your store')}</LineTag>
              </legend>
              <div className="grid gap-5 md:grid-cols-2">
                <Field id="name" label={t('storeName', 'Store name')} required>
                  <input type="text" id="name" required value={formData.name} onChange={update('name')} className={INPUT} placeholder={t('storeNamePlaceholder', 'My Store')} />
                </Field>
                <Field id="slug" label={t('storeLink', 'Store link')} required hint={t('storeLinkHint', 'Lowercase letters, numbers and hyphens')}>
                  <input
                    type="text"
                    id="slug"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className={INPUT}
                    placeholder={t('storeLinkPlaceholder', 'my-store')}
                    pattern="[a-z0-9-]+"
                  />
                </Field>
              </div>
              <Field id="companyName" label={t('companyName', 'Company name (optional)')}>
                <input type="text" id="companyName" value={formData.companyName} onChange={update('companyName')} className={INPUT} placeholder={t('companyNamePlaceholder', 'My Company Inc.')} />
              </Field>

              <div>
                <p className="mb-1.5 text-sm font-semibold" id="business-type-label">
                  {t('businessType', 'Business type')}
                  <span className="text-stamp" aria-hidden="true">
                    {' '}
                    *
                  </span>
                </p>
                {loadingBusinessTypes ? (
                  <p className="flex items-center gap-2 py-3 font-receipt text-xs">
                    <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                    {t('loadingTypes', 'Loading business types…')}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="business-type-label">
                    {businessTypes.map(({ type }) => (
                      <label key={type} className="cursor-pointer">
                        <input type="radio" name="businessType" value={type} checked={formData.businessType === type} onChange={update('businessType')} className="peer sr-only" />
                        <span className="block h-full border-2 border-ink/25 bg-paper-white p-4 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                          <span className="block font-display text-2xl font-extrabold uppercase leading-none">{typeCopy[type]?.name ?? type}</span>
                          <span className="mt-1.5 block text-sm leading-snug opacity-80">{typeCopy[type]?.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-5">
              <legend className="w-full">
                <LineTag no="02">{t('sectionAdmin', 'Your admin account')}</LineTag>
              </legend>
              <Field id="adminName" label={t('yourName', 'Your name')} required>
                <input type="text" id="adminName" required value={formData.adminName} onChange={update('adminName')} className={INPUT} placeholder={t('namePlaceholder', 'Juan Dela Cruz')} />
              </Field>
              <Field id="adminEmail" label={t('adminEmail', 'Admin email')} required>
                <input type="email" id="adminEmail" required value={formData.adminEmail} onChange={update('adminEmail')} className={INPUT} placeholder={t('adminEmailPlaceholder', 'admin@example.com')} />
              </Field>
              <Field id="adminPassword" label={t('adminPassword', 'Admin password')} required>
                <PasswordInput
                  id="adminPassword"
                  required
                  value={formData.adminPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, adminPassword: e.target.value });
                    setPasswordErrors(e.target.value ? validatePassword(e.target.value) : []);
                  }}
                  className={INPUT}
                  placeholder={t('passwordPlaceholder', 'Create a strong password')}
                />
                {passwordErrors.length > 0 && (
                  <ul className="mt-2 space-y-1 font-receipt text-xs text-stamp">
                    {passwordErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
              </Field>
            </fieldset>

            <fieldset className="space-y-5">
              <legend className="w-full">
                <LineTag no="03">{t('sectionOptional', 'Optional details')}</LineTag>
              </legend>
              <div className="grid gap-5 md:grid-cols-2">
                <Field id="currency" label={t('currency', 'Currency')} hint={detectingLocation ? t('detectingLocation', 'Detecting your location…') : undefined}>
                  <select id="currency" value={formData.currency} onChange={update('currency')} className={INPUT} disabled={detectingLocation}>
                    {CURRENCIES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="language" label={t('storeLanguage', 'Store language')}>
                  <select id="language" value={formData.language} onChange={update('language')} className={INPUT}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </Field>
                <Field id="phone" label={t('phone', 'Phone number')}>
                  <input type="tel" id="phone" value={formData.phone} onChange={update('phone')} className={INPUT} placeholder={phonePlaceholder} />
                </Field>
                <Field id="email" label={t('contactEmail', 'Contact email')}>
                  <input type="email" id="email" value={formData.email} onChange={update('email')} className={INPUT} placeholder={t('contactEmailPlaceholder', 'contact@example.com')} />
                </Field>
              </div>
            </fieldset>

            <TurnstileWidget
              ref={turnstile}
              action="signup"
              language={lang}
              errorMessage={t('securityCheckFailed', 'The security check didn’t load. Check your connection and reload the page.')}
              onToken={setTurnstileToken}
            />

            <div>
              <button
                type="submit"
                disabled={loading || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
                className="group flex w-full items-center justify-center gap-2 bg-ink px-6 py-4 text-lg font-semibold text-paper-white hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
                    {t('creatingStore', 'Opening your store…')}
                  </>
                ) : (
                  <>
                    {t('createStore', 'Open my store')}
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </>
                )}
              </button>
              <p className="mt-4 flex flex-wrap items-center gap-x-1 text-sm text-ink/75">
                {t('alreadyHaveStore', 'Already have a store?')}
                <Link href="/stores" className="flex items-center font-semibold text-ink underline underline-offset-4">
                  {t('findStore', 'Find it and sign in')}
                </Link>
              </p>
              <p className="flex flex-wrap items-center gap-x-1 text-xs text-ink/65">
                {t('privacyNotice', 'By creating an account, you agree to our')}
                <Link href="/privacy" className="flex items-center underline underline-offset-4">
                  {t('privacyLink', 'Privacy Policy')}
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}
