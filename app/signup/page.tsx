'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { detectLocation } from '@/lib/location-detection';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { validatePassword as validatePasswordLib } from '@/lib/validation';

export default function SignupPage() {
  const router = useRouter();
  const [dict, setDict] = useState<any>(null);
  const [formData, setFormData] = useState({
    // Store info
    slug: '',
    name: '',
    companyName: '',
    businessType: 'general' as 'retail' | 'restaurant' | 'laundry' | 'service' | 'general',
    // Admin user info
    adminEmail: '',
    adminPassword: '',
    adminName: '',
    // Optional
    currency: 'USD',
    language: 'en',
    phone: '',
    email: '',
  });
  const [businessTypes, setBusinessTypes] = useState<any[]>([]);
  const [loadingBusinessTypes, setLoadingBusinessTypes] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [phonePlaceholder, setPhonePlaceholder] = useState('+1 (555) 123-4567');
  const [detectingLocation, setDetectingLocation] = useState(true);

  // Load dictionary
  useEffect(() => {
    getDictionaryClient(formData.language as 'en' | 'es' || 'en').then(setDict);
  }, [formData.language]);

  // Load business types
  useEffect(() => {
    const loadBusinessTypes = async () => {
      try {
        const res = await fetch('/api/business-types');
        const data = await res.json();
        if (data.success) {
          setBusinessTypes(data.data);
        }
      } catch (err) {
        console.error('Failed to load business types:', err);
      } finally {
        setLoadingBusinessTypes(false);
      }
    };
    loadBusinessTypes();
  }, []);

  // Detect location on component mount
  useEffect(() => {
    const detectUserLocation = async () => {
      try {
        const detected = await detectLocation();
        if (detected) {
          setFormData(prev => ({
            ...prev,
            currency: detected.currency,
            language: detected.language,
          }));
          if (detected.phoneFormat) {
            setPhonePlaceholder(detected.phoneFormat.placeholder);
          }
        }
      } catch (err) {
        console.error('Failed to detect location:', err);
        // Keep defaults if detection fails
      } finally {
        setDetectingLocation(false);
      }
    };

    detectUserLocation();
  }, []);

  const validatePassword = (password: string) => {
    if (!dict) return [];
    const t = (key: string, fallback: string) => {
      const keys = key.split('.');
      let value: any = dict;
      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) break;
      }
      return value || fallback;
    };
    const result = validatePasswordLib(password, t);
    return result.errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPasswordErrors([]);

    // Validate password
    const pwdErrors = validatePassword(formData.adminPassword);
    if (pwdErrors.length > 0) {
      setPasswordErrors(pwdErrors);
      return;
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      setError(dict?.signup?.storeIdentifierFormatError || 'Store identifier can only contain lowercase letters, numbers, and hyphens');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/tenants/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push(`/${data.data.tenant.slug}/${formData.language}/login`);
        }, 3000);
      } else {
        setError(data.error || dict?.signup?.failedToCreateStore || 'Failed to create store. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || dict?.signup?.errorOccurred || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white border border-gray-300 p-8 text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 border border-green-600 mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">{dict?.signup?.storeCreatedSuccessfully || 'Store Created Successfully!'}</h1>
          <p className="text-gray-600 mb-6">
            {dict?.signup?.storeCreatedMessage || 'Your store has been created. You will be redirected to the login page shortly.'}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            {dict?.signup?.useAdminToLogin || 'Please use your admin email and password to login.'}
          </p>
          <Link
            href={`/${formData.slug}/${formData.language}/login`}
            className="inline-block w-full bg-blue-600 text-white px-4 py-3 hover:bg-blue-700 font-medium transition-colors border border-blue-700"
          >
            {dict?.signup?.goToLogin || 'Go to Login'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full bg-white border border-gray-300 p-6 sm:p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 border border-blue-700 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">{dict?.signup?.createYourStore || 'Create Your Store'}</h1>
          <p className="text-gray-600 text-sm sm:text-base">{dict?.signup?.signupSubtitle || 'Sign up to get started with your POS system'}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-300 text-red-700 text-sm flex items-start gap-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Store Information */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{dict?.signup?.storeInformation || 'Store Information'}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.storeIdentifier || 'Store Identifier'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="slug"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  placeholder={dict?.signup?.storeIdentifierPlaceholder || 'my-store'}
                  pattern="[a-z0-9-]+"
                />
                <p className="mt-1 text-xs text-gray-500">{dict?.signup?.lowercaseLettersOnly || 'Lowercase letters, numbers, and hyphens only'}</p>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.storeName || 'Store Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  placeholder={dict?.signup?.storeNamePlaceholder || 'My Store'}
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.signup?.companyNameOptional || 'Company Name (Optional)'}
              </label>
              <input
                type="text"
                id="companyName"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                placeholder={dict?.signup?.companyNamePlaceholder || 'My Company Inc.'}
              />
            </div>

            <div className="mt-4">
              <label htmlFor="businessType" className="block text-sm font-medium text-gray-700 mb-1">
                {dict?.signup?.businessType || 'Business Type'} <span className="text-red-500">*</span>
              </label>
              {loadingBusinessTypes ? (
                <div className="w-full px-4 py-3 border-2 border-gray-300 bg-gray-50 flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent animate-spin"></div>
                  <span className="text-sm text-gray-600">Loading business types...</span>
                </div>
              ) : (
                <select
                  id="businessType"
                  required
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value as any })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                >
                  {businessTypes.map((type) => (
                    <option key={type.type} value={type.type}>
                      {type.name}
                    </option>
                  ))}
                </select>
              )}
              {formData.businessType && !loadingBusinessTypes && (
                <p className="mt-1 text-xs text-gray-600">
                  {businessTypes.find((t) => t.type === formData.businessType)?.description || ''}
                </p>
              )}
            </div>
          </div>

          {/* Admin Account */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{dict?.signup?.adminAccount || 'Admin Account'}</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="adminName" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.yourName || 'Your Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="adminName"
                  required
                  value={formData.adminName}
                  onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  placeholder={dict?.signup?.namePlaceholder || 'John Doe'}
                />
              </div>

              <div>
                <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.adminEmail || 'Admin Email'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="adminEmail"
                  required
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  placeholder={dict?.signup?.adminEmailPlaceholder || 'admin@example.com'}
                />
              </div>

              <div>
                <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.adminPassword || 'Admin Password'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  id="adminPassword"
                  required
                  value={formData.adminPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, adminPassword: e.target.value });
                    if (e.target.value) {
                      setPasswordErrors(validatePassword(e.target.value));
                    } else {
                      setPasswordErrors([]);
                    }
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  placeholder={dict?.signup?.createStrongPassword || 'Create a strong password'}
                />
                {passwordErrors.length > 0 && (
                  <ul className="mt-2 text-xs text-red-600 space-y-1">
                    {passwordErrors.map((err, idx) => (
                      <li key={idx}>• {err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Optional Settings */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{dict?.signup?.optionalSettings || 'Optional Settings'}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.currency || 'Currency'}
                </label>
                <select
                  id="currency"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  disabled={detectingLocation}
                >
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="CAD">CAD - Canadian Dollar</option>
                  <option value="AUD">AUD - Australian Dollar</option>
                  <option value="MXN">MXN - Mexican Peso</option>
                  <option value="PHP">PHP - Philippine Peso</option>
                  <option value="JPY">JPY - Japanese Yen</option>
                  <option value="CNY">CNY - Chinese Yuan</option>
                  <option value="INR">INR - Indian Rupee</option>
                  <option value="SGD">SGD - Singapore Dollar</option>
                  <option value="HKD">HKD - Hong Kong Dollar</option>
                  <option value="THB">THB - Thai Baht</option>
                  <option value="IDR">IDR - Indonesian Rupiah</option>
                  <option value="MYR">MYR - Malaysian Ringgit</option>
                  <option value="BRL">BRL - Brazilian Real</option>
                  <option value="ZAR">ZAR - South African Rand</option>
                </select>
                {detectingLocation && (
                  <p className="mt-1 text-xs text-gray-500">{dict?.signup?.detectingLocation || 'Detecting your location...'}</p>
                )}
              </div>

              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.language || 'Language'}
                </label>
                <select
                  id="language"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.phoneNumber || 'Phone Number'}
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  placeholder={phonePlaceholder}
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.signup?.contactEmail || 'Contact Email'}
                </label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  placeholder={dict?.signup?.contactEmailPlaceholder || 'contact@example.com'}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white px-4 py-4 hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg border border-blue-700 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin"></div>
                <span>{dict?.signup?.creatingStore || 'Creating Store...'}</span>
              </>
            ) : (
              dict?.signup?.createStore || 'Create Store'
            )}
          </button>

          <p className="text-center text-sm text-gray-600">
            {dict?.signup?.alreadyHaveStore || 'Already have a store?'}{' '}
            <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium">
              {dict?.signup?.selectStoreToLogin || 'Select a store to login'}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

