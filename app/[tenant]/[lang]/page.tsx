'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from './dictionaries-client';

interface Stats {
  totalSales: number;
  totalTransactions: number;
  averageTransaction: number;
  paymentMethods: Array<{ _id: string; total: number; count: number }>;
}

export default function Dashboard() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [dict, setDict] = useState<any>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchStats();
  }, [period, tenant]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/transactions/stats?period=${period}&tenant=${tenant}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      {/* Mobile-first: Start with mobile padding, increase for larger screens */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6 lg:py-8">
        {/* Mobile-optimized header */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 lg:mb-6">
            {dict.dashboard.title}
          </h1>
          {/* Period buttons - Full width on mobile, inline on desktop */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
            {(['today', 'week', 'month', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-4 py-3 sm:px-5 sm:py-2.5 rounded-xl text-base sm:text-sm lg:text-base font-semibold transition-all duration-200 active:scale-95 ${
                  period === p
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 border-2 border-gray-200 active:bg-gray-50 shadow-sm'
                }`}
              >
                {dict.dashboard.periods[p]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow-md p-5 sm:p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded-lg w-24 mb-4"></div>
                <div className="h-10 bg-gray-200 rounded-lg w-32"></div>
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
            <div className="bg-white rounded-2xl shadow-md p-5 sm:p-6 active:scale-[0.98] transition-transform">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  {dict.dashboard.totalSales}
                </h3>
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900">
                ${stats.totalSales.toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 card-hover animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  {dict.dashboard.totalTransactions}
                </h3>
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900">
                {stats.totalTransactions}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-md p-6 card-hover animate-fade-in sm:col-span-2 md:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                  {dict.dashboard.averageTransaction}
                </h3>
                <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <p className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900">
                ${stats.averageTransaction.toFixed(2)}
              </p>
            </div>
          </div>
        ) : null}

        {stats && stats.paymentMethods.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6 sm:p-8 animate-fade-in">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">{dict.dashboard.paymentMethods}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {stats.paymentMethods.map((method, index) => (
                <div 
                  key={method._id} 
                  className="border-2 border-gray-100 rounded-xl p-5 card-hover transition-all"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide capitalize">
                      {method._id}
                    </h3>
                    <div className={`w-3 h-3 rounded-full ${
                      method._id === 'cash' ? 'bg-green-500' :
                      method._id === 'card' ? 'bg-blue-500' :
                      'bg-purple-500'
                    }`}></div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                    ${method.total.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {method.count} {dict.dashboard.transactions}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

