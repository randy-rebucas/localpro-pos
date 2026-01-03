'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

type AuthMode = 'login' | 'register' | 'otp';
type LoginMethod = 'email' | 'phone';

function CustomerLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || 'default';
  
  const { 
    register, 
    login, 
    loginWithOTP, 
    sendOTP,
    createGuestSession,
    isAuthenticated,
    isGuest,
    canAccess,
    loading: authLoading 
  } = useCustomerAuth();
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Email/Password fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Phone OTP fields
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if ((isAuthenticated || isGuest) && !authLoading) {
      router.push(`/customer/dashboard?tenant=${tenantSlug}`);
    }
  }, [isAuthenticated, isGuest, authLoading, router, tenantSlug]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('Please enter both email and password');
      setLoading(false);
      return;
    }

    const result = await login(email, password, tenantSlug);
    
    if (result.success) {
      router.push(`/customer/dashboard?tenant=${tenantSlug}`);
    } else {
      setError(result.error || 'Login failed');
      setLoading(false);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password || !firstName || !lastName) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const result = await register(email, password, firstName, lastName, phone || undefined, tenantSlug);
    
    if (result.success) {
      router.push(`/customer/dashboard?tenant=${tenantSlug}`);
    } else {
      setError(result.error || 'Registration failed');
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    setError('');
    setOtpLoading(true);

    if (!phone) {
      setError('Please enter your phone number');
      setOtpLoading(false);
      return;
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.length < 10) {
      setError('Please enter a valid phone number');
      setOtpLoading(false);
      return;
    }

    const result = await sendOTP(normalizedPhone, tenantSlug);
    
    if (result.success) {
      setOtpSent(true);
      setCountdown(60); // 60 second countdown
      setError('');
    } else {
      setError(result.error || 'Failed to send OTP');
      if (result.retryAfter) {
        setCountdown(result.retryAfter);
      }
    }
    setOtpLoading(false);
  };

  const handleOTPVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!phone || !otp) {
      setError('Please enter phone number and OTP');
      setLoading(false);
      return;
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    const result = await loginWithOTP(
      normalizedPhone,
      otp,
      mode === 'register' ? firstName : undefined,
      mode === 'register' ? lastName : undefined,
      tenantSlug
    );
    
    if (result.success) {
      router.push(`/customer/dashboard?tenant=${tenantSlug}`);
    } else {
      setError(result.error || 'OTP verification failed');
      setLoading(false);
    }
  };

  const handleContinueAsGuest = async () => {
    setError('');
    setLoading(true);

    const result = await createGuestSession(tenantSlug);
    
    if (result.success) {
      router.push(`/customer/dashboard?tenant=${tenantSlug}`);
    } else {
      setError(result.error || 'Failed to continue as guest');
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated || isGuest) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {mode === 'login' ? 'Customer Login' : mode === 'register' ? 'Create Account' : 'Verify Phone'}
            </h1>
            <p className="text-gray-600">Access your account</p>
          </div>

          {/* Mode Toggle */}
          {!otpSent && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => {
                  setMode('login');
                  setError('');
                  setOtpSent(false);
                }}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  mode === 'login'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Login
              </button>
              <button
                onClick={() => {
                  setMode('register');
                  setError('');
                  setOtpSent(false);
                }}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  mode === 'register'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Register
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Email/Password Forms */}
          {loginMethod === 'email' && !otpSent && (
            <form onSubmit={mode === 'login' ? handleEmailLogin : handleEmailRegister} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  minLength={8}
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    minLength={8}
                  />
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+1234567890"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Create Account'}
              </button>
            </form>
          )}

          {/* Phone OTP Form */}
          {loginMethod === 'phone' && (
            <div className="space-y-4">
              {!otpSent ? (
                <>
                  {mode === 'register' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          required
                        />
                      </div>
                    </>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="+1234567890"
                      required
                    />
                  </div>

                  <button
                    onClick={handleSendOTP}
                    disabled={otpLoading || countdown > 0}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {otpLoading
                      ? 'Sending...'
                      : countdown > 0
                      ? `Resend OTP (${countdown}s)`
                      : 'Send OTP'}
                  </button>
                </>
              ) : (
                <form onSubmit={handleOTPVerify} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Enter OTP
                    </label>
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                      placeholder="000000"
                      maxLength={6}
                      required
                    />
                    <p className="mt-2 text-sm text-gray-500">
                      Enter the 6-digit code sent to {phone}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Verifying...' : 'Verify OTP'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp('');
                      setCountdown(0);
                    }}
                    className="w-full py-2 text-gray-600 hover:text-gray-800 text-sm"
                  >
                    Change Phone Number
                  </button>

                  {countdown === 0 && (
                    <button
                      type="button"
                      onClick={handleSendOTP}
                      disabled={otpLoading}
                      className="w-full py-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Resend OTP
                    </button>
                  )}
                </form>
              )}
            </div>
          )}

          {/* Method Toggle */}
          {!otpSent && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-center space-y-3">
                <button
                  onClick={() => {
                    setLoginMethod(loginMethod === 'email' ? 'phone' : 'email');
                    setError('');
                    setOtpSent(false);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium block w-full"
                >
                  {loginMethod === 'email'
                    ? 'Use Phone OTP instead'
                    : 'Use Email/Password instead'}
                </button>
                
                {/* Continue as Guest */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or</span>
                  </div>
                </div>
                
                <button
                  onClick={handleContinueAsGuest}
                  disabled={loading}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Loading...' : 'Continue as Guest'}
                </button>
                <p className="text-xs text-gray-500">
                  Browse products and services without creating an account
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CustomerLoginPageContent />
    </Suspense>
  );
}
