'use client';

import { Package, Pin, PinOff } from 'lucide-react';
import Currency from '@/components/Currency';
import { cn } from '@/lib/utils';
import type { PosProduct } from '@/hooks/usePosProducts';

interface ProductCardProps {
  product: PosProduct;
  inCartQty: number;
  availableStock: number;
  canAdd: boolean;
  /** Kept for API compatibility — tiles use the brand gloss tokens. */
  primaryColor?: string;
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

function hasUsableImage(src?: string): src is string {
  return Boolean(src && (src.startsWith('http') || src.startsWith('/') || src.startsWith('data:image/')));
}

function PinButton({ pinned, variant, onToggle }: PinButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle();
  };

  // mk-key-* sets position: relative (unlayered), so the absolute placement lives on a wrapper.
  const placementClass =
    variant === 'grid'
      ? cn(
          'absolute top-1.5 right-1.5 z-30',
          !pinned &&
            '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100'
        )
      : 'absolute right-2 top-1/2 -translate-y-1/2 z-30';

  return (
    <span className={cn(placementClass, 'transition-opacity')}>
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={(e) => e.stopPropagation()}
        aria-pressed={pinned}
        title={pinned ? 'Unpin product' : 'Pin product'}
        aria-label={pinned ? 'Unpin product' : 'Pin product'}
        className={cn(
          'flex size-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
          pinned ? 'mk-key-brand' : 'mk-key-light text-gray-500 hover:text-gray-800'
        )}
      >
        {pinned ? (
          <PinOff className="size-4" strokeWidth={2.25} aria-hidden />
        ) : (
          <Pin className="size-4" strokeWidth={2.25} aria-hidden />
        )}
      </button>
    </span>
  );
}

function StockBadge({ availableStock }: { availableStock: number }) {
  const out = availableStock === 0;
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums',
        out ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-950'
      )}
    >
      {out ? 'OUT' : `${availableStock} LEFT`}
    </span>
  );
}

function InCartBadge({ qty }: { qty: number }) {
  return (
    <span key={qty} className="mk-key-brand mk-line-in rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums">
      ×{qty}
    </span>
  );
}

export default function ProductCard({
  product,
  inCartQty,
  availableStock,
  canAdd,
  cardHeightClass,
  addLabel,
  variant = 'grid',
  onAdd,
  onTogglePin,
}: ProductCardProps) {
  const isPinned = Boolean(product.pinned);
  const showStockBadge = availableStock <= 10;
  const image = hasUsableImage(product.image) ? product.image : null;

  const handleTogglePin = () => onTogglePin(product._id, isPinned);

  const addButton = (
    <button
      type="button"
      disabled={!canAdd}
      onClick={() => {
        if (canAdd) onAdd(product);
      }}
      className={cn(
        'absolute inset-0 z-[15] w-full h-full rounded-lg border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        canAdd ? 'cursor-pointer' : 'cursor-not-allowed'
      )}
      aria-label={`${addLabel} ${product.name}`}
    />
  );

  const thumb = (iconClass: string) =>
    image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    ) : (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#eef3f5] to-[#dfe8eb]">
        <Package className={cn(iconClass, 'text-[#9fb3ba]')} strokeWidth={1.75} aria-hidden />
      </div>
    );

  if (variant === 'list') {
    return (
      <div
        className={cn(
          'mk-panel relative flex items-center gap-3 rounded-lg group min-h-[64px] px-2 py-1.5 transition-shadow hover:shadow-md',
          isPinned && 'ring-2 ring-brand/50',
          !canAdd && 'opacity-55'
        )}
      >
        <div className="w-12 h-12 flex-shrink-0 rounded-md overflow-hidden border border-[#dbe4e7]">
          {thumb('size-5')}
        </div>

        <div className="flex-1 min-w-0 pr-28">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 truncate">{product.category || ' '}</p>
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{product.name}</p>
          <div className="font-mono font-bold text-sm tabular-nums text-brand mt-0.5">
            <Currency amount={product.price} showConverted convertedClassName="text-[10px] text-gray-500 font-normal" />
          </div>
        </div>

        <div className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
          {showStockBadge && <StockBadge availableStock={availableStock} />}
          {inCartQty > 0 && <InCartBadge qty={inCartQty} />}
        </div>

        {addButton}
        <PinButton pinned={isPinned} variant="list" onToggle={handleTogglePin} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mk-panel relative flex flex-col overflow-hidden rounded-lg group transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-lg active:translate-y-px',
        cardHeightClass,
        isPinned && 'ring-2 ring-brand/50',
        !canAdd && 'opacity-55'
      )}
    >
      <div className="pointer-events-none relative min-h-0 flex-1 overflow-hidden border-b border-[#dbe4e7]">
        {thumb('size-10')}
        <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
          {showStockBadge && <StockBadge availableStock={availableStock} />}
          {product.hasVariations && product.variations?.length ? (
            <span className="rounded bg-[#10222f]/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {product.variations.length} variants
            </span>
          ) : null}
        </div>
        {inCartQty > 0 && (
          <span className="absolute bottom-1.5 right-1.5 z-20">
            <InCartBadge qty={inCartQty} />
          </span>
        )}
      </div>

      <div className="pointer-events-none shrink-0 px-2.5 pt-1.5 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 truncate">{product.category || ' '}</p>
        <p className="font-semibold text-gray-900 text-[13px] leading-tight line-clamp-2 min-h-[2lh]">{product.name}</p>
        <div className="mt-1 font-mono font-bold text-[15px] tabular-nums text-brand leading-tight">
          <Currency
            amount={product.price}
            showConverted
            convertedClassName="block text-[10px] text-gray-500 font-normal leading-tight"
          />
        </div>
      </div>

      {addButton}
      <PinButton pinned={isPinned} variant="grid" onToggle={handleTogglePin} />
    </div>
  );
}
