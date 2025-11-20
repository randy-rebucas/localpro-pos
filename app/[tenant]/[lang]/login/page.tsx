'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import PINInput from '@/components/PINInput';
import QRCodeScanner from '@/components/QRCodeScanner';
import { getDictionaryClient } from '../dictionaries-client';

type LoginMethod = 'email' | 'pin' | 'qr';

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const { login, loginPIN, loginQR, isAuthenticated, loading: authLoading } = useAuth();
  const [dict, setDict] = useState<any>(null);
  
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
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

  const handlePINComplete = async (enteredPin: string) => {
    setError('');
    setLoggingIn(true);
    setPin(enteredPin);

    const result = await loginPIN(enteredPin, tenant);
    
    if (result.success) {
      router.push(`/${tenant}/${lang}`);
    } else {
      setError(result.error || dict?.login?.invalidPIN || 'Invalid PIN');
      setLoggingIn(false);
      setPin('');
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6 sm:p-8 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">{dict?.login?.title || 'Staff Login'}</h1>
          <p className="text-gray-600 text-sm sm:text-base">{dict?.login?.subtitle || 'Choose your login method'}</p>
        </div>

        {/* Login Method Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => { setLoginMethod('email'); setError(''); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              loginMethod === 'email'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {dict?.login?.email || 'Email'}
          </button>
          <button
            onClick={() => { setLoginMethod('pin'); setError(''); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              loginMethod === 'pin'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {dict?.login?.pin || 'PIN'}
          </button>
          <button
            onClick={() => { setLoginMethod('qr'); setError(''); setShowQRScanner(true); }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              loginMethod === 'qr'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {dict?.login?.qrCode || 'QR Code'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2 animate-fade-in">
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
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all text-base"
                placeholder="admin@example.com"
                autoComplete="email"
                disabled={loggingIn}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.login?.password || 'Password'}
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all text-base"
                placeholder={dict?.login?.enterPassword || 'Enter your password'}
                autoComplete="current-password"
                disabled={loggingIn}
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              {loggingIn ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
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

        {/* PIN Login */}
        {loginMethod === 'pin' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-4 text-center">
                {dict?.login?.enterPin || 'Enter your PIN'}
              </label>
              <PINInput
                length={4}
                onComplete={handlePINComplete}
                disabled={loggingIn}
                error={error}
              />
            </div>
            {loggingIn && (
              <div className="flex items-center justify-center gap-2 text-blue-600">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span>{dict?.login?.verifyingPin || 'Verifying PIN...'}</span>
              </div>
            )}
          </div>
        )}

        {/* QR Code Login */}
        {loginMethod === 'qr' && (
          <div className="space-y-4">
            <button
              onClick={() => setShowQRScanner(true)}
              disabled={loggingIn}
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-md hover:shadow-lg flex items-center justify-center gap-2"
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
            href="/login"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {dict?.login?.switchStore || 'Switch to different store'}
          </Link>
        </div>
      </div>
    </div>
  );
}

