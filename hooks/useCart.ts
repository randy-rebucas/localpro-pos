import { useState, useCallback } from 'react';
import {
  getMaxSaleUnitQuantity,
  resolveSaleUnitPrice,
  type ProductSaleUnit,
} from '@/lib/product-units';

export interface CartItemVariation {
  size?: string;
  color?: string;
  type?: string;
}

export interface CartItemModifier {
  name: string;
  chosenOption: string;
  price: number;
}

export interface CartItem {
  productId: string;
  cartItemId: string;
  name: string;
  price: number;
  quantity: number;
  /** Max quantity in selected sale units (derived from base stock). */
  stock: number;
  variationLabel?: string;
  variation?: CartItemVariation;
  selectedModifiers?: CartItemModifier[];
  modifierSurcharge?: number;
  saleUnit?: string;
  saleUnitLabel?: string;
  unitFactor?: number;
}

export interface CartVariant {
  sku: string;
  label: string;
  price?: number;
  stock?: number;
  variation: CartItemVariation;
}

interface UseCartReturn {
  cart: CartItem[];
  setCart: (items: CartItem[]) => void;
  addToCart: (
    product: {
      _id: string;
      name: string;
      price: number;
      stock: number;
      trackInventory?: boolean;
      allowOutOfStockSales?: boolean;
    },
    variant?: CartVariant,
    modifiers?: CartItemModifier[],
    saleUnit?: ProductSaleUnit
  ) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number, onError: (message: string) => void) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getCartTotal: (settings?: { taxEnabled?: boolean; taxRate?: number }) => number;
  getTaxAmount: (settings?: { taxEnabled?: boolean; taxRate?: number }, taxableBase?: number) => number;
}

const MAX_QUANTITY = 9999;

export function useCart(showError: (msg: string) => void): UseCartReturn {
  const [cart, setCart] = useState<CartItem[]>([]);

  const getSubtotal = useCallback(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const getTaxAmount = useCallback((settings?: { taxEnabled?: boolean; taxRate?: number }, taxableBase?: number) => {
    if (!settings?.taxEnabled || !settings?.taxRate) return 0;
    const base = taxableBase ?? getSubtotal();
    return Math.round(base * (settings.taxRate / 100) * 100) / 100;
  }, [getSubtotal]);

  const getCartTotal = useCallback((settings?: { taxEnabled?: boolean; taxRate?: number }) => {
    const subtotal = getSubtotal();
    const tax = getTaxAmount(settings);
    return Math.round((subtotal + tax) * 100) / 100;
  }, [getSubtotal, getTaxAmount]);

  const addToCart = useCallback((
    product: {
      _id: string;
      name: string;
      price: number;
      stock: number;
      trackInventory?: boolean;
      allowOutOfStockSales?: boolean;
    },
    variant?: CartVariant,
    modifiers?: CartItemModifier[],
    saleUnit?: ProductSaleUnit
  ) => {
    const unit = saleUnit ?? { code: 'pc', label: 'Piece', factor: 1, isDefault: true };
    const stockInBaseUnits = variant?.stock ?? product.stock;
    const maxSaleQty = getMaxSaleUnitQuantity(stockInBaseUnits, unit.factor);
    const basePrice = variant?.price ?? product.price;
    const unitPrice = resolveSaleUnitPrice({ price: basePrice }, unit);
    const surcharge = modifiers ? modifiers.reduce((s, m) => s + m.price, 0) : 0;
    const effectivePrice = unitPrice + surcharge;

    let cartItemId = variant ? `${product._id}:${variant.sku}` : product._id;
    cartItemId = `${cartItemId}:unit:${unit.code}`;
    if (modifiers && modifiers.length > 0) {
      const modHash = modifiers
        .map((m) => `${m.name}=${m.chosenOption}`)
        .sort()
        .join('|');
      cartItemId = `${cartItemId}:${modHash}`;
    }

    let displayName = variant ? `${product.name} (${variant.label})` : product.name;
    if (unit.factor > 1 || unit.code !== 'pc') {
      displayName = `${displayName} — ${unit.label}`;
    }

    const canSellOutOfStock = product.allowOutOfStockSales === true;
    const trackInventory = product.trackInventory !== false;

    if (maxSaleQty === 0 && !canSellOutOfStock && trackInventory) {
      showError('Out of stock');
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.cartItemId === cartItemId);
      if (existingItem) {
        if (trackInventory && !canSellOutOfStock && existingItem.quantity >= maxSaleQty) {
          showError('Cannot exceed available stock');
          return prevCart;
        }
        return prevCart.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: Math.min(item.quantity + 1, MAX_QUANTITY) }
            : item
        );
      }

      return [
        ...prevCart,
        {
          productId: product._id,
          cartItemId,
          name: displayName,
          price: effectivePrice,
          quantity: 1,
          stock: maxSaleQty,
          variationLabel: variant?.label,
          variation: variant?.variation,
          selectedModifiers: modifiers && modifiers.length > 0 ? modifiers : undefined,
          modifierSurcharge: surcharge > 0 ? surcharge : undefined,
          saleUnit: unit.code,
          saleUnitLabel: unit.label,
          unitFactor: unit.factor,
        },
      ];
    });
  }, [showError]);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.cartItemId !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, quantity: number, onError: (message: string) => void) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    if (quantity > MAX_QUANTITY) {
      onError(`Maximum quantity is ${MAX_QUANTITY}`);
      return;
    }
    const item = cart.find((i) => i.cartItemId === cartItemId);
    if (!item) return;

    if (item.stock !== undefined && quantity > item.stock) {
      onError('Cannot exceed available stock');
      return;
    }

    setCart((prevCart) =>
      prevCart.map((i) =>
        i.cartItemId === cartItemId ? { ...i, quantity } : i
      )
    );
  }, [cart, removeFromCart]);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  return {
    cart,
    setCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getSubtotal,
    getCartTotal,
    getTaxAmount,
  };
}
