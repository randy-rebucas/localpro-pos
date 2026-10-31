'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, BadgeCheck, Check, Circle, Loader2, Pencil, Store, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import MarketingShell from '@/components/marketing/MarketingShell';
import { ArrowIcon, FKey } from '@/components/marketing/ui';
import { useDictSection, usePreferredLang, type HomeDict } from '@/components/marketing/useMarketing';
import PasswordInput from '@/components/ui/PasswordInput';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { detectLocation, getCurrencySymbolForCode } from '@/lib/location-detection';

type BusinessType = 'retail' | 'general';
type Lang = 'en' | 'es';

const CURRENCIES: [code: string, name: string][] = [
  ['PHP', 'Philippine Peso'],
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'British Pound'],
  ['CAD', 'Canadian Dollar'],
  ['AUD', 'Australian Dollar'],
  ['MXN', 'Mexican Peso'],
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

const TYPES: { type: BusinessType; Icon: LucideIcon; label: string; desc: string }[] = [
  { type: 'retail', Icon: Store, label: 'Retail', desc: 'Shelves, barcodes, stock counts' },
  { type: 'general', Icon: Wrench, label: 'General', desc: 'Services or a mix of everything' },
];

/** Mirrors validatePassword in lib/validation.ts so the checklist matches what the API enforces. */
const PASSWORD_RULES: [key: string, label: string, test: (p: string) => boolean][] = [
  ['pwLength', '8+ characters', (p) => p.length >= 8 && p.length <= 128],
  ['pwUpper', 'Uppercase letter', (p) => /[A-Z]/.test(p)],
  ['pwLower', 'Lowercase letter', (p) => /[a-z]/.test(p)],
  ['pwNumber', 'Number', (p) => /[0-9]/.test(p)],
  ['pwSpecial', 'Symbol like ! @ # ?', (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p)],
];

/** Wizard steps, in order. The last one reviews and submits. */
const STEPS = [
  { key: 'groupStore', label: 'Your store' },
  { key: 'groupOwner', label: 'Owner login' },
  { key: 'groupTill', label: 'Till settings' },
  { key: 'groupReview', label: 'Review' },
] as const;
const LAST_STEP = STEPS.length - 1;

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const noopSubscribe = () => () => {};

/** Size + gloss surface on top of the shadcn Input defaults. */
const fieldCls = 'h-11 bg-white px-3 placeholder:text-gray-400 shadow-[inset_0_1px_2px_rgba(16,42,56,0.06)]';

/** PasswordInput wraps a native input, so it needs the full field styling. */
const inputCls =
  'w-full h-11 rounded-md border border-[#cdd8dc] bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-[inset_0_1px_2px_rgba(16,42,56,0.06)] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25';

