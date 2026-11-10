'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/ui/PasswordInput';
import TurnstileWidget, { TURNSTILE_SITE_KEY, type TurnstileHandle } from '@/components/TurnstileWidget';
import { Loader2 } from 'lucide-react';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import { Barcode, LineTag } from '@/components/marketing/primitives';
import { INPUT, KEY_PRIMARY, LABEL, Strip } from '@/components/super-admin/ui';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);

  useEffect(() => {
    // Redirect if already logged in as super_admin
    fetch('/api/super-admin/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) router.replace('/super-admin/dashboard');
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/super-admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const data = await res.json();

      if (data.success) {
        router.push('/super-admin/dashboard');
        return;
      }

      turnstile.current?.reset();
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const mins = retryAfter ? Math.ceil(Number(retryAfter) / 60) : 15;
        setError(`Too many login attempts. Please try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      turnstile.current?.reset();
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className={`${marketingFontClasses} mk-root flex min-h-screen items-center justify-center bg-brand-navy-deep!`}>
        <p role="status" className="flex items-center gap-2 font-receipt text-sm text-paper/70">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
          Checking your key…
        </p>
      </div>
    );
  }

  return (
    <div className={`${marketingFontClasses} mk-root min-h-screen bg-brand-navy-deep! text-paper`}>
      <main id="main-content" className="mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-6">
          <LineTag no="00" className="mb-4 text-[#8fe3d0]">Head office</LineTag>
          <h1 className="text-6xl text-paper-white sm:text-7xl lg:text-8xl">Super<br />admin</h1>
          <p className="mt-5 max-w-md text-paper/70">
            The back room for every 1pos store: tenants, plans, billing and records. Staff keys only.
          </p>
        </div>

        <div className="w-full max-w-md lg:col-span-5 lg:col-start-8">
          <div className="drop-shadow-[0_18px_30px_rgba(0,0,0,0.35)]">
            <div className="mk-tear-t h-3 bg-paper-white" aria-hidden />
            <div className="bg-paper-white px-6 pb-6 pt-4 text-ink sm:px-8">
              <div className="border-b border-dashed border-ink/30 pb-4 text-center">
                <p className="font-receipt text-xs uppercase tracking-[0.18em] text-ink/60">1pos platform</p>
                <p className="mt-1 font-receipt text-sm font-semibold uppercase tracking-[0.08em]">Sign-in slip</p>
              </div>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="sa-email" className={LABEL}>Email</label>
                  <input
                    id="sa-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={INPUT}
                    placeholder="admin@example.com"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label htmlFor="sa-password" className={LABEL}>Password</label>
                  <PasswordInput
                    id="sa-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={INPUT}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>

                <TurnstileWidget
                  ref={turnstile}
                  action="super_admin_login"
                  language="en"
                  errorMessage="The security check didn’t load. Check your connection and reload the page."
                  onToken={setTurnstileToken}
                />

                {error && <Strip tone="error">{error}</Strip>}

                <button
                  type="submit"
                  disabled={loading || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
                  className={`${KEY_PRIMARY} w-full`}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <Barcode className="mx-auto mt-6 h-8 w-40 text-ink/70" />
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </div>
        </div>
      </main>
    </div>
  );
}
