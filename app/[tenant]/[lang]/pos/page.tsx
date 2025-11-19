'use client';

import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import PageTitle from '@/components/PageTitle';
import OfflineIndicator from '@/components/OfflineIndicator';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getOfflineStorage } from '@/lib/offline-storage';

interface Product {
  _id: string;
  name: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
}

export default function POSPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'digital'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [dict, setDict] = useState<any>(null);
  const { isOnline } = useNetworkStatus(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const loadCachedProducts = useCallback(async () => {
    try {
      const storage = await getOfflineStorage();
      const cached = await storage.getCachedProducts(tenant);
      if (cached.length > 0) {
        // Filter by search if provided
        let filtered = cached;
        if (search) {
          const searchLower = search.toLowerCase();
          filtered = cached.filter(
            p =>
              p.name.toLowerCase().includes(searchLower) ||
              p.sku?.toLowerCase().includes(searchLower) ||
              p.category?.toLowerCase().includes(searchLower)
          );
        }
        setProducts(filtered);
      }
    } catch (error) {
      console.error('Error loading cached products:', error);
    }
  }, [search, tenant]);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      
      if (isOnline) {
        // Try to fetch from server
        try {
          const res = await fetch(`/api/products?search=${encodeURIComponent(search)}&tenant=${tenant}`);
          const data = await res.json();
          if (data.success) {
            setProducts(data.data);
            // Cache products for offline use
            const storage = await getOfflineStorage();
            await storage.cacheProducts(data.data, tenant);
          }
        } catch (error) {
          console.error('Error fetching products from server:', error);
          // Fall back to cached products
          await loadCachedProducts();
        }
      } else {
        // Load from cache when offline
        await loadCachedProducts();
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      // Try to load from cache as fallback
      await loadCachedProducts();
    } finally {
      setLoading(false);
    }
  }, [search, tenant, isOnline, loadCachedProducts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const addToCart = (product: Product) => {
    if (!dict) return;
    if (product.stock === 0) {
      alert(dict.pos.outOfStock);
      return;
    }

    const existingItem = cart.find((item) => item.productId === product._id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        alert(dict.pos.insufficientStock);
        return;
      }
      setCart(
        cart.map((item) =>
          item.productId === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId: product._id,
          name: product.name,
          price: product.price,
          quantity: 1,
          stock: product.stock,
        },
      ]);
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (!dict) return;
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    const item = cart.find((item) => item.productId === productId);
    if (item && quantity > item.stock) {
      alert(dict.pos.insufficientStock);
      return;
    }
    setCart(
      cart.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.productId !== productId));
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const handleCheckout = () => {
    if (!dict) return;
    if (cart.length === 0) {
      alert(dict.pos.cartEmptyAlert);
      return;
    }
    setShowPaymentModal(true);
  };

  const processPayment = async () => {
    if (!dict) return;
    if (paymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      const total = getTotal();
      if (isNaN(cash) || cash < total) {
        alert(dict.pos.insufficientCash);
        return;
      }
    }

    setProcessing(true);
    try {
      if (isOnline) {
        // Try to process online
        try {
          const res = await fetch(`/api/transactions?tenant=${tenant}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: cart.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
              paymentMethod,
              cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : undefined,
            }),
          });

          const data = await res.json();
          if (data.success) {
            const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(getTotal());
            alert(`${dict.pos.transactionCompleted} ${totalFormatted}`);
            setCart([]);
            setShowPaymentModal(false);
            setCashReceived('');
            setPaymentMethod('cash');
            fetchProducts();
            return;
          } else {
            throw new Error(data.error || 'Failed to process transaction');
          }
        } catch (error) {
          // If online request fails, fall through to offline save
          console.error('Online transaction failed, saving offline:', error);
        }
      }

      // Save to offline storage
      const storage = await getOfflineStorage();
      await storage.saveTransaction({
        tenant,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        paymentMethod,
        cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : undefined,
      });

      // Update local product stock (optimistic update)
      for (const item of cart) {
        const product = products.find(p => p._id === item.productId);
        if (product) {
          const newStock = product.stock - item.quantity;
          setProducts(products.map(p => 
            p._id === item.productId ? { ...p, stock: Math.max(0, newStock) } : p
          ));
          // Update cache
          await storage.updateProductStock(item.productId, newStock, tenant);
        }
      }

      const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(getTotal());
      const message = isOnline 
        ? `${dict.pos.transactionCompleted} ${totalFormatted}`
        : `${dict.pos.transactionSavedOffline || 'Transaction saved offline'} ${totalFormatted}. ${dict.pos.willSyncWhenOnline || 'Will sync when connection is restored.'}`;
      
      alert(message);
      setCart([]);
      setShowPaymentModal(false);
      setCashReceived('');
      setPaymentMethod('cash');
      
      // Refresh products if online
      if (isOnline) {
        fetchProducts();
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
      alert(dict.pos.transactionError || 'Failed to process transaction');
    } finally {
      setProcessing(false);
    }
  };

  const clearCart = () => {
    if (!dict) return;
    if (confirm(dict.pos.clearCartConfirm)) {
      setCart([]);
    }
  };

  if (!dict) {
    return <div className="text-center py-12">{dict?.common.loading || 'Loading...'}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTitle />
      <OfflineIndicator />
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Mobile: Cart first (sticky at top), then products below */}
        {/* Desktop: Products left, Cart right */}
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Cart Section - Mobile: First, Desktop: Right */}
          <div className="lg:col-span-1 order-1 lg:order-2">
            <div className="bg-white rounded-xl shadow-md p-5 sm:p-6 lg:sticky lg:top-20">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {dict.pos.cart}
                  {cart.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                      {cart.length}
                    </span>
                  )}
                </h2>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-sm font-medium text-red-600 hover:text-red-800 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    {dict.common.clear}
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-base">{dict.pos.cartEmpty}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4 mb-5 max-h-[50vh] sm:max-h-96 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.productId} className="border-b border-gray-200 pb-4 last:border-0">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900 text-base truncate">{item.name}</div>
                            <div className="text-sm text-gray-500 mt-0.5">
                              <Currency amount={item.price} /> {dict.pos.each}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.productId)}
                            className="ml-2 p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                            aria-label="Remove item"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                              className="px-4 py-2.5 hover:bg-gray-100 font-bold text-lg transition-colors"
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="px-4 py-2.5 min-w-[3.5rem] text-center font-semibold text-base bg-gray-50">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                              className="px-4 py-2.5 hover:bg-gray-100 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              disabled={item.quantity >= item.stock}
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                          <div className="font-bold text-gray-900 text-lg">
                            <Currency amount={item.price * item.quantity} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-gray-200 pt-5 mt-5">
                    <div className="flex justify-between items-center mb-5">
                      <span className="text-lg sm:text-xl font-bold text-gray-900">{dict.common.total}:</span>
                      <span className="text-2xl sm:text-3xl font-bold text-blue-600">
                        <Currency amount={getTotal()} />
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={processing}
                      className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-all duration-200 text-lg shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {processing ? (
                        <>
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {dict.pos.checkout}
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Products Section - Mobile: Second, Desktop: Left */}
          <div className="lg:col-span-2 order-2 lg:order-1">
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">{dict.pos.title}</h1>
              <div className="relative">
                <input
                  type="text"
                  placeholder={dict.pos.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-4 py-3 pl-11 text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all"
                />
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-xl shadow-md overflow-hidden">
                <div className="divide-y divide-gray-200">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="p-4 animate-pulse">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="h-5 bg-gray-200 rounded-lg w-1/3 mb-2"></div>
                          <div className="h-4 bg-gray-200 rounded-lg w-1/4"></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="h-4 bg-gray-200 rounded-lg w-20"></div>
                          <div className="h-4 bg-gray-200 rounded-lg w-16"></div>
                          <div className="h-9 bg-gray-200 rounded-lg w-24"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl shadow-md">
                <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-gray-500 text-lg">{dict.common.noResults}</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-md overflow-hidden">
                {/* Desktop Table Header */}
                <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-700">
                  <div className="col-span-4">{dict.products.name}</div>
                  <div className="col-span-2">{dict.products.category}</div>
                  <div className="col-span-2 text-right">{dict.products.price}</div>
                  <div className="col-span-2 text-right">{dict.pos.stock}</div>
                  <div className="col-span-2 text-right">{dict.common.actions}</div>
                </div>
                {/* Product List */}
                <div className="divide-y divide-gray-200">
                  {products.map((product) => (
                    <div
                      key={product._id}
                      className={`px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors ${
                        product.stock === 0 ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex flex-col md:grid md:grid-cols-12 gap-4 items-center">
                        {/* Name - Mobile & Desktop */}
                        <div className="col-span-4 w-full md:w-auto">
                          <div className="font-semibold text-gray-900 text-base mb-1">
                            {product.name}
                          </div>
                          <div className="text-xs text-gray-500 md:hidden">
                            {product.category || dict.pos.uncategorized}
                          </div>
                        </div>
                        {/* Category - Desktop Only */}
                        <div className="hidden md:block col-span-2 text-sm text-gray-600">
                          {product.category || dict.pos.uncategorized}
                        </div>
                        {/* Price */}
                        <div className="col-span-2 w-full md:w-auto text-left md:text-right">
                          <div className="text-sm text-gray-500 md:hidden mb-1">{dict.products.price}</div>
                          <div className="font-bold text-blue-600 text-lg">
                            <Currency amount={product.price} />
                          </div>
                        </div>
                        {/* Stock */}
                        <div className="col-span-2 w-full md:w-auto text-left md:text-right">
                          <div className="text-sm text-gray-500 md:hidden mb-1">{dict.pos.stock}</div>
                          <span
                            className={`inline-block text-xs font-semibold px-3 py-1.5 rounded-full ${
                              product.stock > 10
                                ? 'bg-green-100 text-green-800'
                                : product.stock > 0
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {product.stock} {dict.pos.inStock}
                          </span>
                        </div>
                        {/* Add to Cart Button */}
                        <div className="col-span-2 w-full md:w-auto text-left md:text-right">
                          <button
                            type="button"
                            disabled={product.stock === 0}
                            onClick={() => product.stock > 0 && addToCart(product)}
                            className={`w-full md:w-auto px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                              product.stock > 0
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {product.stock > 0 ? dict.common.add : dict.pos.outOfStock}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-md p-5 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-5">{dict.pos.payment}</h2>
            <div className="mb-5">
              <div className="text-lg font-semibold text-gray-900 mb-5">
                {dict.common.total}: <Currency amount={getTotal()} />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict.pos.paymentMethod}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'card', 'digital'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(method);
                          if (method !== 'cash') setCashReceived('');
                        }}
                        className={`px-3 sm:px-4 py-2.5 rounded-xl border-2 font-medium text-sm sm:text-base transition-all duration-200 ${
                          paymentMethod === method
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 shadow-sm'
                        }`}
                      >
                        {dict.pos[method]}
                      </button>
                    ))}
                  </div>
                </div>
                {paymentMethod === 'cash' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {dict.pos.cashReceived}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="w-full px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                    {cashReceived && parseFloat(cashReceived) >= getTotal() && (
                      <div className="mt-2 text-sm text-green-600 font-medium">
                        {dict.pos.change}: <Currency amount={parseFloat(cashReceived) - getTotal()} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowPaymentModal(false);
                  setCashReceived('');
                }}
                className="w-full sm:w-auto px-4 py-2.5 border-2 border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 font-medium transition-colors shadow-sm"
              >
                {dict.common.cancel}
              </button>
              <button
                type="button"
                onClick={processPayment}
                disabled={processing || (paymentMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < getTotal()))}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors shadow-md hover:shadow-lg"
              >
                {processing ? dict.pos.processing : dict.pos.completePayment}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

