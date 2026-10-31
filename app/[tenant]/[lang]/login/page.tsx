'use client';

import { useState, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AlertCircle, ArrowLeftRight, Camera, KeyRound, Loader2, QrCode, ScanLine, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { FKey } from '@/components/marketing/ui';
import PasswordInput from '@/components/ui/PasswordInput';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getDictionaryClient } from '../dictionaries-client';
import { BrandLogo } from '@/components/BrandLogo';

const QRCodeScanner = dynamic(() => import('@/components/QRCodeScanner'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading scanner...</div>,
});

type LoginMethod = 'email' | 'qr';
type Lang = 'en' | 'es';

/** Size + gloss surface on top of the shadcn Input defaults (same as signup). */
const fieldCls = 'h-11 bg-white px-3 placeholder:text-gray-400 shadow-[inset_0_1px_2px_rgba(16,42,56,0.06)]';

/** PasswordInput wraps a native input, so it needs the full field styling. */
const inputCls =
  'w-full h-11 rounded-md border border-[#cdd8dc] bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-[inset_0_1px_2px_rgba(16,42,56,0.06)] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50';

const noopSubscribe = () => () => {};
const subscribeMinute = (cb: () => void) => {
  const id = setInterval(cb, 15000);
  return () => clearInterval(id);
};