/** Public store signup: creates the tenant + owner account and starts the 14-day trial. */
export default function SignupPage() {
  const d = useDictSection('signup');
  const pageLang = usePreferredLang();
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    slug: '',
    companyName: '',
    businessType: 'retail' as BusinessType,
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    currency: 'PHP',
    language: pageLang as Lang,
    phone: '',
    email: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [phonePlaceholder, setPhonePlaceholder] = useState('+63 912 345 6789');
  const [detecting, setDetecting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorList, setErrorList] = useState<string[]>([]);
  const [created, setCreated] = useState<{ slug: string; name: string } | null>(null);
  const [step, setStep] = useState(0);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const movedStep = useRef(false);
  const [countdown, setCountdown] = useState(8);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Pre-fill currency, store language and phone format from the visitor's location
  useEffect(() => {
    let cancelled = false;
    detectLocation()
      .then((loc) => {
        if (cancelled || !loc) return;
        setForm((f) => ({ ...f, currency: loc.currency || f.currency, language: loc.language || f.language }));
        if (loc.phoneFormat) setPhonePlaceholder(loc.phoneFormat.placeholder);
      })
      .catch(() => {
        // Keep defaults
      })
      .finally(() => {
        if (!cancelled) setDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loginHref = created ? `/${created.slug}/${form.language}/login` : '';

  // After the store is created, count down and drop the owner on its sign-in screen
  useEffect(() => {
    if (!created) return;
    if (countdown <= 0) {
      router.push(loginHref);
      return;
    }
    const id = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [created, countdown, loginHref, router]);

  const passwordOk = PASSWORD_RULES.every(([, , test]) => test(form.adminPassword));

  // Move focus to the new step's heading so keyboard and screen-reader users land on it
  useEffect(() => {
    if (!movedStep.current) return;
    stepHeadingRef.current?.focus();
  }, [step]);

  const goTo = (next: number) => {
    movedStep.current = true;
    setError('');
    setErrorList([]);
    setStep(next);
  };

  /** Checks the native validity is already done by the browser; these are the rules it can't express. */
  const stepError = (i: number): string => {
    if (i === 0 && !/^[a-z0-9-]+$/.test(form.slug)) {
      return d?.errSlug || 'The store ID can only use lowercase letters, numbers and hyphens.';
    }
    if (i === 1 && !passwordOk) {
      return d?.errPassword || 'The password is missing something — check the list under it.';
    }
    return '';
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorList([]);

    // Steps before the review: Enter / "Next" validates this step and moves on
    if (step < LAST_STEP) {
      const msg = stepError(step);
      if (msg) {
        setError(msg);
        return;
      }
      goTo(step + 1);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tenants/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setCreated({ slug: data.data.tenant.slug, name: data.data.tenant.name });
        window.scrollTo({ top: 0 });
      } else {
        // The API returns only a message, so send the user back to the step that owns the field.
        const message: string = data.error || '';
        const back = Array.isArray(data.errors) || /email|correo|password|contraseña/i.test(message)
          ? 1
          : /identifier|slug|identificador|tienda/i.test(message)
            ? 0
            : LAST_STEP;
        if (back !== LAST_STEP) goTo(back);
        setError(message || d?.errGeneric || "We couldn't create the store. Please try again.");
        if (Array.isArray(data.errors)) setErrorList(data.errors);
      }
    } catch {
      setError(d?.errNetwork || "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const host = useSyncExternalStore(noopSubscribe, () => window.location.host, () => '1pos.app');

  return (
    <MarketingShell>
      <main id="main-content" className="relative mk-dark text-white overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/marketing/specialty-counter.webp" alt="" fetchPriority="high" className="mk-parallax-hero opacity-25 saturate-[0.8] absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a1620] via-[#0a1620]/90 to-[#0a1620]/70" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 md:pt-14 pb-12 md:pb-16 grid lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* Pitch + live receipt */}
          <div className="lg:col-span-5 lg:sticky lg:top-20 mk-hero-in">
            <div className="inline-flex items-center gap-1.5 mk-glass rounded-full pl-2 pr-3 py-1 mb-5 text-xs font-medium text-white/85">
              <BadgeCheck className="w-3.5 h-3.5 text-emerald-300" strokeWidth={2.5} aria-hidden="true" />
              {d?.badge || '14-day free trial · no card needed'}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.04] mb-4">
              {d?.title || 'Open your store. Ring up a sale today.'}
            </h1>
            <p className="text-[15px] text-white/70 leading-relaxed max-w-lg mb-8">
              {d?.desc || 'Fill this in once. You get your own store address, an owner login, and a till ready for your first product.'}
            </p>

            <div className="hidden sm:block max-w-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">{d?.previewLabel || 'Your first receipt'}</p>
              <ReceiptPreview form={form} host={host} d={d} />
            </div>
          </div>

          {/* Form / result */}
          <div className="lg:col-span-7 mk-hero-in [animation-delay:150ms]">
            {created ? (
              <div className="mk-panel rounded-xl p-6 sm:p-8 text-gray-900" role="status">
                <div className="mk-lcd rounded-md px-4 py-3 mb-6 flex items-center justify-between">
                  <span className="text-xl font-bold tracking-widest">{d?.approved || 'APPROVED'}</span>
                  <span className="text-xs tabular-nums opacity-80">
                    {(d?.redirectIn || 'sign-in in {n}s').replace('{n}', String(countdown))}
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
                  {(d?.createdTitle || '{name} is open.').replace('{name}', created.name)}
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed mb-5">
                  {d?.createdDesc || 'Sign in with the owner email and password you just set. Your 14-day trial has started.'}
                </p>
                <p className="text-xs text-gray-500 mb-1">{d?.storeAddress || 'Your store address'}</p>
                <p className="font-mono text-sm text-brand break-all mb-6">
                  {host}/{created.slug}
                </p>
                <Button asChild variant="brand" size="xl" className="w-full sm:w-auto">
                  <Link href={loginHref}>
                    {d?.goToLogin || 'Go to sign-in now'}
                    <ArrowIcon className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="mk-panel rounded-xl p-5 sm:p-7 text-gray-900" aria-labelledby="signup-step-heading">
                <Stepper step={step} onStep={goTo} d={d} />

                {error && (
                  <Alert variant="destructive" className="mb-6 border-red-200 bg-red-50">
                    <AlertCircle strokeWidth={2.25} aria-hidden="true" />
                    <AlertTitle>{error}</AlertTitle>
                    {errorList.length > 0 && (
                      <AlertDescription>
                        <ul className="list-disc pl-4 text-xs space-y-0.5">
                          {errorList.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    )}
                  </Alert>
                )}

                <div key={step} className="mk-hero-in">
                  <div className="flex items-center gap-2 mb-1">
                    <FKey>{`F${step + 1}`}</FKey>
                    <h2 id="signup-step-heading" ref={stepHeadingRef} tabIndex={-1} className="text-base font-bold tracking-tight outline-none">
                      {d?.[STEPS[step].key] || STEPS[step].label}
                    </h2>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    {step === 0 && (d?.groupStoreDesc || 'The name customers see and the address your staff sign in at.')}
                    {step === 1 && (d?.groupOwnerDesc || 'You add cashiers and managers later, from inside the store.')}
                    {step === 2 && (d?.groupTillDesc || 'Filled in from your location. You can change all of this later in Settings.')}
                    {step === 3 && (d?.groupReviewDesc || 'Nothing is created until you press the button below.')}
                  </p>

                  {step === 0 && (
                    <div className="grid gap-3">
                      <Field id="name" label={d?.storeName || 'Store name'} required>
                        <Input
                          id="name"
                          required
                          autoComplete="organization"
                          value={form.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : toSlug(name) }));
                          }}
                          placeholder={d?.storeNamePlaceholder || 'Aling Nena Store'}
                          className={fieldCls}
                        />
                      </Field>

                      <Field
                        id="slug"
                        label={d?.storeId || 'Store ID'}
                        required
                        hint={d?.storeIdHint || 'This becomes your store address. Lowercase letters, numbers and hyphens.'}
                      >
                        <div className="flex rounded-md border border-[#cdd8dc] bg-white shadow-[inset_0_1px_2px_rgba(16,42,56,0.06)] focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
                          <span className="hidden sm:flex items-center px-3 text-xs font-mono text-gray-400 border-r border-[#e3eaed] bg-[#f5f8f9] rounded-l-md select-none">
                            {host}/
                          </span>
                          <input
                            id="slug"
                            required
                            pattern="[a-z0-9-]+"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={form.slug}
                            onChange={(e) => {
                              setSlugTouched(true);
                              set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                            }}
                            placeholder="aling-nena-store"
                            className="flex-1 min-w-0 h-11 bg-transparent px-3 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none"
                          />
                        </div>
                      </Field>

                      <Field id="companyName" label={d?.companyName || 'Registered business name'} optional={d?.optional || 'optional'}>
                        <Input
                          id="companyName"
                          value={form.companyName}
                          onChange={(e) => set('companyName', e.target.value)}
                          placeholder={d?.companyNamePlaceholder || 'As printed on your receipts'}
                          className={fieldCls}
                        />
                      </Field>

                      <fieldset>
                        <legend className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                          {d?.businessType || 'What do you sell?'}
                        </legend>
                        <RadioGroup value={form.businessType} onValueChange={(v) => set('businessType', v as BusinessType)} className="grid-cols-2">
                          {TYPES.map(({ type, Icon, label, desc }) => {
                            const active = form.businessType === type;
                            const cap = type.charAt(0).toUpperCase() + type.slice(1);
                            return (
                              <Label
                                key={type}
                                htmlFor={`type-${type}`}
                                className={`${active ? 'mk-key-brand' : 'mk-key-light'} cursor-pointer rounded-md px-3 py-2.5 flex items-start justify-start text-left gap-2.5 font-normal has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40`}
                              >
                                <span className="sr-only"><RadioGroupItem id={`type-${type}`} value={type} /></span>
                                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={2.25} aria-hidden="true" />
                                <span>
                                  <span className="block text-sm font-bold">{d?.[`type${cap}`] || label}</span>
                                  <span className={`block text-[11px] leading-snug ${active ? 'text-white/80' : 'text-gray-500'}`}>{d?.[`type${cap}Desc`] || desc}</span>
                                </span>
                              </Label>
                            );
                          })}
                        </RadioGroup>
                      </fieldset>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="grid gap-3">
                      <Field id="adminName" label={d?.ownerName || 'Your name'} required>
                        <Input id="adminName" required autoComplete="name" value={form.adminName} onChange={(e) => set('adminName', e.target.value)} placeholder="Juan dela Cruz" className={fieldCls} />
                      </Field>
                      <Field id="adminEmail" label={d?.ownerEmail || 'Email'} required hint={d?.ownerEmailHint || 'You sign in with this. It must not be used by another 1pos account.'}>
                        <Input id="adminEmail" type="email" required autoComplete="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} placeholder="you@example.com" className={fieldCls} />
                      </Field>
                      <Field id="adminPassword" label={d?.ownerPassword || 'Password'} required>
                        <PasswordInput
                          id="adminPassword"
                          required
                          autoComplete="new-password"
                          aria-describedby="password-rules"
                          value={form.adminPassword}
                          onChange={(e) => set('adminPassword', e.target.value)}
                          className={inputCls}
                        />
                        <ul id="password-rules" className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                          {PASSWORD_RULES.map(([key, label, test]) => {
                            const ok = test(form.adminPassword);
                            return (
                              <li key={key} className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-brand' : 'text-gray-500'}`}>
                                {ok ? (
                                  <Check className="w-3.5 h-3.5" strokeWidth={2.75} aria-hidden="true" />
                                ) : (
                                  <Circle className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
                                )}
                                <span>
                                  {d?.[key] || label}
                                  <span className="sr-only">{ok ? ` — ${d?.ruleMet || 'done'}` : ''}</span>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </Field>
                    </div>
                  )}

                  {step === 2 && (
                    <div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <Field id="currency" label={d?.currency || 'Currency'}>
                          <Select value={form.currency} disabled={detecting} onValueChange={(v) => set('currency', v)}>
                            <SelectTrigger id="currency" className="w-full data-[size=default]:h-11 bg-white px-3">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CURRENCIES.map(([code, name]) => (
                                <SelectItem key={code} value={code}>
                                  <span className="font-mono text-xs">{code}</span> {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <fieldset>
                          <legend className="block text-[13px] font-semibold text-gray-700 mb-1.5">{d?.language || 'Till language'}</legend>
                          <RadioGroup value={form.language} onValueChange={(v) => set('language', v as Lang)} className="grid-cols-2">
                            {(['en', 'es'] as const).map((l) => (
                              <Label
                                key={l}
                                htmlFor={`lang-${l}`}
                                className={`${form.language === l ? 'mk-key-brand' : 'mk-key-light'} cursor-pointer h-11 rounded-md flex items-center justify-center text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40`}
                              >
                                <span className="sr-only"><RadioGroupItem id={`lang-${l}`} value={l} /></span>
                                {l === 'en' ? 'English' : 'Español'}
                              </Label>
                            ))}
                          </RadioGroup>
                        </fieldset>
                        <Field id="phone" label={d?.phone || 'Store phone'} optional={d?.optional || 'optional'}>
                          <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={phonePlaceholder} className={fieldCls} />
                        </Field>
                        <Field id="email" label={d?.contactEmail || 'Store email'} optional={d?.optional || 'optional'}>
                          <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={d?.contactEmailPlaceholder || 'Shown to customers'} className={fieldCls} />
                        </Field>
                      </div>
                      {detecting && <p className="mt-2 text-[11px] text-gray-400">{d?.detecting || 'Checking your location for currency and language…'}</p>}
                    </div>
                  )}

                  {step === 3 && <Review form={form} host={host} onEdit={goTo} d={d} />}
                </div>

                <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
                  {step > 0 && (
                    <Button type="button" variant="light" size="xl" onClick={() => goTo(step - 1)} disabled={loading} className="sm:w-auto">
                      <ArrowLeft className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
                      {d?.back || 'Back'}
                    </Button>
                  )}
                  <Button type="submit" variant="brand" size="xl" disabled={loading} className="flex-1 h-12 text-[15px]">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 motion-safe:animate-spin" strokeWidth={2.5} aria-hidden="true" />
                        {d?.creating || 'Opening your store…'}
                      </>
                    ) : step < LAST_STEP ? (
                      <>
                        {(d?.nextTo || 'Next: {step}').replace('{step}', d?.[STEPS[step + 1].key] || STEPS[step + 1].label)}
                        <ArrowIcon className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-xs opacity-80" aria-hidden="true">↵</span>
                        {d?.submit || 'Create my store'}
                      </>
                    )}
                  </Button>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-gray-500">
                  <p>
                    {d?.haveStore || 'Already have a store?'}{' '}
                    <Link href="/stores" className="font-semibold text-brand hover:text-brand-hover">
                      {d?.findStore || 'Find it and sign in'}
                    </Link>
                  </p>
                  <p>
                    {d?.agree || 'By creating a store you agree to our'}{' '}
                    <Link href="/privacy" className="underline hover:text-gray-700">
                      {d?.privacy || 'Privacy Policy'}
                    </Link>
                    .
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}

/** Keycap stepper: earlier steps are clickable to go back, the current one is lit, later ones wait (moving forward always goes through validation). */
function Stepper({ step, onStep, d }: { step: number; onStep: (i: number) => void; d: HomeDict }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="mk-lcd rounded px-2 py-1 text-[11px] font-bold tabular-nums">
          {(d?.stepOf || 'STEP {n}/{total}').replace('{n}', String(step + 1)).replace('{total}', String(STEPS.length))}
        </span>
        <div className="h-1.5 flex-1 max-w-48 rounded-full bg-[#e3eaed] overflow-hidden" aria-hidden="true">
          <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s, i) => {
          const current = i === step;
          const done = i < step;
          const label = d?.[s.key] || s.label;
          return (
            <li key={s.key}>
              <Button
                type="button"
                variant={current ? 'brand' : 'light'}
                disabled={!done && !current}
                aria-current={current ? 'step' : undefined}
                onClick={() => onStep(i)}
                className={`w-full h-auto py-1.5 px-2 flex-col items-start gap-0.5 text-left disabled:opacity-100 ${!current && !done ? 'text-gray-400' : ''}`}
              >
                <span className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider opacity-80">
                  {done ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
                  {`F${i + 1}`}
                </span>
                <span className="text-[11px] sm:text-xs font-semibold truncate w-full">{label}</span>
              </Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type ReviewForm = {
  name: string;
  slug: string;
  companyName: string;
  businessType: BusinessType;
  adminName: string;
  adminEmail: string;
  currency: string;
  language: Lang;
  phone: string;
  email: string;
};

/** Last step: everything on one slip, each block with a way back to its step. */
function Review({ form, host, onEdit, d }: { form: ReviewForm; host: string; onEdit: (i: number) => void; d: HomeDict }) {
  const none = <span className="text-gray-400">—</span>;
  const cap = form.businessType.charAt(0).toUpperCase() + form.businessType.slice(1);
  const blocks: { step: number; rows: [string, ReactNode][] }[] = [
    {
      step: 0,
      rows: [
        [d?.storeName || 'Store name', form.name],
        [d?.storeAddress || 'Store address', <span key="a" className="font-mono text-brand break-all">{host}/{form.slug}</span>],
        [d?.companyName || 'Registered business name', form.companyName || none],
        [d?.businessType || 'What do you sell?', d?.[`type${cap}`] || cap],
      ],
    },
    {
      step: 1,
      rows: [
        [d?.ownerName || 'Your name', form.adminName],
        [d?.ownerEmail || 'Email', <span key="e" className="break-all">{form.adminEmail}</span>],
        [d?.ownerPassword || 'Password', <span key="p" className="font-mono tracking-widest">••••••••</span>],
      ],
    },
    {
      step: 2,
      rows: [
        [d?.currency || 'Currency', <span key="c" className="font-mono">{form.currency}</span>],
        [d?.language || 'Till language', form.language === 'es' ? 'Español' : 'English'],
        [d?.phone || 'Store phone', form.phone || none],
        [d?.contactEmail || 'Store email', form.email || none],
      ],
    },
  ];

  return (
    <div className="grid gap-2">
      {blocks.map((b) => (
        <section key={b.step} className="rounded-lg border border-[#e3eaed] bg-white">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[#eef3f5]">
            <h3 className="flex items-center gap-2 text-[13px] font-bold">
              <FKey>{`F${b.step + 1}`}</FKey>
              {d?.[STEPS[b.step].key] || STEPS[b.step].label}
            </h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(b.step)} className="text-brand hover:text-brand-hover">
              <Pencil aria-hidden="true" />
              {d?.edit || 'Edit'}
            </Button>
          </div>
          <dl className="px-3.5 py-2.5 grid gap-1.5 text-sm">
            {b.rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
                <dt className="text-xs text-gray-500 pt-0.5">{k}</dt>
                <dd className="text-gray-900 min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function Field({ id, label, required, optional, hint, children }: { id: string; label: string; required?: boolean; optional?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="items-baseline gap-1.5 text-[13px] font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-brand" aria-hidden="true">*</span>}
        {optional && <span className="text-[11px] font-normal text-gray-400">{optional}</span>}
      </Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

/** Receipt header as the till will print it, updating as the form is filled in. */
function ReceiptPreview({
  form,
  host,
  d,
}: {
  form: { name: string; slug: string; companyName: string; adminName: string; currency: string };
  host: string;
  d: HomeDict;
}) {
  const sym = getCurrencySymbolForCode(form.currency) || form.currency + ' ';
  const lines: [string, number, number][] = [
    [d?.sampleItem1 || 'Sample item', 2, 45],
    [d?.sampleItem2 || 'Another item', 1, 120],
  ];
  const total = lines.reduce((s, [, q, p]) => s + q * p, 0);
  const fmt = (n: number) => `${sym}${n.toFixed(2)}`;

  return (
    <div className="mk-print bg-[#fbfaf6] text-gray-800 rounded-sm shadow-2xl px-5 py-5 font-mono text-xs" aria-hidden="true">
      <p className="text-center font-bold text-sm tracking-wide truncate">{form.name || d?.previewStore || 'YOUR STORE'}</p>
      {form.companyName && <p className="text-center text-[10px] text-gray-500 truncate">{form.companyName}</p>}
      <p className="text-center text-[10px] text-gray-500 truncate">
        {host}/{form.slug || 'your-store'}
      </p>
      <div className="border-t border-dashed border-gray-300 mt-3 pt-2 flex justify-between text-[10px] text-gray-500">
        <span>OR No. 0000000001</span>
        <span>{d?.till || 'TILL 1'}</span>
      </div>
      <div className="border-t border-dashed border-gray-300 mt-2 pt-2 space-y-1">
        {lines.map(([name, qty, price]) => (
          <div key={name} className="flex justify-between gap-3">
            <span className="truncate">
              {qty} × {name}
            </span>
            <span className="tabular-nums">{fmt(qty * price)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-gray-300 mt-2 pt-2 flex justify-between font-bold text-sm">
        <span>{d?.total || 'TOTAL'}</span>
        <span className="tabular-nums">{fmt(total)}</span>
      </div>
      <p className="border-t border-dashed border-gray-300 mt-2 pt-2 text-[10px] text-gray-500 truncate">
        {d?.cashier || 'Cashier'}: {form.adminName || '—'}
      </p>
    </div>
  );
}
