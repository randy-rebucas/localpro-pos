import { useState, useCallback } from 'react';

export interface CartItemVariation {
  size?: string;
  color?: string;
  type?: string;
}

export interface CartItem {
  productId: string;
  cartItemId: string; // unique per line: productId or productId:variationSku
  name: string;
  price: number;
  quantity: number;
  stock: number;
  variationLabel?: string; // e.g. "S / Blue"
  variation?: CartItemVariation;
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
    product: { _id: string; name: string; price: number; stock: number; trackInventory?: boolean; allowOutOfStockSales?: boolean },
    variant?: CartVariant
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
    product: { _id: string; name: string; price: number; stock: number; trackInventory?: boolean; allowOutOfStockSales?: boolean },
    variant?: CartVariant
  ) => {
    const effectiveStock = variant?.stock ?? product.stock;
    const effectivePrice = variant?.price ?? product.price;
    const cartItemId = variant ? `${product._id}:${variant.sku}` : product._id;

    const displayName = variant ? `${product.name} (${variant.label})` : product.name;

    const isOutOfStock = effectiveStock === 0;
    const canSellOutOfStock = product.allowOutOfStockSales === true;
    const trackInventory = product.trackInventory !== false;

    if (isOutOfStock && !canSellOutOfStock) {
      showError('Out of stock');
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.cartItemId === cartItemId);
      if (existingItem) {
        if (trackInventory && !canSellOutOfStock && existingItem.quantity >= effectiveStock) {
          showError('Cannot exceed available stock');
          return prevCart;
        }
        return prevCart.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: Math.min(item.quantity + 1, MAX_QUANTITY) }
            : item
        );
      } else {
        return [
          ...prevCart,
          {
            productId: product._id,
            cartItemId,
            name: displayName,
            price: effectivePrice,
            quantity: 1,
            stock: effectiveStock,
            variationLabel: variant?.label,
            variation: variant?.variation,
          },
        ];
      }
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
    const item = cart.find((item) => item.cartItemId === cartItemId);
    if (!item) return;

    // Check stock constraints
    if (item.stock !== undefined && quantity > item.stock) {
      onError('Cannot exceed available stock');
      return;
    }

    setCart((prevCart) =>
      prevCart.map((item) =>
        item.cartItemId === cartItemId ? { ...item, quantity } : item
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
