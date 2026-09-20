'use client';

import { useEffect, useState } from 'react';

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
      <div className="space-y-4">
        <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
          <strong>Note:</strong> Business type definitions are code-configured. To add a new vertical, update{' '}
          <code className="text-xs bg-brand-soft px-1">lib/business-types.ts</code> and deploy.
          This page is a reference view of the current configuration.
        </div>

        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto">
              <span /><span /><span /><span /><span />
            </div>
            <p className="mt-3 text-gray-400 text-sm">Loading business types…</p>
          </div>
        ) : types.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">No business types configured.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map(bt => (
              <div key={bt.type} className="bg-white border border-gray-300">
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
                      <span key={pt} className="px-2 py-0.5 text-xs bg-gray-500 text-white capitalize">
                        {pt}
                      </span>
                    ))}
                  </div>
                </button>

                {expanded === bt.type && (
                  <div className="border-t border-gray-300 px-5 py-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Default Features</p>
                    <div className="space-y-1.5">
                      {Object.entries(bt.defaultFeatures).map(([key, enabled]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className={`w-2 h-2 shrink-0 ${enabled ? 'bg-win8-success' : 'bg-gray-300'}`} />
                          <span className="text-xs text-gray-600">{FEATURE_LABELS[key] || key}</span>
                          <span className={`ml-auto text-xs font-medium ${enabled ? 'text-win8-success' : 'text-gray-400'}`}>
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
  );
}
