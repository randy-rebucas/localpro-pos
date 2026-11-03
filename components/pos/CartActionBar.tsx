'use client';

import { FolderOpen, MonitorSmartphone, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TranslationDict } from '@/types/dictionary';

interface CartActionBarProps {
  cartLength: number;
  itemCount: number;
  /** Kept for API compatibility — keycaps use the brand gloss instead. */
  primaryColor?: string;
  dict: TranslationDict;
  isCashier?: boolean;
  customerDisplayUrl?: string | null;
  showContext?: boolean;
  compact?: boolean;
  /** `dark` when the bar sits on an mk-dark register panel. */
  tone?: 'light' | 'dark';
  onSaveCart?: () => void;
  onClearCart?: () => void;
  onLoadSavedCarts?: () => void;
  onClose?: () => void;
  closeLabel?: string;
}

export default function CartActionBar({
  cartLength,
  itemCount,
  dict,
  isCashier = false,
  customerDisplayUrl,
  showContext = true,
  compact = false,
  tone = 'light',
  onSaveCart,
  onClearCart,
  onLoadSavedCarts,
  onClose,
  closeLabel,
}: CartActionBarProps) {
  const dark = tone === 'dark';
  const keyVariant = dark ? 'key' : 'light';
  const keyClass = 'size-10 p-0';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1.5',
        showContext ? 'justify-between' : 'justify-end',
        compact ? 'mb-2 pb-2' : 'py-3',
        dark ? 'border-b border-white/10' : 'border-b border-gray-200'
      )}
    >
      {showContext && (
        <div className="flex flex-1 min-w-0 items-center gap-2 mr-2">
          <span
            className={cn(
              'text-[11px] font-bold uppercase tracking-[0.14em]',
              dark ? 'text-white/55' : 'text-gray-500'
            )}
          >
            {dict.pos?.cart || 'Cart'}
          </span>
          <span
            key={itemCount}
            className="mk-lcd mk-lcd-on rounded px-2 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap"
          >
            {String(itemCount).padStart(2, '0')} {dict.pos?.items || 'items'}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {!isCashier && cartLength > 0 && onSaveCart && onClearCart && (
          <>
            <Button
              type="button"
              variant={keyVariant}
              onClick={onSaveCart}
              className={keyClass}
              aria-label={dict.pos?.saveCart || 'Save cart'}
              title={dict.pos?.saveCart || 'Save Cart'}
            >
              <Save className="size-4" strokeWidth={2.25} aria-hidden />
            </Button>
            <Button
              type="button"
              variant={keyVariant}
              onClick={onClearCart}
              className={cn(keyClass, dark ? 'text-red-300' : 'text-red-600')}
              aria-label={dict.common?.clear || 'Clear cart'}
              title={dict.common?.clear || 'Clear'}
            >
              <Trash2 className="size-4" strokeWidth={2.25} aria-hidden />
            </Button>
          </>
        )}
        {!isCashier && onLoadSavedCarts && (
          <Button
            type="button"
            variant={keyVariant}
            onClick={onLoadSavedCarts}
            className={keyClass}
            aria-label={dict.pos?.loadCart || 'Load saved cart'}
            title={dict.pos?.loadCart || 'Load Saved Cart'}
          >
            <FolderOpen className="size-4" strokeWidth={2.25} aria-hidden />
          </Button>
        )}
        {!isCashier && customerDisplayUrl && (
          <Button
            type="button"
            variant="brand"
            onClick={() => window.open(customerDisplayUrl, 'customer_display', 'width=1024,height=768')}
            className={keyClass}
            aria-label={dict.pos?.titleOpenCustomerDisplay || 'Open customer display'}
            title={dict.pos?.titleOpenCustomerDisplay || 'Open Customer Display'}
          >
            <MonitorSmartphone className="size-4" strokeWidth={2.25} aria-hidden />
          </Button>
        )}
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className={cn('size-10 p-0', dark ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700')}
            aria-label={closeLabel || dict.pos?.closeCart || 'Close cart'}
          >
            <X className="size-5" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