/** Store-local time for the LCD, refreshed every 15s; the string only changes once a minute. */
function useStoreClock(timeZone: string | undefined, lang: Lang) {
  const locale = lang === 'es' ? 'es' : 'en-PH';
  const format = (opts: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...opts, timeZone }).format(new Date());
    } catch {
      // Unknown timezone in settings: fall back to the device clock
      return new Intl.DateTimeFormat(locale, opts).format(new Date());
    }
  };
  const time = useSyncExternalStore(subscribeMinute, () => format({ hour: '2-digit', minute: '2-digit' }), () => '');
  const date = useSyncExternalStore(subscribeMinute, () => format({ weekday: 'short', month: 'short', day: 'numeric' }), () => '');
  return { time, date };
}

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const lang = (params?.lang as Lang) || 'en';
  const { login, loginQR, isAuthenticated, loading: authLoading } = useAuth();
  const { settings } = useTenantSettings();
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const d = dict?.login;

  const host = useSyncExternalStore(noopSubscribe, () => window.location.host, () => '1pos.app');
  const { time, date } = useStoreClock(settings?.timezone, lang);
  const storeName = settings?.companyName || tenant;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      router.push(`/${tenant}/${lang}`);
    }
  }, [isAuthenticated, authLoading, router, tenant, lang]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoggingIn(true);

    if (!email || !password) {
      setError(d?.enterBoth || 'Please enter both email and password');
      setLoggingIn(false);
      return;
    }

    const result = await login(email, password, tenant);

    if (result.success) {
      router.push(`/${tenant}/${lang}`);
    } else {
      setError(result.error || d?.loginFailed || 'Login failed. Please check your credentials.');
      setLoggingIn(false);
    }
  };

  const handleQRScan = async (qrToken: string) => {
    setError('');
    setLoggingIn(true);
    setShowQRScanner(false);

    const result = await loginQR(qrToken, tenant);

    if (result.success) {
      router.push(`/${tenant}/${lang}`);
    } else {
      setError(result.error || d?.invalidQR || 'Invalid QR code');
      setLoggingIn(false);
    }
  };

  const switchMethod = (method: LoginMethod) => {
    setLoginMethod(method);
    setError('');
    if (method === 'qr') setShowQRScanner(true);
  };

  if (authLoading || isAuthenticated) {
    // Authenticated users are redirected by the effect above
    return (
      <div className="mk-root mk-dark min-h-screen flex items-center justify-center text-white">
        <div className="mk-lcd rounded-md px-4 py-2.5 flex items-center gap-2.5 text-sm font-bold tracking-widest" role="status">
          <Loader2 className="w-4 h-4 motion-safe:animate-spin" strokeWidth={2.5} aria-hidden="true" />
          {authLoading ? d?.lcdLoading || 'LOADING' : d?.lcdOpening || 'OPENING TILL'}
        </div>
      </div>
    );
  }

  return (
    <div className="mk-root mk-dark relative min-h-screen flex flex-col text-white overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/marketing/convenience-night.webp" alt="" fetchPriority="high" className="mk-parallax-hero opacity-30 saturate-[0.8] absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a1620] via-[#0a1620]/90 to-[#0a1620]/65" />
      </div>

      <header className="relative max-w-7xl w-full mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center flex-shrink-0">
          <BrandLogo markClassName="h-7 w-7" />
        </Link>
        <div className="flex items-center gap-1.5">
          <nav aria-label={d?.languageLabel || 'Language'} className="flex gap-1">
            {(['en', 'es'] as const).map((l) => (
              <Button key={l} asChild variant={l === lang ? 'brand' : 'key'} size="sm" className="w-10 font-mono text-[11px] font-bold">
                <Link
                  href={`/${tenant}/${l}/login`}
                  aria-current={l === lang ? 'true' : undefined}
                  onClick={() => {
                    try {
                      localStorage.setItem('preferred_lang', l);
                    } catch {
                      // Storage blocked: the URL still carries the language
                    }
                  }}
                >
                  <span aria-hidden="true">{l.toUpperCase()}</span>
                  <span className="sr-only">{l === 'en' ? 'English' : 'Español'}</span>
                </Link>
              </Button>
            ))}
          </nav>
          <Button asChild variant="key" size="sm" className="hidden sm:inline-flex">
            <Link href="/stores">
              <ArrowLeftRight className="w-3.5 h-3.5" strokeWidth={2.25} aria-hidden="true" />
              {d?.switchStore || 'Switch to different store'}
            </Link>
          </Button>
        </div>
      </header>

      <main id="main-content" className="relative flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12 grid lg:grid-cols-12 gap-8 lg:gap-10 content-start lg:content-center items-center">
        {/* Which till you're opening */}
        <div className="lg:col-span-6 mk-hero-in">
          <div className="inline-flex items-center gap-1.5 mk-glass rounded-full pl-2 pr-3 py-1 mb-4 text-xs font-medium text-white/85">
            <KeyRound className="w-3.5 h-3.5 text-brand-muted" strokeWidth={2.5} aria-hidden="true" />
            {d?.badge || 'Staff only · cashiers, managers, owner'}
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.04] mb-3">
            {d?.heading || 'Sign in to open the till.'}
          </h1>
          <p className="text-[15px] text-white/70 leading-relaxed max-w-lg mb-7">
            {d?.desc || 'Use the email and password your owner set up for you, or hold your staff QR badge up to the camera.'}
          </p>

          <div className="hidden sm:block mk-glass rounded-xl p-4 max-w-md">
            <div className="flex items-center gap-3">
              {settings?.logo && !logoFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logo} alt="" onError={() => setLogoFailed(true)} className="w-11 h-11 rounded-md bg-white object-contain p-1 flex-shrink-0" />
              ) : (
                <span className="mk-key-brand w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0">
                  <Store className="w-5 h-5" strokeWidth={2.25} aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <p className="font-bold truncate">{storeName}</p>
                <p className="font-mono text-xs text-brand-muted truncate">
                  {host}/{tenant}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-1.5">
              <div className="mk-lcd rounded-md px-3 py-2 flex items-baseline justify-between gap-3">
                <span className="text-[10px] font-bold tracking-widest opacity-75">{d?.lcdStoreTime || 'STORE TIME'}</span>
                <span key={time} className="mk-lcd-on text-xl font-bold tabular-nums">
                  {time || '--:--'}
                </span>
              </div>
              <div className="mk-lcd rounded-md px-3 py-2 flex items-center text-xs font-bold tabular-nums uppercase">{date || '---'}</div>
            </div>
            <p className="mt-2 text-[11px] text-white/45">
              {(d?.timezoneNote || 'Clock follows the store timezone ({tz}).').replace('{tz}', settings?.timezone || 'Asia/Manila')}
            </p>
          </div>
        </div>

        {/* Sign-in panel */}
        <div className="lg:col-span-6 xl:col-span-5 xl:col-start-8 mk-hero-in [animation-delay:150ms]">
          <div className="mk-panel rounded-xl p-5 sm:p-7 text-gray-900">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2 min-w-0">
                <FKey>F1</FKey>
                <h2 className="text-base font-bold tracking-tight truncate">{d?.title || 'Staff Login'}</h2>
              </div>
              <span className="mk-lcd rounded px-2 py-1 text-[11px] font-bold truncate max-w-[50%]">@{tenant}</span>
            </div>

            <Tabs value={loginMethod} onValueChange={(v) => switchMethod(v as LoginMethod)} className="gap-5">
              <TabsList aria-label={d?.subtitle || 'Choose your login method'} className="grid grid-cols-2 gap-1.5 w-full h-auto bg-transparent p-0">
                <MethodTab value="email" active={loginMethod === 'email'} icon={<KeyRound strokeWidth={2.25} aria-hidden="true" />}>
                  {d?.email || 'Email'}
                </MethodTab>
                <MethodTab value="qr" active={loginMethod === 'qr'} icon={<QrCode strokeWidth={2.25} aria-hidden="true" />}>
                  {d?.qrCode || 'QR Code'}
                </MethodTab>
              </TabsList>

              {error && (
                <Alert variant="destructive" className="border-red-200 bg-red-50">
                  <AlertCircle strokeWidth={2.25} aria-hidden="true" />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}

              <TabsContent value="email" className="mk-hero-in">
                <form onSubmit={handleEmailSubmit} className="grid gap-3">
                  <Field id="email" label={d?.emailAddress || 'Email Address'}>
                    <Input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="you@example.com"
                      disabled={loggingIn}
                      className={fieldCls}
                    />
                  </Field>
                  <Field id="password" label={d?.password || 'Password'}>
                    <PasswordInput
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder={d?.enterPassword || 'Enter your password'}
                      disabled={loggingIn}
                      className={inputCls}
                    />
                  </Field>
                  <Button type="submit" variant="brand" size="xl" disabled={loggingIn} className="mt-2 w-full h-12 text-[15px]">
                    {loggingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 motion-safe:animate-spin" strokeWidth={2.5} aria-hidden="true" />
                        {d?.signingIn || 'Signing in...'}
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-xs opacity-80" aria-hidden="true">↵</span>
                        {d?.signIn || 'Sign In'}
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="qr" className="mk-hero-in">
                <div className="rounded-lg border-2 border-dashed border-[#cdd8dc] bg-white/60 px-5 py-6 flex flex-col items-center text-center">
                  <span className="mk-key-brand w-12 h-12 rounded-md flex items-center justify-center mb-3">
                    <ScanLine className="w-6 h-6" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  <p className="text-sm font-semibold mb-1">{d?.qrHeading || 'Hold your badge to the camera'}</p>
                  <p className="text-xs text-gray-500 max-w-xs">
                    {d?.qrDesc || 'Your staff QR code is on your Profile page. Print it or keep it on your phone.'}
                  </p>
                </div>
                <Button type="button" variant="brand" size="xl" onClick={() => setShowQRScanner(true)} disabled={loggingIn} className="mt-3 w-full h-12 text-[15px]">
                  {loggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 motion-safe:animate-spin" strokeWidth={2.5} aria-hidden="true" />
                      {d?.signingIn || 'Signing in...'}
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
                      {d?.scanQRCode || 'Scan QR Code'}
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>

            <div className="mt-5 pt-4 border-t border-[#e3eaed] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-gray-500">
              <p>{d?.lockedOut || 'Locked out? Your owner or a manager can set a new password under Admin → Users.'}</p>
              <Link href="/stores" className="font-semibold text-brand hover:text-brand-hover flex-shrink-0 sm:hidden">
                {d?.switchStore || 'Switch to different store'}
              </Link>
            </div>
          </div>
        </div>
      </main>

      {showQRScanner && <QRCodeScanner onScan={handleQRScan} onClose={() => setShowQRScanner(false)} enabled={showQRScanner} />}
    </div>
  );
}

/** Keycap-styled tab: lit (brand) when selected, light keycap otherwise. */
function MethodTab({ value, active, icon, children }: { value: LoginMethod; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className={`${active ? 'mk-key-brand text-white data-active:text-white' : 'mk-key-light text-gray-700'} h-10 rounded-md text-sm font-semibold after:hidden data-active:shadow-none data-active:bg-transparent`}
    >
      {icon}
      {children}
    </TabsTrigger>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="text-[13px] font-semibold text-gray-700 mb-1.5">
        {label}
      </Label>
      {children}
    </div>
  );
}
