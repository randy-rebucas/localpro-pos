'use client';

import Currency from '@/components/Currency';
import type { PosProduct } from '@/hooks/usePosProducts';

export interface ProductCardLabels {
  out: string;
  options: string;
  variants: string;
  pin: string;
  unpin: string;
}

interface ProductCardProps {
  product: PosProduct;
  inCartQty: number;
  availableStock: number;
  canAdd: boolean;
  primaryColor: string;
  businessType: string;
  cardHeightClass: string;
  addLabel: string;
  labels: ProductCardLabels;
  variant?: 'grid' | 'list';
  onAdd: (product: PosProduct) => void;
  onTogglePin: (productId: string, pinned: boolean) => void;
}

interface PinButtonProps {
  pinned: boolean;
  variant: 'grid' | 'list';
  label: string;
  onToggle: () => void;
}

function PinButton({ pinned, variant, label, onToggle }: PinButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle();
  };

  const placementClass =
    variant === 'grid'
      ? `absolute top-2 right-2 z-30 ${
          pinned
            ? 'opacity-100'
            : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100'
        }`
      : 'absolute right-2 top-1/2 -translate-y-1/2 z-30';

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-pressed={pinned}
      title={label}
      aria-label={label}
      className={`${placementClass} flex h-11 w-11 items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${
        pinned
          ? 'border-ink bg-ink text-paper-white hover:bg-brand-navy'
          : 'border-ink/25 bg-paper-white text-ink/60 hover:border-ink hover:text-ink'
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
  labels,
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

  const stockBadgeTone = availableStock === 0 ? 'bg-stamp text-paper-white' : 'bg-paper-white text-ink border border-ink';

  const handleTogglePin = () => onTogglePin(product._id, isPinned);

  if (variant === 'list') {
    return (
      <div
        className={`relative flex items-center gap-3 border-b border-dashed border-ink/25 hover:bg-paper transition-colors group min-h-[72px] pl-3 pr-14 py-2 ${
          isPinned ? 'border-l-4 border-l-brand bg-brand-soft' : ''
        } ${!canAdd ? 'opacity-60' : ''}`}
      >
        <div className="relative w-14 h-14 flex-shrink-0 bg-paper overflow-hidden">
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
              <svg className="w-6 h-6 text-ink/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
          {isPinned && (
            <span className="absolute bottom-0 left-0 right-0 bg-ink text-paper-white font-receipt text-[9px] text-center py-0.5">
              PIN
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-receipt text-[11px] uppercase tracking-wide text-ink/60 truncate">{product.category || '\u00A0'}</p>
          <div className="flex items-baseline gap-2">
            <p className="font-semibold text-ink text-sm leading-tight truncate">{product.name}</p>
            <span className="mk-leader" aria-hidden />
            <div className="font-receipt font-semibold text-sm text-ink whitespace-nowrap text-right">
              <Currency amount={product.price} showConverted convertedClassName="block text-[10px] text-ink/60 font-normal" />
            </div>
          </div>
        </div>

        <div className="pointer-events-none z-10 flex shrink-0 items-center gap-2">
          {showStockBadge && (
            <span className={`font-receipt text-[10px] font-medium px-1.5 py-0.5 ${stockBadgeTone}`}>
              {availableStock === 0 ? labels.out : availableStock}
            </span>
          )}
          {inCartQty > 0 && (
            <span
              className="font-receipt text-[10px] font-medium px-1.5 py-0.5 text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {inCartQty}
            </span>
          )}
        </div>

        <PinButton pinned={isPinned} variant="list" label={isPinned ? labels.unpin : labels.pin} onToggle={handleTogglePin} />

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
      className={`relative overflow-hidden border bg-paper-white hover:border-ink transition-colors group ${cardHeightClass} ${
        isPinned ? 'border-2 border-ink' : 'border-ink/25'
      } ${!canAdd ? 'opacity-60' : ''}`}
    >
      {showStockBadge && (
        <div
          className={`pointer-events-none absolute top-2 left-2 z-20 min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center font-receipt text-[11px] font-medium ${stockBadgeTone}`}
        >
          {availableStock === 0 ? labels.out : availableStock}
        </div>
      )}

      {inCartQty > 0 && (
        <div
          className="pointer-events-none absolute top-2 right-14 z-20 min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center font-receipt text-[11px] font-medium text-white"
          style={{ backgroundColor: primaryColor }}
          aria-hidden
        >
          {inCartQty}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 w-full h-full bg-paper overflow-hidden">
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
            <svg className="w-10 h-10 text-ink/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
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

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 space-y-0.5 border-t border-dashed border-ink/30 bg-paper-white px-3 py-2">
        <p className="font-receipt text-[10px] uppercase tracking-wide text-ink/60 truncate">{product.category || '\u00A0'}</p>
        {(businessType === 'service' || businessType === 'laundry') && product.serviceType && (
          <p className="font-receipt text-[10px] text-ink/60 truncate leading-none">
            {product.serviceType.charAt(0).toUpperCase() +
              product.serviceType.slice(1).replace(/-/g, ' ')}
          </p>
        )}
        <p className="font-semibold text-ink text-sm leading-5 line-clamp-2">{product.name}</p>
        <div className="font-receipt font-semibold text-base leading-tight text-ink">
          <Currency
            amount={product.price}
            showConverted
            convertedClassName="block text-[10px] text-ink/60 font-normal leading-tight"
          />
        </div>
      </div>

      {businessType === 'restaurant' && product.modifiers?.length ? (
        <span className="pointer-events-none absolute top-10 left-2 z-20 font-receipt text-[9px] bg-ink text-paper-white px-1.5 py-0.5">
          {labels.options}
        </span>
      ) : null}
      {product.hasVariations && product.variations?.length ? (
        <span className="pointer-events-none absolute top-10 left-2 z-20 font-receipt text-[9px] bg-ink text-paper-white px-1.5 py-0.5">
          {labels.variants.replace('{count}', String(product.variations.length))}
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

      <PinButton pinned={isPinned} variant="grid" label={isPinned ? labels.unpin : labels.pin} onToggle={handleTogglePin} />
    </div>
  );
}
