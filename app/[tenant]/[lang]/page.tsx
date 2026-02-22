'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import PageTitle from '@/components/PageTitle';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from './dictionaries-client';
import { handleApiResponse } from '@/lib/api-client';

// Dynamically import chart to avoid SSR issues with Recharts
const SalesChart = dynamic(() => import('@/components/SalesChart'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 sm:h-80 lg:h-96 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading chart...</p>
      </div>
    </div>
  ),
});

interface ChartDataPoint {
  date: string;
  sales: number;
  transactions: number;
}

interface Stats {
  totalSales: number;
  totalTransactions: number;
  averageTransaction: number;
  totalExpenses: number;
  expenseCount: number;
  paymentMethods: Array<{ _id: string; total: number; count: number }>;
  chartData: ChartDataPoint[];
}

export default function Dashboard() {
  const params = useParams();
  const router = useRouter(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es' | 'forbidden';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('today');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  
  // If lang is "forbidden", this route was incorrectly matched
  // Redirect to the forbidden page using hard redirect to prevent loops
  useEffect(() => {
    if (lang === 'forbidden' && typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const targetPath = `/${tenant}/forbidden`;
      // Only redirect if we're not already on the forbidden page
      if (!currentPath.includes('/forbidden') && currentPath !== targetPath) {
        // Use hard redirect to prevent Next.js from matching the route again
        window.location.href = targetPath;
      }
    }
  }, [lang, tenant]);

  useEffect(() => {
    const safeLang = lang === 'forbidden' ? 'en' : lang;
    getDictionaryClient(safeLang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, tenant]);
  
  // Don't render if lang is "forbidden" (will redirect)
  if (lang === 'forbidden') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  const fetchStats = async () => {
    // Don't fetch if we're already on the forbidden page
    if (typeof window !== 'undefined' && window.location.pathname.includes('/forbidden')) {
      return;
    }
    
    try {
      setLoading(true);
      const res = await fetch(`/api/transactions/stats?period=${period}&tenant=${tenant}`);
      
      // Handle API response (automatically redirects on 403)
      const data = await handleApiResponse(res, {
        defaultRedirect: `/${tenant}/forbidden`
      });
      
      if (data.success && data.data) {
        // Ensure chartData is properly formatted with numeric values
        const processedChartData = (data.data.chartData || []).map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const salesValue = typeof item.sales === 'number' ? item.sales : parseFloat(String(item.sales)) || 0;
          const transactionsValue = typeof item.transactions === 'number' ? item.transactions : parseInt(String(item.transactions)) || 0;
          return {
            date: item.date || '',
            sales: salesValue,
            transactions: transactionsValue,
          };
        });
        
        const processedData = {
          ...data.data,
          chartData: processedChartData,
        };
        
        setStats(processedData);
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
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTitle />
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">
            {dict.dashboard.title}
          </h1>
          {/* Period buttons - Full width on mobile, inline on desktop */}
          <div className="flex flex-wrap gap-0">
            {(['today', 'week', 'month', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-4 py-2.5 sm:px-5 text-sm sm:text-base font-semibold transition-all duration-200 border border-gray-300 border-r-0 last:border-r ${
                  period === p
                    ? 'text-white bg-blue-600'
                    : 'bg-white text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                }`}
              >
                {dict.dashboard.periods[p]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-gray-300 p-5 sm:p-6 animate-pulse">
                <div className="h-4 bg-gray-200 w-24 mb-4"></div>
                <div className="h-10 bg-gray-200 w-32"></div>
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-white border border-gray-300 p-5 sm:p-6 card-hover animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  {dict.dashboard.totalSales}
                </h3>
                <div className="p-2 bg-green-100 border border-green-300">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900">
                <Currency amount={stats.totalSales} />
              </p>
            </div>
            <div className="bg-white border border-gray-300 p-5 sm:p-6 card-hover animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  {dict.dashboard.totalTransactions}
                </h3>
                <div className="p-2 bg-blue-100 border border-blue-300">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900">
                {stats.totalTransactions}
              </p>
            </div>
            <div className="bg-white border border-gray-300 p-5 sm:p-6 card-hover animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  {dict.dashboard.averageTransaction}
                </h3>
                <div className="p-2 bg-purple-100 border border-purple-300">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900">
                <Currency amount={stats.averageTransaction} />
              </p>
            </div>
            <div className="bg-white border border-gray-300 p-5 sm:p-6 card-hover animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  {dict.dashboard?.totalExpenses || 'Total Expenses'}
                </h3>
                <div className="p-2 bg-red-100 border border-red-300">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900">
                <Currency amount={stats.totalExpenses || 0} />
              </p>
              {stats.expenseCount > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  {stats.expenseCount} {stats.expenseCount === 1 ? (dict.dashboard?.expense || 'expense') : (dict.dashboard?.expenses || 'expenses')}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {stats && (
          <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8 mb-6 sm:mb-8 animate-fade-in">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-5 sm:mb-6">
              {dict.dashboard.salesTrend || 'Sales Trend'}
            </h2>
            {stats.chartData && stats.chartData.length > 0 ? (
              <SalesChart data={stats.chartData} dict={dict} />
            ) : (
              <div className="w-full h-64 sm:h-80 lg:h-96 flex items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-gray-500 text-lg">{dict?.dashboard?.noChartData || 'No sales data available for the selected period'}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {stats && stats.paymentMethods.length > 0 && (
          <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:p-8 animate-fade-in">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-5 sm:mb-6">{dict.dashboard.paymentMethods}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {stats.paymentMethods.map((method, index) => (
                <div 
                  key={method._id} 
                  className="bg-gray-50 border border-gray-300 p-5 card-hover transition-all"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wide capitalize">
                      {method._id}
                    </h3>
                    <div className={`w-3 h-3 border border-gray-400 ${
                      method._id === 'cash' ? 'bg-green-500' :
                      method._id === 'card' ? 'bg-blue-500' :
                      'bg-purple-500'
                    }`}></div>
                  </div>
                  <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                    <Currency amount={method.total} />
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

