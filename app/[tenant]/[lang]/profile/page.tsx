'use client';

import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Check, KeyRound, QrCode, X } from 'lucide-react';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import { LineTag, ReceiptRow } from '@/components/marketing/primitives';
import Navbar from '@/components/Navbar';
import PageTitle from '@/components/PageTitle';
import { getDictionaryClient } from '../dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDate } from '@/lib/formatting';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import ErrorState from '@/components/ui/ErrorState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProfileFormSkeleton from '@/components/profile/ProfileFormSkeleton';
import { useProfilePage } from '@/hooks/useProfilePage';
import type { TranslationDict } from '@/types/dictionary';

const LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/70';
const FIELD = 'w-full min-h-[44px] border-2 border-ink/25 bg-paper-white px-3 py-2 font-receipt text-sm text-ink placeholder:text-ink/45 focus:border-ink focus:outline-none disabled:opacity-60';
const PRIMARY_KEY = 'flex min-h-[44px] w-full items-center justify-center gap-2 bg-ink px-5 font-receipt text-sm font-medium uppercase text-paper-white transition-colors hover:bg-brand-navy touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto';
const FORM_FOOTER = 'flex justify-end border-t border-dashed border-ink/30 px-4 py-3 sm:px-5';

/** A length of printed paper with a torn bottom edge. */
function Slip({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="bg-paper-white text-ink">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <h2 className="min-w-0 text-3xl">{title}</h2>
          {action}
        </div>
        {children && <div className="border-t border-dashed border-ink/30">{children}</div>}
      </div>
      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
    </section>
  );
}

function Field({ id, label, note, ...input }: { id: string; label: string; note?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>{label}</label>
      <input id={id} className={FIELD} {...input} />
      {note && <p className="mt-1 text-xs text-ink/60">{note}</p>}
    </div>
  );
}

