'use client';

import { MapPin, Minus, Plus, Trash2 } from 'lucide-react';
import Currency from '@/components/Currency';
import { Button } from '@/components/ui/button';
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
      ? 'px-3 py-2 min-h-[44px] min-w-[44px] hover:bg-gray-100 font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
      : 'px-2 py-1 min-w-[44px] min-h-[44px] hover:bg-gray-100 active:bg-gray-200 font-bold text-base leading-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

  if (variant === 'roaming') {
    return (
      <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 p-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{item.name}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            <Currency amount={item.price} /> {dict.pos?.each || 'each'}
          </p>
        </div>
        <div className="flex items-center border-2 border-gray-300 bg-white overflow-hidden flex-shrink-0 rounded-sm">
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1, onQuantityError)}
            className={qtyBtnClass}
            aria-label={dict.pos?.decreaseQuantity || 'Decrease quantity'}
          >
            −
          </button>
          <span className="px-3 py-2 min-w-[2.5rem] text-center font-semibold text-sm tabular-nums border-x border-gray-300">
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
        <div className="font-bold text-gray-900 flex-shrink-0 text-sm w-20 text-right tabular-nums">
          <Currency amount={item.price * item.quantity} />
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.cartItemId)}
          className="p-2 min-h-[44px] min-w-[44px] text-red-500 hover:text-red-700 flex-shrink-0 flex items-center justify-center"
          aria-label={dict.pos?.removeItem || 'Remove item'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // Compact: a ticket line on the register's receipt paper.
  return (
    <div className="mk-line-in px-2.5 py-2 hover:bg-[#f3f7f8] transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-[13px] leading-snug line-clamp-2">{item.name}</div>
          <div className="font-mono text-[11px] text-gray-500 tabular-nums flex items-center gap-1 mt-0.5">
            <span>{item.quantity}</span>
            <span className="text-gray-400">@</span>
            <Currency amount={item.price} />
            {businessType === 'retail' && onBranchLookup && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onBranchLookup}
                className="ml-0.5 text-gray-400 hover:text-brand"
                aria-label={dict.pos?.titleCheckStock || 'Check stock at other locations'}
                title={dict.pos?.titleCheckStock || 'Check stock at other locations'}
              >
                <MapPin strokeWidth={2.25} aria-hidden />
              </Button>
            )}
          </div>
        </div>
        <div className="font-mono text-[13px] font-bold text-gray-900 tabular-nums flex-shrink-0 pt-px">
          <Currency amount={item.price * item.quantity} />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={() => onRemove(item.cartItemId)}
          className="mr-auto -ml-1 text-gray-400 hover:text-red-600 hover:bg-red-50"
          aria-label={dict.pos?.removeItem || 'Remove item'}
          title={dict.pos?.removeItem || 'Remove item'}
        >
          <Trash2 strokeWidth={2.25} aria-hidden />
        </Button>
        <Button
          type="button"
          variant="light"
          size="icon-lg"
          onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1, onQuantityError)}
          aria-label={dict.pos?.decreaseQuantity || 'Decrease quantity'}
        >
          <Minus strokeWidth={2.5} aria-hidden />
        </Button>
        <span key={item.quantity} className="mk-lcd mk-lcd-on rounded min-w-[2.5rem] px-1.5 py-2 text-center text-xs font-bold tabular-nums">
          {item.quantity}
        </span>
        <Button
          type="button"
          variant="light"
          size="icon-lg"
          onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1, onQuantityError)}
          disabled={increaseDisabled}
          aria-label={dict.pos?.increaseQuantity || 'Increase quantity'}
        >
          <Plus strokeWidth={2.5} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
