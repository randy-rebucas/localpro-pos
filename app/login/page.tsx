'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Tenant {
  _id: string;
  slug: string;
  name: string;
  settings: {
    currency: string;
    language: 'en' | 'es';
    primaryColor?: string;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/tenants');
      const data = await res.json();
      if (data.success) {
        setTenants(data.data);
      }
    } catch (error) {
      console.error('Error fetching tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const tenantSlug = selectedTenant || customSlug.trim().toLowerCase();
    
    if (!tenantSlug) {
      setError('Please select a store or enter a store slug');
      return;
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(tenantSlug)) {
      setError('Invalid store slug. Only lowercase letters, numbers, and hyphens are allowed.');
      return;
    }

    // Redirect to tenant with default language (en)
    router.push(`/${tenantSlug}/en`);
  };

  const handleQuickAccess = (slug: string) => {
    router.push(`/${slug}/en`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6 sm:p-8 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">POS System</h1>
          <p className="text-gray-600 text-sm sm:text-base">Select or enter your store to continue</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2 animate-fade-in">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          {/* Available Tenants */}
          {tenants.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Your Store
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {tenants.map((tenant) => (
                  <button
                    key={tenant._id}
                    type="button"
                    onClick={() => {
                      setSelectedTenant(tenant.slug);
                      setCustomSlug('');
                      setShowCustomInput(false);
                      setError('');
                    }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                      selectedTenant === tenant.slug
                        ? 'border-blue-500 bg-blue-50 shadow-md scale-[1.02]'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="font-semibold text-gray-900 text-base">{tenant.name}</div>
                      {selectedTenant === tenant.slug && (
                        <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mb-2">Slug: {tenant.slug}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full font-medium">
                        {tenant.settings.currency}
                      </span>
                      <span className="text-xs px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full font-medium">
                        {tenant.settings.language.toUpperCase()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Tenant Input */}
          <div>
            <button
              type="button"
              onClick={() => {
                setShowCustomInput(!showCustomInput);
                setSelectedTenant('');
                setError('');
              }}
              className="w-full text-left text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {showCustomInput ? '−' : '+'} Enter Store Slug Manually
            </button>
            
            {showCustomInput && (
              <div className="mt-3">
                <input
                  type="text"
                  value={customSlug}
                  onChange={(e) => {
                    setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    setError('');
                  }}
                  placeholder="e.g., store1, my-store"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                  pattern="[a-z0-9-]+"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Enter your store's unique identifier (slug)
                </p>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || (!selectedTenant && !customSlug.trim())}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Loading...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span>Access Store</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Access Links */}
        {tenants.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-3 text-center">Quick Access:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {tenants.slice(0, 3).map((tenant) => (
                <button
                  key={tenant._id}
                  onClick={() => handleQuickAccess(tenant.slug)}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  {tenant.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Need help? Contact your administrator</p>
        </div>
      </div>
    </div>
  );
}