/** The outcome of a save, printed on a strip of paper so it reads against the dark page. */
function Notice({ type, text, dismissLabel, onDismiss }: {
  type: 'success' | 'error';
  text: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex items-center justify-between gap-3 border-y border-l-4 border-r border-y-ink/40 border-r-ink/40 bg-paper pl-4 font-receipt text-sm text-ink ${type === 'error' ? 'border-l-stamp' : 'border-l-brand'}`}
    >
      <span className="min-w-0 py-2">{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-ink/60 transition-colors hover:text-ink"
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

function ProfileShell({ tag, title, subtitle, children }: {
  tag?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className={`${marketingFontClasses} mk-root pos-register flex min-h-dvh flex-col`}>
      <PageTitle />
      <Navbar />
      <div className="flex-1 bg-brand-navy-deep text-paper">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          {tag && <LineTag no="USR" className="mb-3 text-[#8fe3d0]">{tag}</LineTag>}
          <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{title}</h1>
          <p className="mt-3 text-paper/70">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { refreshUser } = useAuth();
  const { profile, setProfile, status, error, refetch } = useProfilePage();
  const [profileData, setProfileData] = useState({ name: '', email: '' });
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Keyed on the values, so a new QR token doesn't wipe edits in the form.
  const savedName = profile?.name;
  const savedEmail = profile?.email;
  useEffect(() => {
    if (savedName !== undefined || savedEmail !== undefined) {
      setProfileData({ name: savedName || '', email: savedEmail || '' });
    }
  }, [savedName, savedEmail]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const emailChanging = profileData.email !== (profile?.email || '');
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...profileData,
          ...(emailChanging ? { currentPassword: profileCurrentPassword } : {}),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.profile?.saved || 'Profile updated successfully!' });
        setProfileCurrentPassword('');
        setProfile((current) => (current ? { ...current, ...profileData } : current));
        // The navbar shows the name from the auth context
        await refreshUser();
      } else {
        setMessage({
          type: 'error',
          text: data.error || dict?.common?.failedToUpdateProfile || 'Failed to update profile',
        });
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      setMessage({
        type: 'error',
        text: dict?.common?.failedToUpdateProfile || 'Failed to update profile. Please check your connection.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({
        type: 'error',
        text: dict?.profile?.passwordsNotMatch || 'New passwords do not match',
      });
      setSaving(false);
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setMessage({
        type: 'error',
        text: dict?.profile?.passwordTooShort || 'Password must be at least 8 characters long',
      });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          password: passwordData.newPassword,
          currentPassword: passwordData.currentPassword,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: dict?.profile?.passwordSaved || 'Password updated successfully!',
        });
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setShowPasswordSection(false);
      } else {
        setMessage({
          type: 'error',
          text: data.error || dict?.common?.failedToUpdatePassword || 'Failed to update password',
        });
      }
    } catch (err) {
      console.error('Error updating password:', err);
      setMessage({
        type: 'error',
        text: dict?.common?.failedToUpdatePassword || 'Failed to update password. Please check your connection.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateQR = async () => {
    try {
      const res = await fetch('/api/auth/qr-code', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: dict?.profile?.qrRegenerated || 'QR code regenerated successfully!',
        });
        setProfile((current) => (current ? { ...current, qrToken: data.data.qrToken } : current));
      } else {
        setMessage({
          type: 'error',
          text: data.error || dict?.common?.failedToRegenerateQR || 'Failed to regenerate QR code',
        });
      }
    } catch (err) {
      console.error('Error regenerating QR code:', err);
      setMessage({
        type: 'error',
        text: dict?.common?.failedToRegenerateQR || 'Failed to regenerate QR code. Please check your connection.',
      });
    }
  };

  if (!dict) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-brand-navy-deep">
        <LoadingSpinner size="md" color="#8fe3d0" />
      </div>
    );
  }

  const profileDict = dict.profile ?? {};
  const shell = {
    tag: settings?.companyName,
    title: profileDict.title || 'User Profile',
    subtitle: profileDict.subtitle || 'Manage your account information and password',
  };

  if (status === 'loading') {
    return (
      <ProfileShell {...shell}>
        <ProfileFormSkeleton />
      </ProfileShell>
    );
  }

  if (status === 'error') {
    return (
      <ProfileShell {...shell}>
        <div className="mt-6 max-w-2xl">
          <div className="bg-paper-white text-ink">
            <ErrorState
              title={profileDict.failedToLoadProfile || 'Failed to load profile'}
              description={error || undefined}
              onRetry={refetch}
              retryLabel={dict.common.retry || 'Retry'}
            />
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      </ProfileShell>
    );
  }

  const emailChanging = profileData.email !== (profile?.email || '');
  const savingLabel = profileDict.saving || 'Saving...';

  return (
    <ProfileShell {...shell}>
      {/* Sticky, because on a phone the QR card and its result are a long way apart. */}
      {message && (
        <div className="sticky top-[4.5rem] z-40 mt-6">
          <Notice
            type={message.type}
            text={message.text}
            dismissLabel={dict.common.close || 'Close'}
            onDismiss={() => setMessage(null)}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          <Slip title={profileDict.information || 'Profile Information'}>
            <form onSubmit={handleProfileUpdate}>
              <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
                <Field
                  id="profile-name"
                  label={profileDict.name || 'Full Name'}
                  type="text"
                  autoComplete="name"
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  required
                  placeholder={profileDict.namePlaceholder || 'Enter your full name'}
                />
                <Field
                  id="profile-email"
                  label={profileDict.email || 'Email Address'}
                  type="email"
                  autoComplete="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  required
                  placeholder={profileDict.emailPlaceholder || 'Enter your email'}
                />
                {emailChanging && (
                  <div className="sm:col-span-2">
                    <Field
                      id="profile-email-password"
                      label={profileDict.currentPassword || 'Current Password'}
                      type="password"
                      autoComplete="current-password"
                      value={profileCurrentPassword}
                      onChange={(e) => setProfileCurrentPassword(e.target.value)}
                      required
                      placeholder={profileDict.currentPasswordPlaceholder || 'Enter current password'}
                      note={profileDict.emailChangeRequiresPassword || 'Changing your email requires confirming your current password.'}
                    />
                  </div>
                )}
              </div>
              <div className={FORM_FOOTER}>
                <button type="submit" disabled={saving} className={PRIMARY_KEY}>
                  {!saving && <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                  {saving ? savingLabel : profileDict.save || 'Save Changes'}
                </button>
              </div>
            </form>
          </Slip>

          <Slip
            title={profileDict.changePassword || 'Change Password'}
            action={
              <button
                type="button"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
                aria-expanded={showPasswordSection}
                className="flex min-h-[44px] shrink-0 items-center border border-ink/25 px-3 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:border-ink touch-manipulation"
              >
                {showPasswordSection ? dict.common.cancel || 'Cancel' : profileDict.changeAction || 'Change'}
              </button>
            }
          >
            {showPasswordSection && (
              <form onSubmit={handlePasswordUpdate}>
                <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
                  <div className="sm:col-span-2">
                    <Field
                      id="password-current"
                      label={profileDict.currentPassword || 'Current Password'}
                      type="password"
                      autoComplete="current-password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      required
                      placeholder={profileDict.currentPasswordPlaceholder || 'Enter current password'}
                    />
                  </div>
                  <Field
                    id="password-new"
                    label={profileDict.newPassword || 'New Password'}
                    type="password"
                    autoComplete="new-password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    required
                    minLength={8}
                    note={profileDict.passwordTooShort || 'Password must be at least 8 characters long'}
                  />
                  <Field
                    id="password-confirm"
                    label={profileDict.confirmPassword || 'Confirm New Password'}
                    type="password"
                    autoComplete="new-password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>
                <div className={FORM_FOOTER}>
                  <button type="submit" disabled={saving} className={PRIMARY_KEY}>
                    {!saving && <KeyRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
                    {saving ? savingLabel : profileDict.updatePassword || 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </Slip>
        </div>

        {/* The staff ID card: the QR on it is what gets scanned at login. */}
        <section className="min-w-0 bg-paper-white text-ink lg:col-span-5">
          <div className="bg-brand px-4 pb-3 pt-3 sm:px-5">
            <div className="mx-auto mb-3 h-2.5 w-16 bg-brand-navy-deep" aria-hidden />
            <h2 className="text-3xl">{profileDict.qrCode || 'QR Code Authentication'}</h2>
          </div>

          <div className="px-4 py-4 sm:px-5">
            <p className="break-words font-display text-4xl font-extrabold uppercase leading-none">{profile?.name}</p>
            {profile && (
              <div className="mt-3 space-y-1 font-receipt text-sm uppercase">
                <ReceiptRow label={profileDict.role || 'Role'} value={profile.role} />
                <ReceiptRow
                  label={profileDict.memberSince || 'Member Since'}
                  value={profile.createdAt ? formatDate(profile.createdAt, settings || getDefaultTenantSettings()) : '-'}
                />
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-ink/30 px-4 py-4 sm:px-5">
            <p className="mb-4 text-sm text-ink/70">
              {profileDict.qrCodeDescription || 'Scan this QR code to log in quickly. Keep it secure.'}
            </p>
            {profile?.qrToken ? (
              <QRCodeDisplay embedded qrToken={profile.qrToken} onRegenerate={handleRegenerateQR} />
            ) : (
              <div className="border-2 border-dashed border-ink/30 p-5 text-center">
                <p className="mb-4 font-receipt text-sm">{profileDict.qrNotAvailable || 'QR code not generated yet.'}</p>
                <button type="button" onClick={handleRegenerateQR} className={`${PRIMARY_KEY} sm:mx-auto`}>
                  <QrCode className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {profileDict.generateQR || 'Generate QR Code'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </ProfileShell>
  );
}
