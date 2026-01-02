'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PageTitle from '@/components/PageTitle';
import LowStockAlerts from '@/components/LowStockAlerts';
import RealTimeStockTracker from '@/components/RealTimeStockTracker';
import { getDictionaryClient } from '../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType, supportsFeature } from '@/lib/business-type-helpers';

interface Branch {
  _id: string;
  name: string;
  code?: string;
}

export default function InventoryPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const [dict, setDict] = useState<any>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  
  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

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
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // If inventory is not enabled for this business type, show message
  if (!inventoryEnabled) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <PageTitle />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              {dict?.inventory?.title || 'Inventory Management'}
            </h1>
          </div>
          <div className="bg-yellow-50 border-2 border-yellow-300 p-6 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  Inventory Management Not Available
                </h3>
                <p className="text-yellow-800">
                  Inventory management is not enabled for {businessTypeConfig?.name || 'your business type'}. 
                  This feature is typically used for retail businesses that need to track physical stock.
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  If you need inventory management, please update your business type in Settings.
                </p>
              </div>
            </div>
          </div>
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

