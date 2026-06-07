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
  variant?: 'grid' | 'list';
  onAdd: (product: PosProduct) => void;
  onTogglePin: (productId: string, pinned: boolean) => void;
}

interface PinButtonProps {
  pinned: boolean;
  variant: 'grid' | 'list';
  onToggle: () => void;
}

function PinButton({ pinned, variant, onToggle }: PinButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle();
  };

  const placementClass =
    variant === 'grid'
      ? `absolute top-2 right-2 z-30 shadow-md ${
          pinned
            ? 'opacity-100'
            : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100'
        }`
      : 'absolute right-2 top-1/2 -translate-y-1/2 z-30 shadow-sm';

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-pressed={pinned}
      title={pinned ? 'Unpin product' : 'Pin product'}
      aria-label={pinned ? 'Unpin product' : 'Pin product'}
      className={`${placementClass} flex h-11 w-11 items-center justify-center border-2 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
        pinned
          ? 'border-amber-400 bg-amber-500 text-white hover:bg-amber-600'
          : 'border-white/80 bg-white/90 text-gray-500 hover:border-gray-300 hover:bg-white hover:text-gray-700 backdrop-blur-sm'
      }`}
    >
      <svg
        className="h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={pinned ? 0 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {pinned ? (
          <path d="M16 9V4h1V2H7v2h1v5l-2 2v2h5.2V22h1.6v-6.8H18v-2l-2-2z" />
        ) : (
          <path d="M12 17v5M9 3h6l1 7h4l-3 3v4H7v-4L4 10h4l1-7z" />
        )}
      </svg>
    </button>
  );
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
  variant = 'grid',
  onAdd,
  onTogglePin,
}: ProductCardProps) {
  const isPinned = Boolean(product.pinned);
  const showStockBadge =
    businessType !== 'restaurant' &&
    businessType !== 'service' &&
    businessType !== 'laundry' &&
    availableStock <= 10;

  const handleTogglePin = () => onTogglePin(product._id, isPinned);

  if (variant === 'list') {
    return (
      <div
        className={`relative flex items-center gap-3 border bg-white hover:border-gray-400 transition-all duration-200 group min-h-[72px] px-3 py-2 ${
          isPinned ? 'border-amber-300 bg-amber-50/40' : 'border-gray-300'
        } ${!canAdd ? 'opacity-60' : ''}`}
      >
        <div className="relative w-14 h-14 flex-shrink-0 bg-gray-50 border border-gray-200 overflow-hidden">
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
              <svg className="w-6 h-6 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
          {isPinned && (
            <span className="absolute bottom-0 left-0 right-0 bg-amber-500 text-white text-[9px] font-bold text-center py-0.5">
              PIN
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 pr-14">
          <p className="text-[11px] text-gray-500 truncate">{product.category || '\u00A0'}</p>
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{product.name}</p>
          <div className="font-bold text-sm mt-0.5" style={{ color: primaryColor }}>
            <Currency amount={product.price} showConverted convertedClassName="text-[10px] text-gray-500 font-normal" />
          </div>
        </div>

        <div className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2">
          {showStockBadge && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 text-white ${availableStock === 0 ? 'bg-red-500' : 'bg-yellow-500'}`}>
              {availableStock === 0 ? 'OUT' : availableStock}
            </span>
          )}
          {inCartQty > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {inCartQty}
            </span>
          )}
        </div>

        <PinButton pinned={isPinned} variant="list" onToggle={handleTogglePin} />

        <button
          type="button"
          disabled={!canAdd}
          onClick={() => {
            if (canAdd) onAdd(product);
          }}
          className={`absolute inset-0 z-[5] w-full h-full border-0 bg-transparent p-0 text-left cursor-pointer ${!canAdd ? 'cursor-not-allowed' : ''}`}
          aria-label={`${addLabel} ${product.name}`}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden border hover:border-gray-400 transition-all duration-200 group ${cardHeightClass} hover:shadow-lg ${
        isPinned ? 'border-amber-400 ring-2 ring-amber-300/60' : 'border-gray-300'
      } ${!canAdd ? 'opacity-60' : ''}`}
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
          className="pointer-events-none absolute top-2 right-14 z-20 min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center text-[11px] font-bold text-white shadow-md"
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

      <PinButton pinned={isPinned} variant="grid" onToggle={handleTogglePin} />
    </div>
  );
}
