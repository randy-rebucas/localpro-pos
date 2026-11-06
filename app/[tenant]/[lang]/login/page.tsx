'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { CircleAlert, LoaderCircle, LogIn, QrCode } from 'lucide-react';
import '@/app/marketing.css';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { marketingFontClasses } from '@/components/marketing/fonts';
import { Barcode, LineTag } from '@/components/marketing/primitives';
import TurnstileWidget, { TURNSTILE_SITE_KEY, type TurnstileHandle } from '@/components/TurnstileWidget';
import PasswordInput from '@/components/ui/PasswordInput';
import { normalizeImageUrl } from '@/lib/image-utils';

const QRCodeScanner = dynamic(() => import('@/components/QRCodeScanner'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading scanner...</div>,
});
import { getDictionaryClient } from '../dictionaries-client';

type LoginMethod = 'email' | 'qr';

const INPUT = 'w-full border-2 border-ink/25 bg-paper-white px-4 py-3 text-base text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none disabled:opacity-60';
const PRIMARY = 'flex w-full items-center justify-center gap-2 bg-ink px-4 py-3.5 font-semibold text-paper-white hover:bg-brand-navy disabled:cursor-not-allowed disabled:opacity-50';

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const lang = (params?.lang as 'en' | 'es') || 'en';
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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);

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
      setError(dict?.login?.enterBoth || 'Please enter both email and password');
      setLoggingIn(false);
      return;
    }

    const result = await login(email, password, tenant, turnstileToken);
    
    if (result.success) {
      router.push(`/${tenant}/${lang}`);
    } else {
      setError(result.error || dict?.login?.loginFailed || 'Login failed. Please check your credentials.');
      setLoggingIn(false);
      turnstile.current?.reset();
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
      setError(result.error || dict?.login?.invalidQR || 'Invalid QR code');
      setLoggingIn(false);
    }
  };

  if (authLoading) {
    return (
      <div className={`${marketingFontClasses} mk-root flex min-h-screen items-center justify-center bg-brand-navy-deep! text-paper-white!`}>
        <div className="text-center">
          <LoaderCircle className="mx-auto h-8 w-8 motion-safe:animate-spin" aria-hidden="true" />
          <p className="mt-4 font-receipt text-sm text-paper/80">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null; // Will redirect
  }

  // .mk-root sets its own background and color outside Tailwind's layers, so the page surface needs `!`.
  const tabClass = (active: boolean) =>
    `flex-1 px-4 font-receipt text-xs uppercase tracking-[0.1em] ${active ? 'bg-ink text-paper-white' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`;

  return (
    <div className={`${marketingFontClasses} mk-root min-h-screen bg-brand-navy-deep! text-paper-white!`}>
      {/* Language switcher — top-right corner */}
      <div className="fixed right-4 top-4 z-50">
        <LanguageSwitcher lang={lang} tenant={tenant} />
      </div>

      <main className="mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 pb-12 pt-20 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-6 xl:col-span-7">
          <LineTag no="00" className="text-[#8fe3d0]">
            {dict?.login?.tillSignOn || 'Till sign-on'}
          </LineTag>
          <h1 className="mt-4 text-6xl sm:text-7xl lg:text-8xl">{dict?.login?.title || 'Staff Login'}</h1>
          <p className="mt-4 text-lg leading-relaxed text-paper/85">{dict?.login?.subtitle || 'Choose your login method'}</p>
        </div>

        <div className="mx-auto w-full max-w-md drop-shadow-[0_10px_12px_rgb(0_0_0/0.3)] lg:col-span-6 lg:mr-0 xl:col-span-5">
          <div className="mk-tear-b bg-paper-white px-6 pb-10 pt-6 text-ink sm:px-8">
            <div className="flex items-center gap-3 border-b border-dashed border-ink/40 pb-4">
              {settings?.logo && !logoFailed && (
                <Image src={normalizeImageUrl(settings.logo)} alt="" width={44} height={44} className="h-11 w-11 shrink-0 object-contain" onError={() => setLogoFailed(true)} />
              )}
              <div className="min-w-0">
                {settings?.companyName && <p className="truncate font-semibold">{settings.companyName}</p>}
                <p className="truncate font-receipt text-xs text-ink/60">/{tenant}</p>
              </div>
            </div>

            {/* Login Method Tabs */}
            <div className="mt-5 flex border-2 border-ink">
              <button
                type="button"
                aria-pressed={loginMethod === 'email'}
                onClick={() => { setLoginMethod('email'); setError(''); }}
                className={tabClass(loginMethod === 'email')}
              >
                {dict?.login?.email || 'Email'}
              </button>
              <button
                type="button"
                aria-pressed={loginMethod === 'qr'}
                onClick={() => { setLoginMethod('qr'); setError(''); setShowQRScanner(true); }}
                className={tabClass(loginMethod === 'qr')}
              >
                {dict?.login?.qrCode || 'QR Code'}
              </button>
            </div>

            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 border-2 border-stamp p-3 text-sm text-stamp">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Email Login Form */}
            {loginMethod === 'email' && (
              <form onSubmit={handleEmailSubmit} className="mt-5 space-y-5">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                    {dict?.login?.emailAddress || 'Email Address'}
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={INPUT}
                    placeholder="admin@example.com"
                    autoComplete="email"
                    disabled={loggingIn}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
                    {dict?.login?.password || 'Password'}
                  </label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={INPUT}
                    placeholder={dict?.login?.enterPassword || 'Enter your password'}
                    autoComplete="current-password"
                    disabled={loggingIn}
                  />
                </div>

                <TurnstileWidget
                  ref={turnstile}
                  action="login"
                  language={lang}
                  errorMessage={dict?.login?.securityCheckFailed || 'The security check didn’t load. Check your connection and reload the page.'}
                  onToken={setTurnstileToken}
                />

                <button type="submit" disabled={loggingIn || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)} className={PRIMARY}>
                  {loggingIn ? (
                    <>
                      <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
                      <span>{dict?.login?.signingIn || 'Signing in...'}</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                      <span>{dict?.login?.signIn || 'Sign In'}</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* QR Code Login */}
            {loginMethod === 'qr' && (
              <div className="mt-5 space-y-4">
                <div className="relative mx-auto flex h-36 w-36 items-center justify-center overflow-hidden border-2 border-ink" aria-hidden="true">
                  <QrCode className="h-20 w-20 text-ink/70" strokeWidth={1.25} />
                  <span className="mk-sweep" />
                </div>
                <button type="button" onClick={() => setShowQRScanner(true)} disabled={loggingIn} className={PRIMARY}>
                  <QrCode className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  <span>{dict?.login?.scanQRCode || 'Scan QR Code'}</span>
                </button>
                <p className="text-center text-sm text-ink/75">
                  {dict?.login?.scanQRDescription || 'Click the button above to scan your employee QR code'}
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-4 border-t border-dashed border-ink/40 pt-4">
              <Link href="/stores" className="flex items-center text-sm font-semibold text-brand-hover underline underline-offset-4 hover:text-ink">
                {dict?.login?.switchStore || 'Switch to different store'}
              </Link>
              <Barcode className="h-7 w-20 shrink-0 text-ink" />
            </div>
          </div>
        </div>
      </main>

      {/* Outside the torn-paper mask, which would clip this full-screen overlay. */}
      {showQRScanner && (
        <QRCodeScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
          enabled={showQRScanner}
        />
      )}
    </div>
  );
}
