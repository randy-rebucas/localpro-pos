'use client';

import { useEffect } from 'react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useRouter, useParams } from 'next/navigation';
import { useTenantAccess } from '@/hooks/useTenantAccess';

interface TenantAccessGuardProps {
  children: React.ReactNode;
}

/**
 * Client-side component that guards against tenant access violations
 * This runs before the page renders to catch unauthorized tenant access
 */
export default function TenantAccessGuard({ children }: TenantAccessGuardProps) {
  const router = useRouter(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const params = useParams(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const { isValid, loading, userTenantSlug, requestedTenantSlug } = useTenantAccess(); // eslint-disable-line @typescript-eslint/no-unused-vars

  // If tenant access is invalid, the hook will redirect to forbidden page
  // We just need to show loading state while checking
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  // If access is invalid, don't render children (redirect is happening)
  if (!isValid) {
    return null;
  }

  return <>{children}</>;
}
