'use client';

import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import OfflineIndicator from '@/components/OfflineIndicator';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getOfflineStorage } from '@/lib/offline-storage';
import BarcodeScanner from '@/components/BarcodeScanner';
import QRCodeScanner from '@/components/QRCodeScanner';
import HardwareStatusChecker from '@/components/HardwareStatus';
import { hardwareService } from '@/lib/hardware';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { formatCurrency, getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';

interface Product {
  _id: string;
  name: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
  pinned?: boolean;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
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
  const { settings } = useTenantSettings();
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; name?: string } | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundTransactionId, setRefundTransactionId] = useState('');
  const [refundTransaction, setRefundTransaction] = useState<Record<string, unknown> | null>(null);
  const [refundItems, setRefundItems] = useState<Record<string, number>>({});
  const [refundReason, setRefundReason] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [showSavedCartsModal, setShowSavedCartsModal] = useState(false);
  const [savedCarts, setSavedCarts] = useState<Array<Record<string, unknown>>>([]);
  const [loadingSavedCarts, setLoadingSavedCarts] = useState(false);
  const [savingCart, setSavingCart] = useState(false);
  const [showSaveCartModal, setShowSaveCartModal] = useState(false);
  const [cartName, setCartName] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { confirm } = useConfirm();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
          await (document.documentElement as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
        } else if ((document.documentElement as unknown as { mozRequestFullScreen?: () => Promise<void> }).mozRequestFullScreen) {
          await (document.documentElement as unknown as { mozRequestFullScreen: () => Promise<void> }).mozRequestFullScreen();
        } else if ((document.documentElement as unknown as { msRequestFullscreen?: () => Promise<void> }).msRequestFullscreen) {
          await (document.documentElement as unknown as { msRequestFullscreen: () => Promise<void> }).msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen) {
          await (document as unknown as { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen();
        } else if ((document as unknown as { mozCancelFullScreen?: () => Promise<void> }).mozCancelFullScreen) {
          await (document as unknown as { mozCancelFullScreen: () => Promise<void> }).mozCancelFullScreen();
        } else if ((document as unknown as { msExitFullscreen?: () => Promise<void> }).msExitFullscreen) {
          await (document as unknown as { msExitFullscreen: () => Promise<void> }).msExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  };

  // Initialize hardware services
  useEffect(() => {
    if (settings) {
      // Load hardware config from localStorage (per-tenant)
      const hardwareConfigKey = `hardware_config_${tenant}`;
      const savedConfig = localStorage.getItem(hardwareConfigKey);
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          hardwareService.setConfig(config);
        } catch (error) {
          console.error('Failed to load hardware config:', error);
        }
      }
    }
  }, [settings, tenant]);

  // Add to cart function
  const addToCart = useCallback((product: Product) => {
    if (!dict) return;
    
    // Check if product is out of stock and if sales are allowed when out of stock
    const isOutOfStock = product.stock === 0;
    const canSellOutOfStock = product.allowOutOfStockSales === true;
    const trackInventory = product.trackInventory !== false; // Default to true if not set
    
    if (isOutOfStock && !canSellOutOfStock) {
      showToast.error(dict.pos.outOfStock);
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.productId === product._id);
      if (existingItem) {
        // If tracking inventory and not allowing out of stock sales, check stock
        if (trackInventory && !canSellOutOfStock && existingItem.quantity >= product.stock) {
          showToast.error(dict.pos.insufficientStock);
          return prevCart;
        }
        return prevCart.map((item) =>
          item.productId === product._id
            ? { ...item, quantity: item.quantity + 1 }
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
  }, [dict]);

  // Handle barcode scanning
  const handleBarcodeScan = useCallback((barcode: string) => {
    // Try to find product by SKU or barcode
    const product = products.find(
      p => p.sku === barcode || p._id === barcode
    );
    if (product && (product.stock > 0 || product.allowOutOfStockSales)) {
      addToCart(product);
    } else {
      if (dict) {
        showToast.error(dict.pos.productNotFound || 'Product not found');
      }
    }
  }, [products, dict, addToCart]);

  // Handle QR code scan
  const handleQRScan = useCallback((data: string) => {
    // QR codes might contain product IDs, URLs, or other data
    // Try to parse as product ID first
    const product = products.find(p => p._id === data);
    if (product && (product.stock > 0 || product.allowOutOfStockSales)) {
      addToCart(product);
      setShowQRScanner(false);
    }
  }, [products, addToCart]);

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

  const updateQuantity = (productId: string, quantity: number) => {
    if (!dict) return;
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    const item = cart.find((item) => item.productId === productId);
    const product = products.find(p => p._id === productId);
    const canSellOutOfStock = product?.allowOutOfStockSales === true;
    const trackInventory = product?.trackInventory !== false; // Default to true if not set
    
    // Check stock only if tracking inventory and not allowing out of stock sales
    if (item && trackInventory && !canSellOutOfStock && quantity > item.stock) {
      showToast.error(dict.pos.insufficientStock);
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

  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const getTotal = () => {
    const subtotal = getSubtotal();
    const discount = appliedDiscount?.amount || 0;
    return Math.max(0, subtotal - discount);
  };

  const applyDiscount = async () => {
    if (!dict || !promoCode.trim()) return;

    try {
      const subtotal = getSubtotal();
      const res = await fetch(`/api/discounts/validate?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode, subtotal }),
      });

      const data = await res.json();
      if (data.success) {
        setAppliedDiscount({
          code: data.data.code,
          amount: data.data.discountAmount,
          name: data.data.name,
        });
        setPromoCode('');
        showToast.success(dict.pos.discountApplied || 'Discount applied successfully');
      } else {
        showToast.error(data.error || dict.pos.invalidDiscountCode);
      }
    } catch (error) {
      console.error('Error applying discount:', error);
      showToast.error(dict.pos.invalidDiscountCode);
    }
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setPromoCode('');
  };

  const lookupTransaction = async () => {
    if (!dict || !refundTransactionId.trim()) return;

    try {
      const res = await fetch(`/api/transactions/${refundTransactionId}?tenant=${tenant}`);
      const data = await res.json();

      if (data.success) {
        const transaction = data.data;
        if (transaction.status === 'refunded') {
          showToast.error(dict.pos.alreadyRefunded || 'This transaction has already been refunded');
          return;
        }
        if (transaction.status !== 'completed') {
          showToast.error(dict.pos.onlyCompletedRefundable || 'Only completed transactions can be refunded');
          return;
        }
        setRefundTransaction(transaction);
        // Initialize refund items with all items at full quantity
        const items: Record<string, number> = {};
        transaction.items.forEach((item: { product: { toString: () => string }; quantity: number }) => {
          items[item.product.toString()] = item.quantity;
        });
        setRefundItems(items);
      } else {
        showToast.error(data.error || dict.pos.noTransactionFound);
      }
    } catch (error) {
      console.error('Error looking up transaction:', error);
      showToast.error(dict.pos.noTransactionFound);
    }
  };

  const processRefund = async () => {
    if (!dict || !refundTransaction) return;

    const selectedItems = Object.entries(refundItems)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    if (selectedItems.length === 0) {
      showToast.error(dict.pos.selectAtLeastOneItem);
      return;
    }

    setProcessingRefund(true);
    try {
      const res = await fetch(`/api/transactions/${refundTransaction._id}/refund?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedItems,
          reason: refundReason,
          notes: refundNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast.success(dict.pos.refundSuccess);
        setShowRefundModal(false);
        setRefundTransaction(null);
        setRefundTransactionId('');
        setRefundItems({});
        setRefundReason('');
        setRefundNotes('');
        fetchProducts();
      } else {
        showToast.error(data.error || dict.pos.refundError);
      }
    } catch (error) {
      console.error('Error processing refund:', error);
      showToast.error(dict.pos.refundError);
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleCheckout = () => {
    if (!dict) return;
    if (cart.length === 0) {
      showToast.error(dict.pos.cartEmptyAlert);
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
        showToast.error(dict.pos.insufficientCash);
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
              discountCode: appliedDiscount?.code,
            }),
          });

          const data = await res.json();
            if (data.success) {
            const transaction = data.data;
            const tenantSettings = settings || getDefaultTenantSettings();
            const totalFormatted = formatCurrency(getTotal(), tenantSettings);
            
            // Print receipt if configured
            if (settings) {
              await printReceipt(transaction);
              
              // Open cash drawer if cash payment
              if (paymentMethod === 'cash') {
                await hardwareService.openCashDrawer();
              }
            }
            
            showToast.success(`${dict.pos.transactionCompleted} ${totalFormatted}`);
            setCart([]);
            setShowPaymentModal(false);
            setCashReceived('');
            setPaymentMethod('cash');
            setAppliedDiscount(null);
            setPromoCode('');
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
        discountCode: appliedDiscount?.code,
      });

      // Update local product stock (optimistic update) - only if tracking inventory
      for (const item of cart) {
        const product = products.find(p => p._id === item.productId);
        if (product && product.trackInventory !== false) {
          const newStock = product.stock - item.quantity;
          setProducts(products.map(p => 
            p._id === item.productId ? { ...p, stock: Math.max(0, newStock) } : p
          ));
          // Update cache
          await storage.updateProductStock(item.productId, newStock, tenant);
        }
      }

      const tenantSettings = settings || getDefaultTenantSettings();
      const totalFormatted = formatCurrency(getTotal(), tenantSettings);
      
      // Create transaction object for receipt printing (offline)
      const subtotal = getSubtotal();
      const discountAmount = appliedDiscount?.amount || 0;
      const offlineTransaction = {
        receiptNumber: `OFF-${Date.now()}`,
        date: formatDateTime(new Date(), tenantSettings),
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.price * item.quantity,
        })),
        subtotal,
        discountCode: appliedDiscount?.code,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        total: getTotal(),
        paymentMethod,
        cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : undefined,
        change: paymentMethod === 'cash' ? parseFloat(cashReceived) - getTotal() : undefined,
      };
      
      // Print receipt if configured (even for offline transactions)
      if (settings) {
        await printReceipt(offlineTransaction as Record<string, unknown>);
        
        // Open cash drawer if cash payment
        if (paymentMethod === 'cash') {
          await hardwareService.openCashDrawer();
        }
      }
      
      const message = isOnline 
        ? `${dict.pos.transactionCompleted} ${totalFormatted}`
        : `${dict.pos.transactionSavedOffline || 'Transaction saved offline'} ${totalFormatted}. ${dict.pos.willSyncWhenOnline || 'Will sync when connection is restored.'}`;
      
      showToast.success(message);
      setCart([]);
      setShowPaymentModal(false);
      setCashReceived('');
      setPaymentMethod('cash');
      setAppliedDiscount(null);
      setPromoCode('');
      
      // Refresh products if online
      if (isOnline) {
        fetchProducts();
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
      showToast.error(dict.pos.transactionError || 'Failed to process transaction');
    } finally {
      setProcessing(false);
    }
  };

  const clearCart = async () => {
    if (!dict) return;
    const confirmed = await confirm(
      dict.pos.clearCartConfirmTitle || 'Clear Cart',
      dict.pos.clearCartConfirm,
      { variant: 'warning' }
    );
    if (confirmed) {
      setCart([]);
      setAppliedDiscount(null);
      setPromoCode('');
      showToast.success(dict.pos.cartCleared || 'Cart cleared');
    }
  };

  const saveCart = async () => {
    if (!dict || cart.length === 0) return;
    if (!cartName.trim()) {
      showToast.error(dict.pos?.cartNameRequired || 'Please enter a name for this cart');
      return;
    }

    try {
      setSavingCart(true);
      const subtotal = getSubtotal();
      const total = getTotal();

      const res = await fetch('/api/saved-carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: cartName.trim(),
          items: cart,
          subtotal,
          discountCode: appliedDiscount?.code,
          discountAmount: appliedDiscount?.amount,
          total,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast.success(dict.pos?.cartSaved || 'Cart saved successfully');
        setShowSaveCartModal(false);
        setCartName('');
        loadSavedCarts();
      } else {
        showToast.error(data.error || dict.pos?.saveCartError || 'Failed to save cart');
      }
    } catch (error) {
      console.error('Error saving cart:', error);
      showToast.error(dict.pos?.saveCartError || 'Failed to save cart');
    } finally {
      setSavingCart(false);
    }
  };

  const loadSavedCarts = async () => {
    try {
      setLoadingSavedCarts(true);
      const res = await fetch('/api/saved-carts', {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setSavedCarts(data.data);
      }
    } catch (error) {
      console.error('Error loading saved carts:', error);
    } finally {
      setLoadingSavedCarts(false);
    }
  };

  const loadCart = async (savedCart: { items: Array<{ productId: { toString: () => string }; name: string; price: number; quantity: number }>; discountCode?: string; discountAmount?: number }) => {
    if (!dict) return;
    
    if (cart.length > 0) {
      const confirmed = await confirm(
        dict.pos?.loadCartConfirmTitle || 'Load Saved Cart',
        dict.pos?.loadCartConfirm || 'Loading a saved cart will replace your current cart. Continue?',
        { variant: 'warning' }
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      // Restore cart items
      const restoredCart = savedCart.items.map((item: { productId: { toString: () => string }; name: string; price: number; quantity: number; stock?: number }) => ({
        productId: item.productId.toString(),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        stock: item.stock ?? 0,
      }));

      setCart(restoredCart);
      
      // Restore discount if applicable
      if (savedCart.discountCode && savedCart.discountAmount) {
        setAppliedDiscount({
          code: savedCart.discountCode,
          amount: savedCart.discountAmount,
        });
      } else {
        setAppliedDiscount(null);
      }
      
      setPromoCode('');
      setShowSavedCartsModal(false);
      
      // Refresh products to get current stock
      fetchProducts();
      showToast.success(dict.pos?.cartLoaded || 'Cart loaded successfully');
    } catch (error) {
      console.error('Error loading cart:', error);
      showToast.error(dict.pos?.loadCartError || 'Failed to load cart');
    }
  };

  const deleteSavedCart = async (cartId: string) => {
    if (!dict) return;
    const confirmed = await confirm(
      dict.pos?.deleteCartConfirmTitle || 'Delete Saved Cart',
      dict.pos?.deleteCartConfirm || 'Are you sure you want to delete this saved cart?',
      { variant: 'danger' }
    );
    if (!confirmed) {
      return;
    }

    try {
      const res = await fetch(`/api/saved-carts/${cartId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        showToast.success(dict.pos?.cartDeleted || 'Cart deleted successfully');
        loadSavedCarts();
      } else {
        showToast.error(data.error || dict.pos?.deleteCartError || 'Failed to delete cart');
      }
    } catch (error) {
      console.error('Error deleting cart:', error);
      showToast.error(dict.pos?.deleteCartError || 'Failed to delete cart');
    }
  };

  const handleTogglePin = async (productId: string, currentPinned: boolean) => {
    try {
      // Optimistic update
      const newPinnedStatus = !currentPinned;
      setProducts(prev => prev.map(p => 
        p._id === productId ? { ...p, pinned: newPinnedStatus } : p
      ));

      const res = await fetch(`/api/products/${productId}/pin?tenant=${tenant}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        // Update cache with the new data - convert to CachedProduct format
        const storage = await getOfflineStorage();
        const cached = await storage.getCachedProducts(tenant);
        const updatedCache = cached.map((p) => {
          if (p._id === productId) {
            return { ...p, pinned: newPinnedStatus };
          }
          return p;
        });
        // cacheProducts will add tenant and lastUpdated automatically
        await storage.cacheProducts(updatedCache, tenant);
      } else {
        // Revert optimistic update on error
        setProducts(prev => prev.map(p => 
          p._id === productId ? { ...p, pinned: currentPinned } : p
        ));
        showToast.error(data.error || dict?.common?.failedToTogglePin || 'Failed to toggle pin status');
      }
    } catch (error) {
      // Revert optimistic update on error
      setProducts(prev => prev.map(p => 
        p._id === productId ? { ...p, pinned: currentPinned } : p
      ));
      console.error('Error toggling pin:', error);
      showToast.error(dict?.common?.failedToTogglePin || 'Failed to toggle pin status');
    }
  };

  // Print receipt helper
  const printReceipt = async (transaction: Record<string, unknown>) => {
    if (!settings) return;

    const receiptNumber = typeof transaction.receiptNumber === 'string' ? transaction.receiptNumber : (typeof transaction._id === 'string' ? transaction._id.slice(-8) : 'N/A');
    const date = typeof transaction.date === 'string' ? transaction.date : formatDateTime(new Date(typeof transaction.createdAt === 'string' || typeof transaction.createdAt === 'number' ? transaction.createdAt : Date.now()), settings || getDefaultTenantSettings());
    const items = Array.isArray(transaction.items) ? transaction.items : [];
    const subtotal = typeof transaction.subtotal === 'number' ? transaction.subtotal : (typeof transaction.total === 'number' ? transaction.total : 0);
    const total = typeof transaction.total === 'number' ? transaction.total : 0;
    const discountAmount = typeof transaction.discountAmount === 'number' ? transaction.discountAmount : undefined;
    
    const receiptData = {
      storeName: settings.companyName,
      address: settings.address ? 
        `${settings.address.street || ''}, ${settings.address.city || ''}, ${settings.address.state || ''} ${settings.address.zipCode || ''}`.trim() : 
        undefined,
      phone: settings.phone,
      receiptNumber,
      date,
      items,
      subtotal,
      discount: discountAmount,
      discountAmount,
      tax: settings.taxEnabled && settings.taxRate ? 
        (subtotal - (discountAmount || 0)) * (settings.taxRate / 100) : 
        undefined,
      total,
      paymentMethod: typeof transaction.paymentMethod === 'string' ? transaction.paymentMethod : 'cash',
      cashReceived: typeof transaction.cashReceived === 'number' ? transaction.cashReceived : undefined,
      change: typeof transaction.change === 'number' ? transaction.change : undefined,
      footer: settings.receiptFooter,
    };

    try {
      await hardwareService.printReceipt(receiptData);
    } catch (error) {
      console.error('Failed to print receipt:', error);
    }
  };

  if (!dict) {
    return <div className="text-center py-12">{dict?.common?.loading || 'Loading...'}</div>;
  }

  return (
    <div className="min-h-screen">
      <OfflineIndicator />
      <BarcodeScanner onScan={handleBarcodeScan} enabled={true} />
      {showQRScanner && (
        <QRCodeScanner 
          onScan={handleQRScan} 
          onClose={() => setShowQRScanner(false)}
          enabled={true}
        />
      )}
      <Navbar />
      <div className="fixed bottom-4 right-4 z-40">
        <HardwareStatusChecker compact={true} autoRefresh={true} />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Mobile: Cart first (sticky at top), then products below */}
        {/* Desktop: Products left, Cart right */}
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Cart Section - Mobile: First, Desktop: Right */}
          <div className="lg:col-span-1 order-1 lg:order-2">
            <div className="bg-white border border-gray-300 p-5 sm:p-6 lg:sticky lg:top-20 flex flex-col h-full max-h-[calc(100vh-6rem)]">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {dict.pos.cart}
                  {cart.length > 0 && (
                    <span className="ml-2 px-2.5 py-1 bg-blue-600 text-white text-xs font-bold border border-blue-700">
                      {cart.length}
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-1.5">
                  {cart.length > 0 && (
                    <>
                      <button
                        onClick={() => setShowSaveCartModal(true)}
                        className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
                        title={dict.pos?.saveCart || 'Save Cart'}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                      </button>
                      <button
                        onClick={clearCart}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                        title={dict.common.clear}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setShowSavedCartsModal(true);
                      loadSavedCarts();
                    }}
                    className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                    title={dict.pos?.loadCart || 'Load Saved Cart'}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </button>
                </div>
              </div>

              {cart.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12 text-gray-500">
                  <div className="text-center">
                    <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-base font-medium">{dict.pos.cartEmpty}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-3 mb-4">
                    {cart.map((item) => (
                      <div key={item.productId} className="bg-gray-50 p-4 border border-gray-300 hover:border-gray-400 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="font-semibold text-gray-900 text-base mb-1">{item.name}</div>
                            <div className="text-sm text-gray-500">
                              <Currency amount={item.price} /> {dict.pos.each}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.productId)}
                            className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors flex-shrink-0"
                            aria-label={dict?.pos?.removeItem || 'Remove item'}
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center border-2 border-gray-300 overflow-hidden bg-white">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                              className="px-3 py-2 hover:bg-gray-100 active:bg-gray-200 font-bold text-lg transition-colors"
                              aria-label={dict?.pos?.decreaseQuantity || 'Decrease quantity'}
                            >
                              −
                            </button>
                            <span className="px-4 py-2 min-w-[3rem] text-center font-semibold text-base bg-white">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                              className="px-3 py-2 hover:bg-gray-100 active:bg-gray-200 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              disabled={(() => {
                                const product = products.find(p => p._id === item.productId);
                                const canSellOutOfStock = product?.allowOutOfStockSales === true;
                                const trackInventory = product?.trackInventory !== false;
                                return trackInventory && !canSellOutOfStock && item.quantity >= item.stock;
                              })()}
                              aria-label={dict?.pos?.increaseQuantity || 'Increase quantity'}
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

                  {/* Discount Section */}
                  <div className="border-t border-gray-200 pt-4 mt-auto">
                    {!appliedDiscount ? (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {dict.pos.promoCode}
                        </label>
                        <div className="flex gap-2 items-stretch">
                          <input
                            type="text"
                            placeholder={dict.pos.promoCode || 'Enter promo code'}
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                            onKeyPress={(e) => e.key === 'Enter' && applyDiscount()}
                            className="flex-1 min-w-0 px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white transition-all placeholder:text-gray-400"
                          />
                          <button
                            type="button"
                            onClick={applyDiscount}
                            disabled={!promoCode.trim()}
                            className="p-3 bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 border border-green-700 flex items-center justify-center flex-shrink-0"
                            title={dict.pos.applyDiscount || 'Apply Discount'}
                          >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <div className="text-sm font-bold text-green-800">{dict.pos.discountApplied}</div>
                            </div>
                            <div className="text-sm text-green-700 font-medium ml-7">
                              {appliedDiscount.code}
                              {appliedDiscount.name && (
                                <span className="text-green-600"> - {appliedDiscount.name}</span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={removeDiscount}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors flex-shrink-0"
                            title={dict.pos.removeDiscount}
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-300 pt-4 mt-4 bg-gray-50 -mx-5 sm:-mx-6 px-5 sm:px-6 pb-5 sm:pb-6">
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">{dict.pos.subtotal}:</span>
                        <span className="font-semibold text-gray-900">
                          <Currency amount={getSubtotal()} />
                        </span>
                      </div>
                      {appliedDiscount && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">{dict.pos.discount}:</span>
                          <span className="font-semibold text-green-600">
                            -<Currency amount={appliedDiscount.amount} />
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between items-center mb-4 pt-3 border-t-2 border-gray-300">
                      <span className="text-lg sm:text-xl font-bold text-gray-900">{dict.common.total}:</span>
                      <span className="text-2xl sm:text-3xl font-bold text-blue-600">
                        <Currency amount={getTotal()} />
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={processing}
                      className="w-full bg-blue-600 text-white py-4 font-bold hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 text-lg border border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {processing ? (
                        <>
                          <div className="animate-spin h-6 w-6 border-b-2 border-white"></div>
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder={dict.pos.searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-4 py-3 pl-11 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
                  />
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  onClick={() => setShowQRScanner(true)}
                  className="px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 transition-colors border border-blue-700"
                  title="Scan QR Code"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </button>
                <button
                  onClick={toggleFullscreen}
                  className={`px-4 py-3 transition-colors border ${
                    isFullscreen
                      ? 'bg-green-600 text-white hover:bg-green-700 border-green-700'
                      : 'bg-gray-600 text-white hover:bg-gray-700 border-gray-700'
                  }`}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                >
                  {isFullscreen ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6h12v12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setShowRefundModal(true)}
                  className="px-4 py-3 bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700"
                  title={dict.pos.refunds}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <div key={i} className="bg-white border border-gray-300 p-5 animate-pulse">
                    <div className="h-6 bg-gray-200 w-3/4 mb-3"></div>
                    <div className="h-4 bg-gray-200 w-1/2 mb-3"></div>
                    <div className="h-8 bg-gray-200 w-20 mb-4"></div>
                    <div className="h-8 bg-gray-200 w-full"></div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 bg-white border border-gray-300">
                <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-gray-500 text-lg">{dict.common.noResults}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...products]
                  .sort((a, b) => {
                    // Pinned products first
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    return 0;
                  })
                  .map((product) => (
                  <div
                    key={product._id}
                    className={`bg-white border border-gray-300 p-5 hover:border-gray-400 transition-all duration-200 relative ${
                      product.stock === 0 && !product.allowOutOfStockSales ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex flex-col h-full">
                      <div className="flex-1">
                        <div className="flex items-start gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900 text-lg line-clamp-2 flex-1">
                            {product.name}
                          </h3>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleTogglePin(product._id, product.pinned || false);
                            }}
                            className={`p-1.5 transition-all duration-200 flex-shrink-0 mt-0.5 flex items-center justify-center border ${
                              product.pinned
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-300'
                                : 'bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 border-gray-300'
                            }`}
                            title={product.pinned ? 'Unpin Product' : 'Pin Product'}
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12M8.5,12V4H15.5V12L17.5,14H14.3V20H9.7V14H6.5L8.5,12Z"/>
                            </svg>
                          </button>
                        </div>
                        {product.category && (
                          <p className="text-xs text-gray-500 mb-3">
                            {product.category}
                          </p>
                        )}
                        <div className="mb-3">
                          <span
                            className={`inline-block text-xs font-semibold px-3 py-1.5 border ${
                              product.stock > 10
                                ? 'bg-green-100 text-green-800 border-green-300'
                                : product.stock > 0
                                ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                : 'bg-red-100 text-red-800 border-red-300'
                            }`}
                          >
                            {product.stock} {dict.pos.inStock}
                          </span>
                        </div>
                        <div className="font-bold text-blue-600 text-2xl mb-4">
                          <Currency amount={product.price} />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={product.stock === 0 && !product.allowOutOfStockSales}
                        onClick={() => {
                          if (product.stock > 0 || product.allowOutOfStockSales) {
                            addToCart(product);
                          }
                        }}
                        className={`w-full px-4 py-3 font-medium text-sm transition-all duration-200 ${
                          product.stock > 0 || product.allowOutOfStockSales
                            ? 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                        }`}
                      >
                        {product.stock > 0 || product.allowOutOfStockSales 
                          ? dict.common.add 
                          : dict.pos.outOfStock}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div 
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
          onClick={() => {
            setShowPaymentModal(false);
            setCashReceived('');
          }}
        >
          <div 
            className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{dict.pos.payment}</h2>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setCashReceived('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
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
                        className={`px-3 sm:px-4 py-2.5 border-2 font-medium text-sm sm:text-base transition-all duration-200 ${
                          paymentMethod === method
                            ? 'bg-blue-600 text-white border-blue-700'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
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
                      className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full sm:w-auto px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors bg-white"
              >
                {dict.common.cancel}
              </button>
              <button
                type="button"
                onClick={processPayment}
                disabled={processing || (paymentMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < getTotal()))}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors border border-blue-700"
              >
                {processing ? dict.pos.processing : dict.pos.completePayment}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div 
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
          onClick={() => {
            setShowRefundModal(false);
            setRefundTransactionId('');
            setRefundTransaction(null);
            setRefundItems({});
            setRefundReason('');
            setRefundNotes('');
          }}
        >
          <div 
            className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{dict.pos.refundTransaction}</h2>
              <button
                onClick={() => {
                  setShowRefundModal(false);
                  setRefundTransactionId('');
                  setRefundTransaction(null);
                  setRefundItems({});
                  setRefundReason('');
                  setRefundNotes('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            
            {!refundTransaction ? (
              <div>
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict.pos.transactionId} / {dict.pos.receiptNumber}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={refundTransactionId}
                      onChange={(e) => setRefundTransactionId(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && lookupTransaction()}
                      className="flex-1 px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={dict.pos.transactionId}
                    />
                    <button
                      type="button"
                      onClick={lookupTransaction}
                      disabled={!refundTransactionId.trim()}
                      className="px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors border border-blue-700"
                    >
                      {dict.pos.lookupTransaction}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRefundModal(false);
                      setRefundTransactionId('');
                    }}
                    className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors bg-white"
                  >
                    {dict.common.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-5 p-4 bg-gray-50 border border-gray-300">
                  <div className="text-sm text-gray-600 mb-1">{dict.pos.receiptNumber}</div>
                  <div className="font-semibold text-lg">{typeof refundTransaction.receiptNumber === 'string' ? refundTransaction.receiptNumber : (typeof refundTransaction._id === 'string' ? refundTransaction._id : 'N/A')}</div>
                  <div className="text-sm text-gray-600 mt-2">
                    {formatDateTime(new Date(typeof refundTransaction.createdAt === 'string' || typeof refundTransaction.createdAt === 'number' ? refundTransaction.createdAt : Date.now()), settings || getDefaultTenantSettings())}
                  </div>
                  <div className="text-sm text-gray-600">
                    {dict.common.total}: <Currency amount={typeof refundTransaction.total === 'number' ? refundTransaction.total : 0} />
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict.pos.selectItemsToRefund}
                  </label>
                  <div className="space-y-3 max-h-64 overflow-y-auto border border-gray-300 p-3">
                    {(Array.isArray(refundTransaction.items) ? refundTransaction.items : []).map((item: { product: { toString: () => string }; name: string; quantity: number; price: number }) => {
                      const productId = item.product.toString();
                      const maxQty = item.quantity;
                      const currentQty = refundItems[productId] || 0;
                      
                      return (
                        <div key={productId} className="flex items-center justify-between p-2 hover:bg-gray-50 border-b border-gray-200 last:border-b-0">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{item.name}</div>
                            <div className="text-sm text-gray-500">
                              {dict.pos.each}: <Currency amount={item.price} /> × {maxQty} {dict.common.items}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setRefundItems({ ...refundItems, [productId]: Math.max(0, currentQty - 1) })}
                              className="px-3 py-1 border border-gray-300 hover:bg-gray-100"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={maxQty}
                              value={currentQty}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(maxQty, parseInt(e.target.value) || 0));
                                setRefundItems({ ...refundItems, [productId]: val });
                              }}
                              className="w-16 px-2 py-1 text-center border border-gray-300"
                            />
                            <button
                              type="button"
                              onClick={() => setRefundItems({ ...refundItems, [productId]: Math.min(maxQty, currentQty + 1) })}
                              className="px-3 py-1 border border-gray-300 hover:bg-gray-100"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => setRefundItems({ ...refundItems, [productId]: maxQty })}
                              className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200"
                            >
                              {dict.pos.fullRefund}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict.pos.refundReason}
                  </label>
                  <input
                    type="text"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={dict?.pos?.refundReasonPlaceholder || 'Reason for refund'}
                  />
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict.pos.refundNotes}
                  </label>
                  <textarea
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={dict?.pos?.refundNotesPlaceholder || 'Additional notes'}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRefundModal(false);
                      setRefundTransaction(null);
                      setRefundTransactionId('');
                      setRefundItems({});
                      setRefundReason('');
                      setRefundNotes('');
                    }}
                    className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors bg-white"
                  >
                    {dict.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={processRefund}
                    disabled={processingRefund || Object.values(refundItems).every(qty => qty === 0)}
                    className="px-4 py-2.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors border border-red-700"
                  >
                    {processingRefund ? dict.pos.processing : dict.pos.processRefund}
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Save Cart Modal */}
      {showSaveCartModal && (
        <div 
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
          onClick={() => {
            setShowSaveCartModal(false);
            setCartName('');
          }}
        >
          <div 
            className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                {dict.pos?.saveCart || 'Save Cart'}
              </h2>
              <button
                onClick={() => {
                  setShowSaveCartModal(false);
                  setCartName('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dict.pos?.cartName || 'Cart Name'}
              </label>
              <input
                type="text"
                value={cartName}
                onChange={(e) => setCartName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && saveCart()}
                className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={dict.pos?.cartNamePlaceholder || 'Enter a name for this cart'}
                autoFocus
              />
              <p className="text-sm text-gray-500 mt-2">
                {dict.pos?.cartNameHint || 'This cart will be saved for later processing'}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSaveCartModal(false);
                  setCartName('');
                }}
                className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors bg-white"
              >
                {dict.common.cancel}
              </button>
              <button
                type="button"
                onClick={saveCart}
                disabled={savingCart || !cartName.trim()}
                className="px-4 py-2.5 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors border border-green-700"
              >
                {savingCart ? (dict.common.saving || 'Saving...') : (dict.common.save || 'Save')}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Load Saved Carts Modal */}
      {showSavedCartsModal && (
        <div 
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
          onClick={() => setShowSavedCartsModal(false)}
        >
          <div 
            className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                {dict.pos?.savedCarts || 'Saved Carts'}
              </h2>
              <button
                onClick={() => setShowSavedCartsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">

            {loadingSavedCarts ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600">{dict.common.loading || 'Loading...'}</p>
              </div>
            ) : savedCarts.length === 0 ? (
              <div className="text-center py-12">
                <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-gray-500 text-lg">{dict.pos?.noSavedCarts || 'No saved carts found'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedCarts.map((savedCart) => (
                  <div
                    key={typeof savedCart._id === 'string' ? savedCart._id : String(savedCart._id || Math.random())}
                    className="border-2 border-gray-300 p-4 hover:border-blue-500 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 text-lg mb-1">{typeof savedCart.name === 'string' ? savedCart.name : 'Unnamed Cart'}</h3>
                        <p className="text-sm text-gray-500">
                          {formatDateTime(new Date(typeof savedCart.createdAt === 'string' || typeof savedCart.createdAt === 'number' ? savedCart.createdAt : Date.now()), settings || getDefaultTenantSettings())}
                        </p>
                        <p className="text-sm text-gray-600 mt-2">
                          {Array.isArray(savedCart.items) ? savedCart.items.length : 0} {(Array.isArray(savedCart.items) ? savedCart.items.length : 0) === 1 ? (dict.pos?.item || 'item') : (dict.pos?.items || 'items')}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-blue-600 mb-2">
                          <Currency amount={typeof savedCart.total === 'number' ? savedCart.total : 0} />
                        </div>
                        {typeof savedCart.discountCode === 'string' && savedCart.discountCode && (
                          <div className="text-xs text-green-600">
                            {dict.pos?.discount || 'Discount'}: {savedCart.discountCode}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadCart(savedCart as { items: Array<{ productId: { toString: () => string }; name: string; price: number; quantity: number }>; discountCode?: string; discountAmount?: number })}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors border border-blue-700"
                      >
                        {dict.pos?.loadCart || 'Load Cart'}
                      </button>
                      <button
                        onClick={() => deleteSavedCart(typeof savedCart._id === 'string' ? savedCart._id : String(savedCart._id || ''))}
                        className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 font-medium transition-colors border border-red-700"
                        title={dict.pos?.deleteCart || 'Delete Cart'}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

