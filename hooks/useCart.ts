import { useState, useCallback } from 'react';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
}

interface UseCartReturn {
  cart: CartItem[];
  setCart: (items: CartItem[]) => void;
  addToCart: (product: { _id: string; name: string; price: number; stock: number; trackInventory?: boolean; allowOutOfStockSales?: boolean }) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number, onError: (message: string) => void) => void;
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

  const addToCart = useCallback((product: { _id: string; name: string; price: number; stock: number; trackInventory?: boolean; allowOutOfStockSales?: boolean }) => {
    const isOutOfStock = product.stock === 0;
    const canSellOutOfStock = product.allowOutOfStockSales === true;
    const trackInventory = product.trackInventory !== false;

    if (isOutOfStock && !canSellOutOfStock) {
      showError('Out of stock');
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.productId === product._id);
      if (existingItem) {
        if (trackInventory && !canSellOutOfStock && existingItem.quantity >= product.stock) {
          showError('Cannot exceed available stock');
          return prevCart;
        }
        return prevCart.map((item) =>
          item.productId === product._id
            ? { ...item, quantity: Math.min(item.quantity + 1, MAX_QUANTITY) }
            : item
        );
      } else {
        return [
          ...prevCart,
          {
            productId: product._id,
            name: product.name,
            price: product.price,
            quantity: 1,
            stock: product.stock,
          },
        ];
      }
    });
  }, [showError]);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number, onError: (message: string) => void) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    if (quantity > MAX_QUANTITY) {
      onError(`Maximum quantity is ${MAX_QUANTITY}`);
      return;
    }
    const item = cart.find((item) => item.productId === productId);
    if (!item) return;

    // Check stock constraints
    if (item.stock !== undefined && quantity > item.stock) {
      onError('Cannot exceed available stock');
      return;
    }

    setCart((prevCart) =>
      prevCart.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
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
