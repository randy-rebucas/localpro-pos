'use client';

import { useParams, useRouter } from 'next/navigation';
import { XCircle } from 'lucide-react';

export default function PaymentCancelPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <XCircle className="h-16 w-16 mx-auto mb-4 text-red-600" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Cancelled</h1>
        <p className="text-gray-600 mb-6">Your payment was cancelled. No changes have been made to your subscription.</p>
        <button
          onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
          className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 font-medium"
        >
          Back to Subscription
        </button>
      </div>
    </div>
  );
}
