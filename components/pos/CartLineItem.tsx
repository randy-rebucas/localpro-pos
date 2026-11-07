'use client';

import Currency from '@/components/Currency';
import type { CartItem } from '@/hooks/useCart';
import type { TranslationDict } from '@/types/dictionary';

interface ProductLookup {
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
}

export type CartLineItemVariant = 'compact' | 'roaming';

interface CartLineItemProps {
  item: CartItem;
  variant?: CartLineItemVariant;
  dict: TranslationDict;
  businessType?: string;
  product?: ProductLookup;
  onRemove: (cartItemId: string) => void;
  onUpdateQuantity: (cartItemId: string, quantity: number, onError: (message: string) => void) => void;
  onQuantityError: (message: string) => void;
  onBranchLookup?: () => void;
}

function isIncreaseDisabled(item: CartItem, product?: ProductLookup): boolean {
  const canSellOutOfStock = product?.allowOutOfStockSales === true;
  const trackInventory = product?.trackInventory !== false;
  return trackInventory && !canSellOutOfStock && item.quantity >= item.stock;
}

function ModifierSummary({ modifiers }: { modifiers: CartItem['selectedModifiers'] }) {
  if (!modifiers?.length) return null;
  return (
    <div className="text-[11px] text-ink/60 mt-0.5 leading-snug">
      {modifiers.map((m) => (
        <span key={`${m.name}-${m.chosenOption}`} className="block truncate">
          {m.name}: {m.chosenOption}
          {m.price > 0 && (
            <span className="text-ink/50">
              {' '}
              (+<Currency amount={m.price} />)
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function CartLineItem({
  item,
  variant = 'compact',
  dict,
  businessType,
  product,
  onRemove,
  onUpdateQuantity,
  onQuantityError,
  onBranchLookup,
}: CartLineItemProps) {
  const increaseDisabled = isIncreaseDisabled(item, product);
  const qtyBtnClass =
    variant === 'roaming'
      ? 'px-3 py-2 min-h-[44px] min-w-[44px] hover:bg-paper font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
      : 'px-2 py-1 min-w-[44px] min-h-[44px] hover:bg-paper active:bg-paper font-bold text-base leading-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  if (variant === 'roaming') {
    return (
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 border-b border-dashed border-ink/25 py-3">
        <div className="w-full sm:w-auto sm:flex-1 min-w-0">
          <p className="font-semibold text-ink truncate">{item.name}</p>
          <ModifierSummary modifiers={item.selectedModifiers} />
          <p className="font-receipt text-xs text-ink/60 mt-0.5">
            <Currency amount={item.price} /> {dict.pos?.each || 'each'}
          </p>
        </div>
        <div className="flex items-center border border-ink/25 bg-paper-white overflow-hidden flex-shrink-0">
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1, onQuantityError)}
            className={qtyBtnClass}
            aria-label={dict.pos?.decreaseQuantity || 'Decrease quantity'}
          >
            −
          </button>
          <span className="px-3 py-2 min-w-[2.5rem] text-center font-receipt font-medium text-sm tabular-nums border-x border-ink/25">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1, onQuantityError)}
            className={qtyBtnClass}
            disabled={increaseDisabled}
            aria-label={dict.pos?.increaseQuantity || 'Increase quantity'}
          >
            +
          </button>
        </div>
        <div className="ml-auto sm:ml-0 font-receipt font-semibold text-ink flex-shrink-0 text-sm w-20 text-right tabular-nums">
          <Currency amount={item.price * item.quantity} />
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.cartItemId)}
          className="p-2 min-h-[44px] min-w-[44px] text-ink/50 hover:text-stamp flex-shrink-0 flex items-center justify-center"
          aria-label={dict.pos?.removeItem || 'Remove item'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex items-start gap-1.5 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-ink text-sm leading-snug line-clamp-2">{item.name}</div>
          <ModifierSummary modifiers={item.selectedModifiers} />
          <div className="font-receipt text-xs text-ink/60 flex items-center gap-1 mt-0.5">
            <Currency amount={item.price} />
            <span className="text-ink/50">×{item.quantity}</span>
            {businessType === 'retail' && onBranchLookup && (
              <button
                type="button"
                onClick={onBranchLookup}
                className="text-ink/50 hover:text-brand transition-colors p-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center -my-2"
                aria-label={dict.pos?.titleCheckStock || 'Check stock at other locations'}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="font-receipt text-sm font-semibold text-ink tabular-nums flex-shrink-0 pt-0.5">
          <Currency amount={item.price * item.quantity} />
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.cartItemId)}
          className="p-1 min-h-[44px] min-w-[44px] text-ink/50 hover:text-stamp transition-colors flex-shrink-0 flex items-center justify-center"
          aria-label={dict.pos?.removeItem || 'Remove item'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 pl-0.5">
        <span className="font-receipt text-[10px] uppercase tracking-wide text-ink/60">{dict.pos?.each || 'each'}</span>
        <div className="flex items-center border border-ink/25 overflow-hidden bg-paper-white">
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1, onQuantityError)}
            className={qtyBtnClass}
            aria-label={dict.pos?.decreaseQuantity || 'Decrease quantity'}
          >
            −
          </button>
          <span className="px-2 py-1 min-w-[2rem] text-center font-receipt font-medium text-sm tabular-nums border-x border-ink/25">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1, onQuantityError)}
            className={qtyBtnClass}
            disabled={increaseDisabled}
            aria-label={dict.pos?.increaseQuantity || 'Increase quantity'}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
