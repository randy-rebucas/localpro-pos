'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  if (requiredRoles.length > 0 && !hasRole(requiredRoles)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">
            You don't have permission to access this page. Required role: {requiredRoles.join(' or ')}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

