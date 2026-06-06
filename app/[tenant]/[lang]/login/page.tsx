'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import PasswordInput from '@/components/ui/PasswordInput';

const QRCodeScanner = dynamic(() => import('@/components/QRCodeScanner'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading scanner...</div>,
});
import { getDictionaryClient } from '../dictionaries-client';

type LoginMethod = 'email' | 'qr';

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const { login, loginQR, isAuthenticated, loading: authLoading } = useAuth();
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

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

    const result = await login(email, password, tenant);
    
    if (result.success) {
      router.push(`/${tenant}/${lang}`);
    } else {
      setError(result.error || dict?.login?.loginFailed || 'Login failed. Please check your credentials.');
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
      setError(result.error || dict?.login?.invalidQR || 'Invalid QR code');
      setLoggingIn(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-soft via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-soft via-white to-slate-100 flex items-center justify-center px-4 py-12">
      {/* Language switcher — top-right corner */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher lang={lang} tenant={tenant} />
      </div>

      <div className="max-w-md w-full bg-white border border-gray-300 p-6 sm:p-8 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand border border-brand-hover mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">{dict?.login?.title || 'Staff Login'}</h1>
          <p className="text-gray-600 text-sm sm:text-base">{dict?.login?.subtitle || 'Choose your login method'}</p>
        </div>

        {/* Login Method Tabs */}
        <div className="flex gap-0 mb-6 bg-gray-100 border border-gray-300">
          <button
            onClick={() => { setLoginMethod('email'); setError(''); }}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-all border-r border-gray-300 last:border-r-0 ${
              loginMethod === 'email'
                ? 'bg-white text-brand border-b-2 border-b-brand'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {dict?.login?.email || 'Email'}
          </button>
          <button
            onClick={() => { setLoginMethod('qr'); setError(''); setShowQRScanner(true); }}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-all border-r border-gray-300 last:border-r-0 ${
              loginMethod === 'qr'
                ? 'bg-white text-brand border-b-2 border-b-brand'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {dict?.login?.qrCode || 'QR Code'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-2 border-red-300 text-red-700 text-sm flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Email Login Form */}
        {loginMethod === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.login?.emailAddress || 'Email Address'}
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white transition-all text-base"
                placeholder="admin@example.com"
                autoComplete="email"
                disabled={loggingIn}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.login?.password || 'Password'}
              </label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white transition-all text-base"
                placeholder={dict?.login?.enterPassword || 'Enter your password'}
                autoComplete="current-password"
                disabled={loggingIn}
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-brand text-white py-3.5 font-semibold hover:bg-brand-hover active:bg-brand-navy-deep transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base border border-brand-hover flex items-center justify-center gap-2"
            >
              {loggingIn ? (
                <>
                  <div className="animate-spin h-5 w-5 border-b-2 border-white"></div>
                  <span>{dict?.login?.signingIn || 'Signing in...'}</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>{dict?.login?.signIn || 'Sign In'}</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* QR Code Login */}
        {loginMethod === 'qr' && (
          <div className="space-y-4">
            <button
              onClick={() => setShowQRScanner(true)}
              disabled={loggingIn}
              className="w-full bg-brand text-white py-3.5 font-semibold hover:bg-brand-hover active:bg-brand-navy-deep transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base border border-brand-hover flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span>{dict?.login?.scanQRCode || 'Scan QR Code'}</span>
            </button>
            <p className="text-sm text-gray-600 text-center">
              {dict?.login?.scanQRDescription || 'Click the button above to scan your employee QR code'}
            </p>
          </div>
        )}

        {showQRScanner && (
          <QRCodeScanner
            onScan={handleQRScan}
            onClose={() => setShowQRScanner(false)}
            enabled={showQRScanner}
          />
        )}

        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <Link
            href="/stores"
            className="text-sm text-brand hover:text-brand-navy font-medium"
          >
            {dict?.login?.switchStore || 'Switch to different store'}
          </Link>
        </div>
      </div>
    </div>
  );
}

