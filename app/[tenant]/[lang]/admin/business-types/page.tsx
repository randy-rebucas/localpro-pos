'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { getFeatureFlagLabel } from '@/lib/feature-flags-helpers';
import AdminPageHeader from '@/components/admin/AdminPageHeader';

interface BusinessTypeConfig {
  type: string;
  name: string;
  description: string;
  defaultFeatures: Record<string, boolean>;
  productTypes: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FeatureRow({ featureKey, enabled, dict }: { featureKey: string; enabled: boolean; dict: any }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 shrink-0 ${enabled ? 'bg-win8-success' : 'bg-gray-300'}`} aria-hidden="true" />
      <span className={`text-xs ${enabled ? 'text-gray-700' : 'text-gray-500'}`}>{getFeatureFlagLabel(featureKey, dict)}</span>
      <span className={`ml-auto text-xs font-medium ${enabled ? 'text-win8-success' : 'text-gray-400'}`}>
        {enabled ? dict?.admin?.featureOn || 'On' : dict?.admin?.featureOff || 'Off'}
      </span>
    </div>
  );
}

export default function BusinessTypesPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [types, setTypes] = useState<BusinessTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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

  const fetchTypes = useCallback(() => {
    fetch('/api/business-types')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTypes(data.data);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const retryTypes = () => {
    setLoading(true);
    setError(false);
    fetchTypes();
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict.admin?.businessTypes || 'Business Types'}
        description={dict.admin?.businessTypesDescription || 'Reference view of the business type templates and their default features'}
      />

      <div className="space-y-4">
        <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
          {dict.admin?.businessTypesCodeNote ||
            "Business type templates are code-configured. To change your store's features, go to Settings → Business Features."}
        </div>

        {/* Current Business Type Section */}
        {currentBusinessTypeConfig && (
          <section className="bg-white border border-gray-300">
            <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {dict.admin?.currentBusinessType || 'Your Business Type'}
                </p>
                <h2 className="text-base font-bold text-gray-900 mt-0.5">{currentBusinessTypeConfig.name}</h2>
                <p className="text-sm text-gray-500">{currentBusinessTypeConfig.description}</p>
              </div>
              <span className="px-2 py-0.5 text-xs font-semibold bg-brand text-white font-mono">
                {currentBusinessTypeConfig.type}
              </span>
            </div>
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {dict.admin?.productTypesLabel || 'Product Types'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {currentBusinessTypeConfig.productTypes.map(pt => (
                    <span key={pt} className="px-2 py-0.5 text-xs font-semibold bg-brand-navy text-white capitalize">
                      {pt}
                    </span>
                  ))}
                </div>
              </div>
              {currentBusinessTypeConfig.defaultFeatures && (
                <div className="lg:col-span-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {dict.admin?.enabledFeatures || 'Default Features'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6">
                    {Object.entries(currentBusinessTypeConfig.defaultFeatures).map(([key, enabled]) => (
                      <FeatureRow key={key} featureKey={key} enabled={enabled} dict={dict} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* All Business Types Reference */}
        <div>
          <h2 className="text-base font-bold text-gray-900">
            {dict.admin?.allBusinessTypes || 'All Available Business Types'}
          </h2>
          <p className="text-sm text-gray-500">
            {dict.admin?.businessTypesReferenceDescription ||
              'Reference guide for all available business type templates. Click a card to see its default features.'}
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
            <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingBusinessTypes || 'Loading business types…'}</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <p className="text-win8-danger text-sm font-medium">
              {dict.admin?.failedToLoadBusinessTypes || 'Failed to load business types.'}
            </p>
            <button
              onClick={retryTypes}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
            >
              {dict.common?.retry || 'Retry'}
            </button>
          </div>
        ) : types.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
            {dict.admin?.noBusinessTypes || 'No business types configured.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {types.map(bt => {
              const isOpen = expanded === bt.type;
              const isCurrent = bt.type === currentBusinessType;
              return (
                <div key={bt.type} className={`bg-white border ${isCurrent ? 'border-brand' : 'border-gray-300'}`}>
                  <button
                    className={`w-full text-left p-5 transition-colors ${isCurrent ? 'bg-brand-soft hover:bg-brand-soft' : 'hover:bg-gray-100'}`}
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : bt.type)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">{bt.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{bt.description}</p>
                      </div>
                      <span className="text-gray-400 text-xs shrink-0 mt-0.5" aria-hidden="true">
                        {isOpen ? '▲' : '▼'}
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

                  {isOpen && (
                    <div className="border-t border-gray-300 px-5 py-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {dict.admin?.enabledFeatures || 'Default Features'}
                      </p>
                      <div className="space-y-1.5">
                        {Object.entries(bt.defaultFeatures).map(([key, enabled]) => (
                          <FeatureRow key={key} featureKey={key} enabled={enabled} dict={dict} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
