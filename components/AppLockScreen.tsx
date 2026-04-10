'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLock } from '@/contexts/AppLockContext';

const MAX_PIN_LENGTH = 6;

export default function AppLockScreen() {
  const { user } = useAuth();
  const { isLocked, hasPinSet, unlock } = useAppLock();

  const [credential, setCredential] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  // When PIN status loads or lock mode changes, reset to the right input mode
  useEffect(() => {
    setCredential('');
    setError('');
    setUsePassword(false);
  }, [isLocked, hasPinSet]);

  const verify = useCallback(async (value: string) => {
    if (!value) return;
    setVerifying(true);
    setError('');
    try {
      const res = await fetch('/api/auth/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential: value }),
      });
      const data = await res.json();
      if (data.success) {
        setCredential('');
        unlock();
      } else {
        setCredential('');
        setError(data.error === 'Unauthorized' ? 'Session expired. Please log in again.' : 'Incorrect. Try again.');
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setVerifying(false);
    }
  }, [unlock]);

  // Auto-submit when PIN reaches max length
  useEffect(() => {
    const usingPin = hasPinSet && !usePassword;
    if (usingPin && credential.length === MAX_PIN_LENGTH) {
      verify(credential);
    }
  }, [credential, hasPinSet, usePassword, verify]);

  const handlePadPress = (digit: string) => {
    if (verifying) return;
    if (credential.length < MAX_PIN_LENGTH) {
      setCredential(prev => prev + digit);
    }
  };

  const handleDelete = () => {
    if (verifying) return;
    setCredential(prev => prev.slice(0, -1));
  };

  if (!isLocked) return null;

  const usingPin = hasPinSet && !usePassword;
  const isLoading = hasPinSet === null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/95 backdrop-blur-sm">
      <div className={`w-full max-w-sm px-6 py-8 flex flex-col items-center gap-6 ${shake ? 'animate-shake' : ''}`}>

        {/* Lock icon */}
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>

        {/* User name */}
        <div className="text-center">
          <p className="text-white text-xl font-semibold">{user?.name || 'Locked'}</p>
          <p className="text-white/60 text-sm mt-1">
            {isLoading ? 'Loading...' : usingPin ? 'Enter your PIN to continue' : 'Enter your password to continue'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {!isLoading && (
          <>
            {usingPin ? (
              /* PIN dot indicators */
              <>
                <div className="flex gap-3">
                  {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full transition-all duration-150 ${
                        i < credential.length ? 'bg-white scale-110' : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>

                {/* Numeric pad */}
                <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
                  {['1','2','3','4','5','6','7','8','9'].map(d => (
                    <button
                      key={d}
                      onClick={() => handlePadPress(d)}
                      disabled={verifying}
                      className="h-14 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-xl font-medium transition-colors disabled:opacity-50"
                    >
                      {d}
                    </button>
                  ))}
                  {/* Bottom row: empty, 0, delete */}
                  <div />
                  <button
                    onClick={() => handlePadPress('0')}
                    disabled={verifying}
                    className="h-14 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-xl font-medium transition-colors disabled:opacity-50"
                  >
                    0
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={verifying || !credential.length}
                    className="h-14 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-colors disabled:opacity-30"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59l6.375-6.374a1.125 1.125 0 011.59 0h5.56c.84 0 1.52.68 1.52 1.521V18.63c0 .842-.68 1.52-1.52 1.52h-5.56a1.125 1.125 0 01-.79-.328z" />
                    </svg>
                  </button>
                </div>

                {verifying && (
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </div>
                )}
              </>
            ) : (
              /* Password input */
              <form
                onSubmit={e => { e.preventDefault(); verify(credential); }}
                className="w-full flex flex-col gap-3"
              >
                <input
                  type="password"
                  value={credential}
                  onChange={e => setCredential(e.target.value)}
                  placeholder="Password"
                  autoFocus
                  autoComplete="current-password"
                  disabled={verifying}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/50 rounded text-center text-lg tracking-widest"
                />
                <button
                  type="submit"
                  disabled={verifying || !credential}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {verifying && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  Unlock
                </button>
              </form>
            )}

            {/* Toggle input mode */}
            <button
              onClick={() => { setUsePassword(v => !v); setCredential(''); setError(''); }}
              className="text-white/50 hover:text-white/80 text-sm transition-colors"
            >
              {usingPin ? 'Use password instead' : hasPinSet ? 'Use PIN instead' : null}
            </button>
          </>
        )}
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
