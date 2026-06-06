'use client';

import Currency from '@/components/Currency';
import type { PosProduct } from '@/hooks/usePosProducts';

interface ProductCardProps {
  product: PosProduct;
  inCartQty: number;
  availableStock: number;
  canAdd: boolean;
  primaryColor: string;
  businessType: string;
  cardHeightClass: string;
  addLabel: string;
  onAdd: (product: PosProduct) => void;
  onTogglePin: (productId: string, pinned: boolean) => void;
}

export default function ProductCard({
  product,
  inCartQty,
  availableStock,
  canAdd,
  primaryColor,
  businessType,
  cardHeightClass,
  addLabel,
  onAdd,
  onTogglePin,
}: ProductCardProps) {
  const showStockBadge =
    businessType !== 'restaurant' &&
    businessType !== 'service' &&
    businessType !== 'laundry' &&
    availableStock <= 10;

  return (
    <div
      className={`relative overflow-hidden border border-gray-300 hover:border-gray-400 transition-all duration-200 group ${cardHeightClass} hover:shadow-lg ${!canAdd ? 'opacity-60' : ''}`}
    >
      {showStockBadge && (
        <div
          className={`pointer-events-none absolute top-2 left-2 z-20 min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center text-[11px] font-bold text-white shadow-md ${availableStock === 0 ? 'bg-red-500' : 'bg-yellow-500'}`}
        >
          {availableStock === 0 ? 'OUT' : availableStock}
        </div>
      )}

      {inCartQty > 0 && (
        <div
          className="pointer-events-none absolute top-2 right-12 z-20 min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center text-[11px] font-bold text-white shadow-md"
          style={{ backgroundColor: primaryColor }}
          aria-hidden
        >
          {inCartQty}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 w-full h-full bg-gray-50 overflow-hidden">
        {product.image &&
        (product.image.startsWith('http') ||
          product.image.startsWith('/') ||
          product.image.startsWith('data:image/')) ? (
          <img
            src={product.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
        )}
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-black/70 group-hover:bg-black/80 transition-colors duration-200 z-10"
        aria-hidden
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 z-10">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-gray-200 truncate h-4 opacity-90">{product.category || '\u00A0'}</p>
        </div>
        <div className="space-y-1">
          {(businessType === 'service' || businessType === 'laundry') && product.serviceType && (
            <p className="text-[10px] text-gray-300 truncate leading-none">
              {product.serviceType.charAt(0).toUpperCase() +
                product.serviceType.slice(1).replace(/-/g, ' ')}
            </p>
          )}
          <p className="font-semibold text-white text-sm leading-5 line-clamp-2">{product.name}</p>
          <div className="font-bold text-lg leading-tight text-white">
            <Currency
              amount={product.price}
              showConverted
              convertedClassName="block text-[10px] text-white/70 font-normal leading-tight"
            />
          </div>
        </div>
      </div>

      {businessType === 'restaurant' && product.modifiers?.length ? (
        <span className="pointer-events-none absolute bottom-10 left-2 z-20 text-[9px] bg-orange-500/90 text-white px-1.5 py-0.5 font-semibold">
          + options
        </span>
      ) : null}
      {product.hasVariations && product.variations?.length ? (
        <span className="pointer-events-none absolute bottom-10 left-2 z-20 text-[9px] bg-brand/90 text-white px-1.5 py-0.5 font-semibold">
          {product.variations.length} variants
        </span>
      ) : null}

      <button
        type="button"
        disabled={!canAdd}
        onClick={() => {
          if (canAdd) onAdd(product);
        }}
        className={`absolute inset-0 z-[15] w-full h-full border-0 bg-transparent p-0 text-left cursor-pointer ${!canAdd ? 'cursor-not-allowed' : ''}`}
        aria-label={`${addLabel} ${product.name}`}
      />

      <button
        type="button"
        onClick={() => onTogglePin(product._id, product.pinned || false)}
        className={`absolute top-2 right-2 z-30 p-2.5 transition-all duration-200 flex items-center justify-center border shadow-sm ${product.pinned ? 'bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-300' : 'bg-white/80 hover:bg-white text-gray-400 hover:text-gray-600 border-gray-300 backdrop-blur-sm'}`}
        title={product.pinned ? 'Unpin Product' : 'Pin Product'}
        aria-label={product.pinned ? 'Unpin product' : 'Pin product'}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12M8.5,12V4H15.5V12L17.5,14H14.3V20H9.7V14H6.5L8.5,12Z" />
        </svg>
      </button>
    </div>
  );
}
