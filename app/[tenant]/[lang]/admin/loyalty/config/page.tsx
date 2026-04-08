'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function LoyaltyConfigPage() {
  const router = useRouter();
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;

  useEffect(() => {
    // Redirect to main loyalty page - the config functionality is there
    router.push(`/${tenant}/${lang}/admin/loyalty`);
  }, [router, tenant, lang]);

  return (
    <div className="bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}
