'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { useAuth } from '@/contexts/AuthContext';
import QRCodeDisplay from '@/components/QRCodeDisplay';

export default function ProfilePage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { user } = useAuth();
  const [dict, setDict] = useState<any>(null);
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [pinData, setPinData] = useState({
    currentPin: '',
    newPin: '',
    confirmPin: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showPinSection, setShowPinSection] = useState(false);
  const [profileInfo, setProfileInfo] = useState<any>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchProfile();
  }, [lang]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/profile', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setProfileInfo(data.data);
        setProfileData({
          name: data.data.name || '',
          email: data.data.email || '',
        });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load profile' });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

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
        setProfileInfo(data.data);
        // Update auth context if needed
        window.location.reload(); // Refresh to update user in context
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update profile' });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Failed to update profile. Please check your connection.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: dict?.profile?.passwordsNotMatch || 'New passwords do not match' });
      setSaving(false);
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setMessage({ type: 'error', text: dict?.profile?.passwordTooShort || 'Password must be at least 8 characters long' });
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
        setMessage({ type: 'success', text: dict?.profile?.passwordSaved || 'Password updated successfully!' });
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
        setShowPasswordSection(false);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update password' });
      }
    } catch (error) {
      console.error('Error updating password:', error);
      setMessage({ type: 'error', text: 'Failed to update password. Please check your connection.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePinUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    if (pinData.newPin !== pinData.confirmPin) {
      setMessage({ type: 'error', text: dict?.profile?.pinsNotMatch || 'New PINs do not match' });
      setSaving(false);
      return;
    }

    if (!/^\d{4,8}$/.test(pinData.newPin)) {
      setMessage({ type: 'error', text: dict?.profile?.pinInvalid || 'PIN must be 4-8 digits' });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pin: pinData.newPin,
          currentPin: profileInfo?.hasPin ? pinData.currentPin : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: dict?.profile?.pinSaved || 'PIN updated successfully!' });
        setPinData({
          currentPin: '',
          newPin: '',
          confirmPin: '',
        });
        setShowPinSection(false);
        // Refresh profile to get updated hasPin status
        await fetchProfile();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update PIN' });
      }
    } catch (error) {
      console.error('Error updating PIN:', error);
      setMessage({ type: 'error', text: 'Failed to update PIN. Please check your connection.' });
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
        setMessage({ type: 'success', text: dict?.profile?.qrRegenerated || 'QR code regenerated successfully!' });
        await fetchProfile();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to regenerate QR code' });
      }
    } catch (error) {
      console.error('Error regenerating QR code:', error);
      setMessage({ type: 'error', text: 'Failed to regenerate QR code. Please check your connection.' });
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict?.profile?.title || 'User Profile'}
          </h1>
          <p className="text-gray-600">{dict?.profile?.subtitle || 'Manage your account information and password'}</p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl shadow-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border-2 border-green-200'
                : 'bg-red-50 text-red-800 border-2 border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-5 sm:p-6 lg:p-8">
            {/* Profile Information */}
            <section className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-5">
                {dict?.profile?.information || 'Profile Information'}
              </h2>
              <form onSubmit={handleProfileUpdate} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {dict?.profile?.name || 'Full Name'}
                    </label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      required
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                      placeholder={dict?.profile?.namePlaceholder || 'Enter your full name'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {dict?.profile?.email || 'Email Address'}
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      required
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                      placeholder={dict?.profile?.emailPlaceholder || 'Enter your email'}
                    />
                  </div>
                </div>

                {profileInfo && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        {dict?.profile?.role || 'Role'}
                      </label>
                      <div className="px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-gray-700 capitalize">
                        {profileInfo.role}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        {dict?.profile?.memberSince || 'Member Since'}
                      </label>
                      <div className="px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl text-gray-700">
                        {profileInfo.createdAt ? new Date(profileInfo.createdAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>{dict?.profile?.saving || 'Saving...'}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{dict?.profile?.save || 'Save Changes'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            {/* Password Change Section */}
            <section className="pt-8 border-t border-gray-200">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-gray-900">
                  {dict?.profile?.changePassword || 'Change Password'}
                </h2>
                <button
                  onClick={() => setShowPasswordSection(!showPasswordSection)}
                  className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors shadow-sm"
                >
                  {showPasswordSection ? 'Cancel' : 'Change Password'}
                </button>
              </div>

              {showPasswordSection && (
                <form onSubmit={handlePasswordUpdate} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {dict?.profile?.currentPassword || 'Current Password'}
                      </label>
                      <input
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        required
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                        placeholder={dict?.profile?.currentPasswordPlaceholder || 'Enter current password'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {dict?.profile?.newPassword || 'New Password'}
                      </label>
                      <input
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        required
                        minLength={8}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                        placeholder={dict?.profile?.newPasswordPlaceholder || 'Enter new password (min 8 chars)'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {dict?.profile?.confirmPassword || 'Confirm New Password'}
                      </label>
                      <input
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        required
                        minLength={8}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                        placeholder={dict?.profile?.confirmPasswordPlaceholder || 'Confirm new password'}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>{dict?.profile?.saving || 'Saving...'}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          <span>{dict?.profile?.updatePassword || 'Update Password'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* PIN Management Section */}
            <section className="pt-8 border-t border-gray-200">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {dict?.profile?.mpin || 'MPIN (Mobile PIN)'}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {profileInfo?.hasPin 
                      ? dict?.profile?.pinSet || 'Your PIN is set. Use it for quick login.'
                      : dict?.profile?.pinNotSet || 'Set a PIN for quick login (4-8 digits)'}
                  </p>
                </div>
                <button
                  onClick={() => setShowPinSection(!showPinSection)}
                  className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors shadow-sm"
                >
                  {showPinSection ? 'Cancel' : (profileInfo?.hasPin ? 'Change PIN' : 'Set PIN')}
                </button>
              </div>

              {showPinSection && (
                <form onSubmit={handlePinUpdate} className="space-y-6">
                  {profileInfo?.hasPin && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {dict?.profile?.currentPin || 'Current PIN'}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={pinData.currentPin}
                        onChange={(e) => setPinData({ ...pinData, currentPin: e.target.value.replace(/\D/g, '') })}
                        required={profileInfo?.hasPin}
                        maxLength={8}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                        placeholder={dict?.profile?.currentPinPlaceholder || 'Enter current PIN'}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {profileInfo?.hasPin 
                          ? (dict?.profile?.newPin || 'New PIN')
                          : (dict?.profile?.pin || 'PIN')}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={pinData.newPin}
                        onChange={(e) => setPinData({ ...pinData, newPin: e.target.value.replace(/\D/g, '') })}
                        required
                        minLength={4}
                        maxLength={8}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                        placeholder={profileInfo?.hasPin 
                          ? (dict?.profile?.newPinPlaceholder || 'Enter new PIN (4-8 digits)')
                          : (dict?.profile?.pinPlaceholder || 'Enter PIN (4-8 digits)')}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {profileInfo?.hasPin 
                          ? (dict?.profile?.confirmPin || 'Confirm New PIN')
                          : (dict?.profile?.confirmPin || 'Confirm PIN')}
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={pinData.confirmPin}
                        onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, '') })}
                        required
                        minLength={4}
                        maxLength={8}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                        placeholder={profileInfo?.hasPin 
                          ? (dict?.profile?.confirmPinPlaceholder || 'Confirm new PIN')
                          : (dict?.profile?.confirmPinPlaceholder || 'Confirm PIN')}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>{dict?.profile?.saving || 'Saving...'}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          <span>
                            {profileInfo?.hasPin 
                              ? (dict?.profile?.updatePin || 'Change PIN')
                              : (dict?.profile?.setPin || 'Set PIN')}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* QR Code Section */}
            <section className="pt-8 border-t border-gray-200">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                  {dict?.profile?.qrCode || 'QR Code Authentication'}
                </h2>
                <p className="text-sm text-gray-600">
                  {dict?.profile?.qrCodeDescription || 'Scan this QR code to log in quickly. Keep it secure.'}
                </p>
              </div>

              {profileInfo?.qrToken ? (
                <div className="flex justify-center">
                  <QRCodeDisplay
                    qrToken={profileInfo.qrToken}
                    name={profileInfo.name}
                    onRegenerate={handleRegenerateQR}
                  />
                </div>
              ) : (
                <div className="p-6 bg-blue-50 border-2 border-blue-200 rounded-xl text-center">
                  <p className="text-blue-800 mb-4">
                    {dict?.profile?.qrNotAvailable || 'QR code not generated yet.'}
                  </p>
                  <button
                    onClick={handleRegenerateQR}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2 mx-auto"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{dict?.profile?.generateQR || 'Generate QR Code'}</span>
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

