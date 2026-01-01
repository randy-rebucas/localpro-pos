'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PageTitle from '@/components/PageTitle';
import LowStockAlerts from '@/components/LowStockAlerts';
import RealTimeStockTracker from '@/components/RealTimeStockTracker';
import { getDictionaryClient } from '../dictionaries-client';

interface Branch {
  _id: string;
  name: string;
  code?: string;
}

export default function InventoryPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBranches();
  }, [tenant]);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/branches?tenant=${tenant}&isActive=true`);
      const data = await res.json();
      if (data.success) {
        setBranches(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStockUpdate = (update: any) => {
    // Handle real-time stock updates
    // Stock updates are handled by the RealTimeStockTracker component
  };

  if (!dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <PageTitle />
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            {dict?.inventory?.title || 'Inventory Management'}
          </h1>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">
                {dict?.inventory?.branch || 'Branch'}:
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="block w-48 border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white"
              >
                <option value="">{dict?.inventory?.allBranches || 'All Branches'}</option>
                {branches.map((branch) => (
                  <option key={branch._id} value={branch._id}>
                    {branch.name} {branch.code && `(${branch.code})`}
                  </option>
                ))}
              </select>
            </div>
            <RealTimeStockTracker
              branchId={selectedBranch || undefined}
              onStockUpdate={handleStockUpdate}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2">
            <LowStockAlerts
              autoRefresh={true}
              refreshInterval={30000}
              onProductClick={(productId) => {
                // Navigate to product edit page
                window.location.href = `/${tenant}/${lang}/products?edit=${productId}`;
              }}
            />
          </div>
        </div>

        <div className="mt-8 bg-white border border-gray-300 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {dict?.inventory?.features || 'Inventory Features'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 border border-gray-300">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ {dict?.inventory?.realtimeTracking || 'Real-time Stock Tracking'}
              </h3>
              <p className="text-sm text-gray-600">
                {dict?.inventory?.realtimeTrackingDesc || 'Monitor stock levels in real-time across all branches'}
              </p>
            </div>
            <div className="p-4 border border-gray-300">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ {dict?.inventory?.lowStockAlerts || 'Low Stock Alerts'}
              </h3>
              <p className="text-sm text-gray-600">
                {dict?.inventory?.lowStockAlertsDesc || 'Get notified when products fall below threshold'}
              </p>
            </div>
            <div className="p-4 border border-gray-300">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ {dict?.inventory?.autoDecrement || 'Auto-decrement on Sale'}
              </h3>
              <p className="text-sm text-gray-600">
                {dict?.inventory?.autoDecrementDesc || 'Stock automatically decreases when items are sold'}
              </p>
            </div>
            <div className="p-4 border border-gray-300">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ {dict?.inventory?.multiBranch || 'Multi-branch Monitoring'}
              </h3>
              <p className="text-sm text-gray-600">
                {dict?.inventory?.multiBranchDesc || 'Track inventory across multiple locations'}
              </p>
            </div>
            <div className="p-4 border border-gray-300">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ {dict?.inventory?.itemVariations || 'Item Variations'}
              </h3>
              <p className="text-sm text-gray-600">
                {dict?.inventory?.itemVariationsDesc || 'Support for size, color, and type variations'}
              </p>
            </div>
            <div className="p-4 border border-gray-300">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ {dict?.inventory?.bundledProducts || 'Bundled Products'}
              </h3>
              <p className="text-sm text-gray-600">
                {dict?.inventory?.bundledProductsDesc || 'Create service + materials packages'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

