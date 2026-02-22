'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TenantAccessCheck {
  isValid: boolean;
  loading: boolean;
  error: string | null;
  userTenantSlug: string | null;
  requestedTenantSlug: string | null;
}

/**
 * Hook to check if the current user has access to the requested tenant
 * This runs on the client side to catch tenant access violations
 */
export function useTenantAccess(): TenantAccessCheck {
  const params = useParams();
  const router = useRouter();
  const requestedTenant = params?.tenant as string;
  
  const [isValid, setIsValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userTenantSlug, setUserTenantSlug] = useState<string | null>(null);

  useEffect(() => {
    async function checkTenantAccess() {
      if (!requestedTenant) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Get user's profile to check their tenant
        const res = await fetch('/api/auth/profile', { credentials: 'include' });
        const data = await res.json();
        
        if (res.status === 401) {
          // User not authenticated - let ProtectedRoute handle it
          setIsValid(true);
          setLoading(false);
          return;
        }
        
        if (data.success && data.user) {
          const userTenant = data.user.tenantSlug;
          setUserTenantSlug(userTenant);
          
          // Check if user's tenant matches requested tenant
          if (userTenant && userTenant !== requestedTenant) {
            // Tenant mismatch - redirect to forbidden page
            setIsValid(false);
            setError('You do not have access to this store');
            router.push(`/${requestedTenant}/forbidden`);
          } else {
            setIsValid(true);
          }
        } else {
          // Couldn't get user info - assume valid for now
          setIsValid(true);
        }
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        console.error('Error checking tenant access:', err);
        // On error, assume valid to avoid blocking legitimate access
        setIsValid(true);
      } finally {
        setLoading(false);
      }
    }

    checkTenantAccess();
  }, [requestedTenant, router]);

  return {
    isValid,
    loading,
    error,
    userTenantSlug,
    requestedTenantSlug: requestedTenant || null,
  };
}
