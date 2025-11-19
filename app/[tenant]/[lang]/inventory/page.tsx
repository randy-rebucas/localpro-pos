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
    console.log('Stock update received:', update);
    // You can update UI here, show notifications, etc.
  };

  if (!dict) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <PageTitle title="Inventory Management" />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">
                Branch:
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">All Branches</option>
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

        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Inventory Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ Real-time Stock Tracking
              </h3>
              <p className="text-sm text-gray-600">
                Monitor stock levels in real-time across all branches
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ Low Stock Alerts
              </h3>
              <p className="text-sm text-gray-600">
                Get notified when products fall below threshold
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ Auto-decrement on Sale
              </h3>
              <p className="text-sm text-gray-600">
                Stock automatically decreases when items are sold
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ Multi-branch Monitoring
              </h3>
              <p className="text-sm text-gray-600">
                Track inventory across multiple locations
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ Item Variations
              </h3>
              <p className="text-sm text-gray-600">
                Support for size, color, and type variations
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">
                ✓ Bundled Products
              </h3>
              <p className="text-sm text-gray-600">
                Create service + materials packages
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

