'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface UserInfo {
  userId: string | null;
  tenantSlug: string | null;
  tenantId: string | null;
  tenantName: string | null;
  email: string | null;
  name: string | null;
}

interface SecurityViolation {
  userId: string | null;
  userTenantId: string | null;
  attemptedTenantId: string | null;
  attemptedTenantSlug: string | null;
}

export default function ForbiddenPage() {
  const [dict, setDict] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<UserInfo>({
    userId: null,
    tenantSlug: null,
    tenantId: null,
    tenantName: null,
    email: null,
    name: null,
  });
  const [securityViolation, setSecurityViolation] = useState<SecurityViolation | null>(null);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const router = useRouter();
  const currentTenant = params?.tenant as string;

  useEffect(() => {
    async function loadData() {
      try {
        const [dictData, profileData] = await Promise.all([
          getDictionaryClient('en'),
          fetch('/api/auth/profile', { credentials: 'include' }).then(res => res.json()),
        ]);
        
        setDict(dictData);
        
        if (profileData.success && profileData.user) {
          setUserInfo({
            userId: profileData.user._id || null,
            tenantSlug: profileData.user.tenantSlug || null,
            tenantId: profileData.user.tenantId || null,
            tenantName: profileData.user.tenantName || null,
            email: profileData.user.email || null,
            name: profileData.user.name || null,
          });
          
          // Get attempted tenant ID from API
          // NOTE: We don't use handleApiResponse here to prevent redirect loops
          // The /api/tenants/[slug] route doesn't check tenant access, so it should work
          if (currentTenant) {
            try {
              const tenantRes = await fetch(`/api/tenants/${currentTenant}`, { credentials: 'include' });
              // Don't redirect on 403 here - we're already on the forbidden page
              if (tenantRes.ok) {
                const tenantData = await tenantRes.json();
                
                if (tenantData.success && tenantData.data) {
                  setSecurityViolation({
                    userId: profileData.user._id || null,
                    userTenantId: profileData.user.tenantId || null,
                    attemptedTenantId: tenantData.data._id || null,
                    attemptedTenantSlug: currentTenant,
                  });
                }
              } else {
                // If we can't fetch tenant info, that's okay - we'll just show what we have
                console.warn('Could not fetch tenant info for forbidden page');
              }
            } catch (error) {
              console.error('Error fetching attempted tenant:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error loading forbidden page data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [currentTenant]);

  const goToOwnStore = () => {
    if (userInfo.tenantSlug) {
      router.push(`/${userInfo.tenantSlug}/en`);
    } else {
      router.push('/default/en');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-xl p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="h-12 w-12 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          {dict?.forbidden?.title || dict?.common?.accessDenied || 'Access Denied'}
        </h1>
        
        <p className="text-gray-600 mb-6 text-lg">
          {dict?.forbidden?.message || 
            "You don't have permission to access this store."}
        </p>

        {/* User Info */}
        {userInfo.name && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-blue-800 font-medium mb-2">
              {dict?.forbidden?.yourAccount || 'Your Account'}:
            </p>
            <p className="text-sm text-blue-700">{userInfo.name}</p>
            {userInfo.email && (
              <p className="text-xs text-blue-600 mt-1">{userInfo.email}</p>
            )}
          </div>
        )}

        {/* Tenant Comparison */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 mb-1">
                {dict?.forbidden?.yourStore || 'Your Store'}:
              </p>
              <p className="font-semibold text-gray-900">
                {userInfo.tenantSlug || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">
                {dict?.forbidden?.attemptedAccess || 'Attempted Access'}:
              </p>
              <p className="font-semibold text-red-600">
                {currentTenant || 'Unknown'}
              </p>
            </div>
          </div>
        </div>

        {/* Security Violation Details */}
        {securityViolation && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800 font-semibold mb-2">
              {dict?.forbidden?.securityViolation || 'Security Violation Detected'}:
            </p>
            <div className="text-xs text-red-700 space-y-1 font-mono bg-red-100 p-3 rounded border border-red-300">
              <p className="mb-2">
                <span className="font-semibold">Security:</span> User {securityViolation.userId || 'Unknown'} from tenant {securityViolation.userTenantId || 'Unknown'} attempted to access tenant {securityViolation.attemptedTenantId || 'Unknown'}
              </p>
              <div className="pt-2 border-t border-red-300 space-y-1">
                <p>
                  <span className="font-semibold">User ID:</span> {securityViolation.userId || 'Unknown'}
                </p>
                <p>
                  <span className="font-semibold">Your Tenant ID:</span> {securityViolation.userTenantId || 'Unknown'}
                </p>
                <p>
                  <span className="font-semibold">Attempted Tenant ID:</span> {securityViolation.attemptedTenantId || 'Unknown'}
                </p>
                {securityViolation.attemptedTenantSlug && (
                  <p>
                    <span className="font-semibold">Attempted Tenant Slug:</span> {securityViolation.attemptedTenantSlug}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-red-600 mt-2">
              This security violation has been logged for audit purposes.
            </p>
          </div>
        )}

        {/* Security Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>{dict?.forbidden?.securityNotice || 'Security Notice: This access attempt has been logged for security purposes.'}</strong>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {userInfo.tenantSlug && (
            <button
              onClick={goToOwnStore}
              className="block w-full bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 font-medium transition-colors shadow-md hover:shadow-lg"
            >
              {dict?.forbidden?.goToMyStore || `Go to My Store (${userInfo.tenantSlug})`}
            </button>
          )}
          
          <Link
            href="/default/en"
            className="block w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-200 font-medium transition-colors"
          >
            {dict?.forbidden?.goToDefaultStore || 'Go to Default Store'}
          </Link>
          
          <button
            onClick={() => router.back()}
            className="block w-full text-gray-500 px-4 py-2 rounded-md hover:text-gray-700 font-medium transition-colors text-sm"
          >
            {dict?.forbidden?.goBack || 'Go Back'}
          </button>
        </div>

        {/* Help Text */}
        <p className="mt-6 text-xs text-gray-500">
          {dict?.forbidden?.contactAdmin || 'If you believe this is an error, please contact your administrator.'}
        </p>
      </div>
    </div>
  );
}
