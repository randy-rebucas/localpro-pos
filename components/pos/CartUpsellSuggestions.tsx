'use client';

import Currency from '@/components/Currency';
import type { UpsellProduct } from '@/hooks/useUpsell';
import type { TranslationDict } from '@/types/dictionary';

interface CartUpsellSuggestionsProps {
  suggestions: UpsellProduct[];
  primaryColor: string;
  dict: TranslationDict;
  onAdd: (productId: string) => void;
}

export default function CartUpsellSuggestions({
  suggestions,
  primaryColor,
  dict,
  onAdd,
}: CartUpsellSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="border-t border-gray-200 pt-3 pb-1 mt-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {dict.pos?.upsellTitle || 'Often bought together'}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {suggestions.map((s) => (
          <button
            key={s.productId}
            type="button"
            onClick={() => onAdd(s.productId)}
            className="flex-shrink-0 w-20 text-left border border-gray-200 hover:border-gray-400 bg-white p-1.5 transition-colors group min-h-[44px]"
            aria-label={`${dict.common?.add || 'Add'} ${s.name}`}
          >
            <div className="w-full h-12 bg-gray-100 overflow-hidden mb-1">
              {s.image ? (
                <img // eslint-disable-line
                  src={s.image}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-[10px] font-medium text-gray-700 line-clamp-2 leading-tight mb-0.5 group-hover:text-gray-900">{s.name}</p>
            <p className="text-[10px] font-bold" style={{ color: primaryColor }}>
              <Currency amount={s.price} />
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
