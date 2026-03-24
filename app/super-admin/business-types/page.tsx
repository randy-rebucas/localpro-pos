'use client';

import { useEffect, useState } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';

interface BusinessTypeConfig {
  type: string;
  name: string;
  description: string;
  defaultFeatures: Record<string, boolean>;
  productTypes: string[];
}

const FEATURE_LABELS: Record<string, string> = {
  enableInventory: 'Inventory',
  enableCategories: 'Categories',
  enableDiscounts: 'Discounts',
  enableLoyaltyProgram: 'Loyalty Program',
  enableCustomerManagement: 'Customer Management',
  enableBookingScheduling: 'Booking & Scheduling',
};

export default function BusinessTypesPage() {
  const [types, setTypes] = useState<BusinessTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/business-types')
      .then(res => res.json())
      .then(data => {
        if (data.success) setTypes(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SuperAdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Business Types</h1>
          <p className="text-sm text-gray-500 mt-1">
            Industry-specific configurations available to tenants during onboarding.
            Business types are defined in <code className="text-xs bg-gray-100 px-1 py-0.5">lib/business-types.ts</code>.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-4 mb-6 text-sm text-blue-800">
          <strong>Note:</strong> Business type definitions are code-configured. To add a new vertical, update{' '}
          <code className="text-xs bg-blue-100 px-1">lib/business-types.ts</code> and deploy.
          This page is a reference view of the current configuration.
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map(bt => (
              <div key={bt.type} className="bg-white border border-gray-200">
                <button
                  className="w-full text-left p-5"
                  onClick={() => setExpanded(expanded === bt.type ? null : bt.type)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{bt.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{bt.description}</p>
                    </div>
                    <span className="text-gray-400 text-xs shrink-0 mt-0.5">
                      {expanded === bt.type ? '▲' : '▼'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {bt.productTypes.map(pt => (
                      <span key={pt} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 border border-gray-200 capitalize">
                        {pt}
                      </span>
                    ))}
                  </div>
                </button>

                {expanded === bt.type && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Default Features</p>
                    <div className="space-y-1.5">
                      {Object.entries(bt.defaultFeatures).map(([key, enabled]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className="text-xs text-gray-600">{FEATURE_LABELS[key] || key}</span>
                          <span className={`ml-auto text-xs font-medium ${enabled ? 'text-green-600' : 'text-gray-400'}`}>
                            {enabled ? 'On' : 'Off'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SuperAdminShell>
  );
}
