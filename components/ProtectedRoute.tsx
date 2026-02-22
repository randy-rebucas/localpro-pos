'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  redirectTo?: string;
}

export default function ProtectedRoute({ 
  children, 
  requiredRoles = [],
  redirectTo 
}: ProtectedRouteProps) {
  const { isAuthenticated, user, loading, hasRole } = useAuth();
  const router = useRouter();
  const params = useParams();
  const tenant = (params?.tenant as string) || 'default';
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        // Don't redirect if already on login page
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/login')) {
          router.push(redirectTo || `/${tenant}/${lang}/login`);
        }
      } else if (requiredRoles.length > 0 && !hasRole(requiredRoles)) {
        router.push(`/${tenant}/${lang}`);
      }
    }
  }, [isAuthenticated, loading, user, requiredRoles, hasRole, router, tenant, lang, redirectTo]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.components?.protectedRoute?.loading || dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  if (requiredRoles.length > 0 && !hasRole(requiredRoles)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{dict?.components?.protectedRoute?.accessDenied || 'Access Denied'}</h1>
          <p className="text-gray-600 mb-4">
            {(dict?.components?.protectedRoute?.noPermission || 'You don\'t have permission to access this page. Required role: {roles}').replace('{roles}', requiredRoles.join(' or '))}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

