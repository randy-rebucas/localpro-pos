'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { getFeatureFlagLabel } from '@/lib/feature-flags-helpers';

interface BusinessTypeConfig {
  type: string;
  name: string;
  description: string;
  defaultFeatures: Record<string, boolean>;
  productTypes: string[];
}


export default function BusinessTypesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [types, setTypes] = useState<BusinessTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { settings: tenantSettings } = useTenantSettings();

  const currentBusinessType = tenantSettings
    ? getBusinessType(tenantSettings)
    : null;
  const currentBusinessTypeConfig = currentBusinessType
    ? getBusinessTypeConfig(currentBusinessType)
    : null;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetch('/api/business-types')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTypes(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!dict || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {dict?.admin?.businessTypes || 'Business Types'}
          </h1>
          <p className="text-gray-600">
            {dict?.admin?.businessTypesDescription || 'Browse and manage business type templates'}
          </p>
        </div>

        {/* Current Business Type Section */}
        {currentBusinessTypeConfig && (
          <div className="bg-brand-soft border-2 border-teal-300 p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-brand-navy-deep mb-2">
                  {dict?.admin?.currentBusinessType || 'Your Business Type'}
                </h2>
                <p className="text-brand-navy mb-4">{currentBusinessTypeConfig.name}</p>
                <p className="text-sm text-brand-hover mb-4">{currentBusinessTypeConfig.description}</p>
                <div className="flex flex-wrap gap-2">
                  {currentBusinessTypeConfig.productTypes.map(pt => (
                    <span
                      key={pt}
                      className="px-3 py-1 text-xs font-medium bg-brand-soft text-brand-navy border border-teal-300 capitalize"
                    >
                      {pt}
                    </span>
                  ))}
                </div>
                {currentBusinessTypeConfig.defaultFeatures && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-brand-navy-deep mb-2">
                      {dict?.admin?.enabledFeatures || 'Enabled Features'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(currentBusinessTypeConfig.defaultFeatures).map(([key, enabled]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className={enabled ? 'text-lg' : 'text-lg opacity-40'}>
                            {enabled ? '✓' : '✗'}
                          </span>
                          <span className={`text-sm ${enabled ? 'text-brand-navy-deep' : 'text-brand'}`}>
                            {getFeatureFlagLabel(key, dict)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* All Business Types Reference */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {dict?.admin?.allBusinessTypes || 'All Available Business Types'}
          </h2>
          <p className="text-gray-600 text-sm mb-4">
            {dict?.admin?.businessTypesReferenceDescription ||
              'Reference guide for all available business type templates'}
          </p>
        </div>

        {types.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {dict?.common?.noData || 'No business types available'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map(bt => (
              <div key={bt.type} className="bg-white border border-gray-300">
                <button
                  className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
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
                      <span
                        key={pt}
                        className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 border border-gray-200 capitalize"
                      >
                        {pt}
                      </span>
                    ))}
                  </div>
                </button>

                {expanded === bt.type && (
                  <div className="border-t border-gray-300 p-5 bg-gray-50">
                    <h4 className="text-xs font-bold text-gray-900 uppercase mb-3">
                      {dict?.admin?.features || 'Features'}
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(bt.defaultFeatures).map(([key, enabled]) => (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className={enabled ? 'text-green-600 font-bold' : 'text-gray-400'}>
                            {enabled ? '✓' : '✗'}
                          </span>
                          <span className={enabled ? 'text-gray-900' : 'text-gray-500'}>
                            {getFeatureFlagLabel(key, dict)}
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
    </div>
  );
}
