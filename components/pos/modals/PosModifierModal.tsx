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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="bg-white w-full sm:max-w-md shadow-2xl sm:animate-fade-in animate-slide-in-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{product.name}</h2>
            <p className="text-sm text-orange-600 font-medium">Customize your order</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600"
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
                  <span className="font-semibold text-sm text-gray-900">{modGroup.name}</span>
                  {modGroup.required && (
                    <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5">REQUIRED</span>
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
                        className={`px-3 py-2 text-sm border-2 font-medium transition-all ${isChosen
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-orange-400'
                          }`}
                      >
                        {opt.name}
                        {opt.price > 0 && (
                          <span className={`ml-1 text-xs ${isChosen ? 'text-orange-100' : 'text-orange-600'}`}>
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
        <div className="px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            disabled={!allSatisfied}
            onClick={() => onAddToOrder(chosenMods)}
            className="w-full py-3 text-white font-bold text-base transition-colors border disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500 border-orange-500 hover:bg-orange-600"
          >
            {!allSatisfied ? 'Select required options' : 'Add to Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
