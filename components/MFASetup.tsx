'use client';

import { useState } from 'react';
import Image from 'next/image';

type Step = 'status' | 'qr' | 'verify' | 'backup' | 'done';

interface MFAStatus {
  isEnabled: boolean;
  enabledAt?: string;
}

export default function MFASetup() {
  const [step, setStep] = useState<Step>('status');
  const [status, setStatus] = useState<MFAStatus | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadStatus() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/setup');
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
        setStep('status');
      }
    } catch {
      setError('Failed to load MFA status');
    } finally {
      setLoading(false);
    }
  }

  async function startSetup() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/setup', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }
      setQrCode(data.data.qrCode);
      setSecret(data.data.secret);
      setBackupCodes(data.data.backupCodes);
      setStep('qr');
    } catch {
      setError('Failed to start MFA setup');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!totpCode || totpCode.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }
      setStep('backup');
    } catch {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function disableMFA() {
    if (!disableCode) {
      setError('Enter your TOTP code to disable MFA');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }
      setStatus({ isEnabled: false });
      setDisableCode('');
    } catch {
      setError('Failed to disable MFA');
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  if (!status && step === 'status') {
    loadStatus();
  }

  return (
    <div className="max-w-md">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Two-Factor Authentication (MFA)</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {/* Status view */}
      {step === 'status' && status && (
        <div>
          {status.isEnabled ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Enabled
                </span>
                {status.enabledAt && (
                  <span className="text-xs text-gray-500">
                    since {new Date(status.enabledAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-4">
                MFA is active. Your account requires an authenticator code on every login.
              </p>
              <div className="mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter TOTP code to disable
                </label>
                <input
                  type="text"
                  value={disableCode}
                  onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="block w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono tracking-widest"
                  maxLength={6}
                />
                <button
                  onClick={disableMFA}
                  disabled={loading}
                  className="mt-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
                >
                  Disable MFA
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                MFA is not enabled. Add an extra layer of security to your account.
              </p>
              <button
                onClick={startSetup}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
              >
                Enable MFA
              </button>
            </div>
          )}
        </div>
      )}

      {/* QR Code view */}
      {step === 'qr' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
          {qrCode && (
            <div className="mb-4 flex justify-center">
              <Image src={qrCode} alt="MFA QR Code" width={200} height={200} unoptimized />
            </div>
          )}
          <p className="text-xs text-gray-500 mb-1">Or enter the manual key:</p>
          <code className="block text-xs bg-gray-100 rounded p-2 mb-4 break-all font-mono">
            {secret}
          </code>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Enter the 6-digit code to confirm
          </label>
          <input
            type="text"
            value={totpCode}
            onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="block w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono tracking-widest mb-3"
            maxLength={6}
          />
          <button
            onClick={verifyCode}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
          >
            Verify & Enable
          </button>
        </div>
      )}

      {/* Backup codes view */}
      {step === 'backup' && (
        <div>
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            Save these backup codes in a safe place. Each can only be used once.
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {backupCodes.map((code, i) => (
              <code key={i} className="bg-gray-100 rounded px-2 py-1 text-xs font-mono text-center">
                {code}
              </code>
            ))}
          </div>
          <button
            onClick={() => { setStep('status'); loadStatus(); }}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded"
          >
            I have saved my backup codes
          </button>
        </div>
      )}
    </div>
  );
}
