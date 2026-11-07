'use client';

import Currency from '@/components/Currency';
import type { CartItemModifier } from '@/hooks/useCart';

export interface ModifierOption {
  name: string;
  price: number;
}

export interface ModifierGroup {
  name: string;
  options: ModifierOption[];
  required: boolean;
}

export interface PosModifierProduct {
  name: string;
  modifiers?: ModifierGroup[];
}

export interface PosModifierModalProps {
  dictValue: (path: string, fallback?: string) => string;
  product: PosModifierProduct;
  selectedModifiers: Record<string, { option: string; price: number }>;
  setSelectedModifiers: (
    value:
      | Record<string, { option: string; price: number }>
      | ((prev: Record<string, { option: string; price: number }>) => Record<string, { option: string; price: number }>)
  ) => void;
  onClose: () => void;
  onAddToOrder: (modifiers: CartItemModifier[]) => void;
}

export default function PosModifierModal({
  dictValue,
  product,
  selectedModifiers,
  setSelectedModifiers,
  onClose,
  onAddToOrder,
}: PosModifierModalProps) {
  const required = (product.modifiers || []).filter((g) => g.required);
  const allSatisfied = required.every((g) => !!selectedModifiers[g.name]);
  const chosenMods: CartItemModifier[] = Object.entries(selectedModifiers).map(([name, val]) => ({
    name,
    chosenOption: val.option,
    price: val.price,
  }));

  return (
    <div className="fixed inset-0 bg-ink/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="bg-paper-white text-ink w-full sm:max-w-md sm:animate-fade-in animate-slide-in-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-dashed border-ink/30">
          <div>
            <h2 className="text-3xl text-ink">{product.name}</h2>
            <p className="font-receipt text-xs text-ink/60 mt-1">{dictValue('pos.customizeOrder', 'Customize your order')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-ink/50 hover:text-ink"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {(product.modifiers || []).map((modGroup) => {
            const chosen = selectedModifiers[modGroup.name];
            return (
              <div key={modGroup.name}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm text-ink">{modGroup.name}</span>
                  {modGroup.required && (
                    <span className="font-receipt text-[10px] bg-ink text-paper-white px-1.5 py-0.5">{dictValue('pos.requiredBadge', 'REQUIRED')}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {modGroup.options.map((opt) => {
                    const isChosen = chosen?.option === opt.name;
                    return (
                      <button
                        key={opt.name}
                        type="button"
                        onClick={() => setSelectedModifiers((prev) => ({
                          ...prev,
                          [modGroup.name]: { option: opt.name, price: opt.price },
                        }))}
                        className={`px-3 py-2 text-sm border font-medium transition-colors ${isChosen
                          ? 'bg-ink border-ink text-paper-white'
                          : 'bg-paper-white border-ink/25 text-ink hover:border-ink'
                          }`}
                      >
                        {opt.name}
                        {opt.price > 0 && (
                          <span className={`ml-1 font-receipt text-xs ${isChosen ? 'text-paper/70' : 'text-ink/60'}`}>
                            +<Currency amount={opt.price} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-4 border-t border-dashed border-ink/30">
          <button
            type="button"
            disabled={!allSatisfied}
            onClick={() => onAddToOrder(chosenMods)}
            className="w-full py-3 bg-ink text-paper-white hover:bg-brand-navy font-receipt font-medium uppercase transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {!allSatisfied ? dictValue('pos.selectRequiredOptions', 'Select required options') : dictValue('pos.addToOrder', 'Add to Order')}
          </button>
        </div>
      </div>
    </div>
  );
}
