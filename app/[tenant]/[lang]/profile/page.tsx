'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import PageLoading from '@/components/ui/PageLoading';
import ErrorState from '@/components/ui/ErrorState';
import InlineBanner from '@/components/ui/InlineBanner';
import ProfileFormSkeleton from '@/components/profile/ProfileFormSkeleton';
import { useProfilePage } from '@/hooks/useProfilePage';
import type { TranslationDict } from '@/types/dictionary';

export default function ProfilePage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { profile, status, error, refetch } = useProfilePage();
  const [profileData, setProfileData] = useState({ name: '', email: '' });
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

  useEffect(() => {
    if (profile) {
      setProfileData({
        name: profile.name || '',
        email: profile.email || '',
      });
    }
  }, [profile]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(profileData),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.profile?.saved || 'Profile updated successfully!' });
        window.location.reload();
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
        await refetch();
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
    return <PageLoading label="Loading..." />;
  }

  const profileDict = dict.profile ?? {};

  const pageHeader = (
    <div className="mb-6 sm:mb-8">
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
        {profileDict.title || 'User Profile'}
      </h1>
      <p className="text-gray-600">
        {profileDict.subtitle || 'Manage your account information and password'}
      </p>
    </div>
  );

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {pageHeader}
          <ProfileFormSkeleton />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {pageHeader}
          <div className="bg-white border border-gray-300">
            <ErrorState
              title={profileDict.failedToLoadProfile || 'Failed to load profile'}
              description={error || undefined}
              onRetry={refetch}
              retryLabel={dict.common.retry || 'Retry'}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {pageHeader}

        {message && (
          <div className="mb-6">
            <InlineBanner
              variant={message.type === 'error' ? 'error' : 'info'}
              message={message.text}
              onDismiss={() => setMessage(null)}
              className={
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border-green-300'
                  : undefined
              }
            />
          </div>
        )}

        <div className="bg-white border border-gray-300 overflow-hidden">
          <div className="p-5 sm:p-6 lg:p-8">
            <section className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-5">
                {profileDict.information || 'Profile Information'}
              </h2>
              <form onSubmit={handleProfileUpdate} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {profileDict.name || 'Full Name'}
                    </label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      required
                      className="w-full px-4 py-3 border-2 border-gray-300 transition-all bg-white"
                      placeholder={profileDict.namePlaceholder || 'Enter your full name'}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = primaryColor;
                        e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#d1d5db';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {profileDict.email || 'Email Address'}
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      required
                      className="w-full px-4 py-3 border-2 border-gray-300 transition-all bg-white"
                      placeholder={profileDict.emailPlaceholder || 'Enter your email'}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = primaryColor;
                        e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#d1d5db';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                </div>

                {profile && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        {profileDict.role || 'Role'}
                      </label>
                      <div className="px-4 py-3 bg-gray-50 border-2 border-gray-300 text-gray-700 capitalize">
                        {profile.role}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        {profileDict.memberSince || 'Member Since'}
                      </label>
                      <div className="px-4 py-3 bg-gray-50 border-2 border-gray-300 text-gray-700">
                        {profile.createdAt
                          ? new Date(profile.createdAt).toLocaleDateString()
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                    className="px-6 py-3 text-white font-semibold transition-all duration-200 border disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${primaryColor}dd`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = primaryColor;
                    }}
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin h-5 w-5 border-b-2 border-white rounded-full" />
                        <span>{profileDict.saving || 'Saving...'}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{profileDict.save || 'Save Changes'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            <section className="pt-8 border-t border-gray-200">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-gray-900">
                  {profileDict.changePassword || 'Change Password'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowPasswordSection(!showPasswordSection)}
                  style={{
                    color: primaryColor,
                    backgroundColor: `${primaryColor}10`,
                    borderColor: `${primaryColor}80`,
                  }}
                  className="px-4 py-2 text-sm font-medium transition-colors border"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = `${primaryColor}20`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = `${primaryColor}10`;
                  }}
                >
                  {showPasswordSection
                    ? dict.common.cancel || 'Cancel'
                    : profileDict.changePassword || 'Change Password'}
                </button>
              </div>

              {showPasswordSection && (
                <form onSubmit={handlePasswordUpdate} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {profileDict.currentPassword || 'Current Password'}
                      </label>
                      <input
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) =>
                          setPasswordData({ ...passwordData, currentPassword: e.target.value })
                        }
                        required
                        className="w-full px-4 py-3 border-2 border-gray-300 transition-all bg-white"
                        placeholder={
                          profileDict.currentPasswordPlaceholder || 'Enter current password'
                        }
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = primaryColor;
                          e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#d1d5db';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {profileDict.newPassword || 'New Password'}
                      </label>
                      <input
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) =>
                          setPasswordData({ ...passwordData, newPassword: e.target.value })
                        }
                        required
                        minLength={8}
                        className="w-full px-4 py-3 border-2 border-gray-300 transition-all bg-white"
                        placeholder={
                          profileDict.newPasswordPlaceholder || 'Enter new password (min 8 chars)'
                        }
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = primaryColor;
                          e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#d1d5db';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {profileDict.confirmPassword || 'Confirm New Password'}
                      </label>
                      <input
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) =>
                          setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                        }
                        required
                        minLength={8}
                        className="w-full px-4 py-3 border-2 border-gray-300 transition-all bg-white"
                        placeholder={
                          profileDict.confirmPasswordPlaceholder || 'Confirm new password'
                        }
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = primaryColor;
                          e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '#d1d5db';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                      className="px-6 py-3 text-white font-semibold transition-all duration-200 border disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${primaryColor}dd`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = primaryColor;
                      }}
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin h-5 w-5 border-b-2 border-white rounded-full" />
                          <span>{profileDict.saving || 'Saving...'}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                            />
                          </svg>
                          <span>{profileDict.updatePassword || 'Update Password'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className="pt-8 border-t border-gray-200">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                  {profileDict.qrCode || 'QR Code Authentication'}
                </h2>
                <p className="text-sm text-gray-600">
                  {profileDict.qrCodeDescription ||
                    'Scan this QR code to log in quickly. Keep it secure.'}
                </p>
              </div>

              {profile?.qrToken ? (
                <div className="flex justify-center">
                  <QRCodeDisplay
                    qrToken={profile.qrToken}
                    name={profile.name}
                    onRegenerate={handleRegenerateQR}
                  />
                </div>
              ) : (
                <div
                  className="p-6 border-2 text-center"
                  style={{
                    backgroundColor: `${primaryColor}10`,
                    borderColor: `${primaryColor}40`,
                    color: primaryColor,
                  }}
                >
                  <p className="mb-4">
                    {profileDict.qrNotAvailable || 'QR code not generated yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleRegenerateQR}
                    style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                    className="px-6 py-3 text-white font-semibold transition-all duration-200 border flex items-center gap-2 mx-auto"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `${primaryColor}dd`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = primaryColor;
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span>{profileDict.generateQR || 'Generate QR Code'}</span>
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
