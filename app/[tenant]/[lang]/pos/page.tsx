'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import OfflineIndicator from '@/components/OfflineIndicator';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getOfflineStorage } from '@/lib/offline-storage';
import dynamic from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading scanner...</div>,
});
const QRCodeScanner = dynamic(() => import('@/components/QRCodeScanner'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading scanner...</div>,
});

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
  barcode?: string;
  category?: string;
  image?: string;
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

type PaymentMethod = 'cash' | 'card' | 'tap_to_pay' | 'digital_wallet' | 'qr_code' | 'bnpl';

type BusinessType = 'retail' | 'restaurant' | 'general' | 'laundry' | 'service';

interface RefundTransactionItem {
  product: string | { toString(): string };
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface RefundTransaction {
  _id: string;
  receiptNumber?: string;
  status: 'completed' | 'cancelled' | 'refunded';
  total: number;
  items: RefundTransactionItem[];
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  createdAt: string;
}

interface SavedCartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
}

interface SavedCart {
  _id: string;
  name: string;
  items: SavedCartItem[];
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  total: number;
  createdAt: string;
}

interface CachedProduct {
  _id: string;
  name: string;
  price: number;
  stock: number;
  sku?: string;
  barcode?: string;
  category?: string;
  image?: string;
  pinned?: boolean;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
  tenant: string;
  lastUpdated: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dict = any;

export default function POSPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [paymentProvider, setPaymentProvider] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [bnplProvider, setBnplProvider] = useState('');
  const [installmentTerms, setInstallmentTerms] = useState<number | ''>('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [dict, setDict] = useState<Dict>(null);
  const { isOnline } = useNetworkStatus(tenant);
  const { settings } = useTenantSettings();
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; name?: string } | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundTransactionId, setRefundTransactionId] = useState('');
  const [refundTransaction, setRefundTransaction] = useState<RefundTransaction | null>(null);
  const [refundItems, setRefundItems] = useState<Record<string, number>>({});
  const [refundReason, setRefundReason] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [showSavedCartsModal, setShowSavedCartsModal] = useState(false);
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);
  const [loadingSavedCarts, setLoadingSavedCarts] = useState(false);
  const [savingCart, setSavingCart] = useState(false);
  const [showSaveCartModal, setShowSaveCartModal] = useState(false);
  const [cartName, setCartName] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [lookingUpRefund, setLookingUpRefund] = useState(false);
  // Separate input state for search so debounce doesn't lag the controlled input
  const [searchInput, setSearchInput] = useState('');
  const { confirm, Dialog: confirmDialog } = useConfirm();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Prevents concurrent processPayment calls (double-tap protection)
  const processingRef = useRef(false);
  // Debounce timer for search
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  // ── Business-type config ────────────────────────────────────────
  const businessType = useMemo((): BusinessType => {
    const raw = (settings?.businessType ?? 'general').toLowerCase().trim();
    const valid: BusinessType[] = ['retail', 'restaurant', 'general', 'laundry', 'service'];
    return valid.includes(raw as BusinessType) ? (raw as BusinessType) : 'general';
  }, [settings?.businessType]);

  const posConfig = useMemo(() => {
    type Config = {
      icon: string;
      itemsLabel: string;
      cartLabel: string;
      checkoutLabel: string;
      emptyCartHint: string;
      searchPlaceholder: string;
      showBarcodeScanner: boolean;
      showStockBadge: boolean;
      showScPwdDiscounts: boolean;
    };
    const configs: Record<BusinessType, Config> = {
      retail: {
        icon: '🏪',
        itemsLabel: 'Products',
        cartLabel: dict?.pos?.cart || 'Cart',
        checkoutLabel: dict?.pos?.checkout || 'Checkout',
        emptyCartHint: 'Scan or tap a product to add it',
        searchPlaceholder: dict?.pos?.searchPlaceholder || 'Search products…',
        showBarcodeScanner: true,
        showStockBadge: true,
        showScPwdDiscounts: true,
      },
      restaurant: {
        icon: '🍽️',
        itemsLabel: 'Menu',
        cartLabel: 'Order',
        checkoutLabel: 'Place Order',
        emptyCartHint: 'Tap a menu item to add it to the order',
        searchPlaceholder: 'Search menu…',
        showBarcodeScanner: false,
        showStockBadge: false,
        showScPwdDiscounts: true,
      },
      general: {
        icon: '🏬',
        itemsLabel: 'Items',
        cartLabel: dict?.pos?.cart || 'Cart',
        checkoutLabel: dict?.pos?.checkout || 'Checkout',
        emptyCartHint: 'Tap an item to add it',
        searchPlaceholder: dict?.pos?.searchPlaceholder || 'Search items…',
        showBarcodeScanner: true,
        showStockBadge: false,
        showScPwdDiscounts: true,
      },
      laundry: {
        icon: '🧺',
        itemsLabel: 'Services',
        cartLabel: 'Ticket',
        checkoutLabel: 'Create Order',
        emptyCartHint: 'Select a laundry service',
        searchPlaceholder: 'Search services…',
        showBarcodeScanner: false,
        showStockBadge: false,
        showScPwdDiscounts: false,
      },
      service: {
        icon: '🔧',
        itemsLabel: 'Services',
        cartLabel: 'Job',
        checkoutLabel: 'Book & Pay',
        emptyCartHint: 'Tap a service to add it',
        searchPlaceholder: 'Search services…',
        showBarcodeScanner: false,
        showStockBadge: false,
        showScPwdDiscounts: true,
      },
    };
    return configs[businessType];
  }, [businessType, dict]);

  // Max limits
  const MAX_QUANTITY = 9999;
  const MAX_PROMO_CODE_LENGTH = 50;
  const MAX_REFUND_NOTES_LENGTH = 500;
  const MAX_SEARCH_LENGTH = 100;

  // Fetch with timeout
  const fetchWithTimeout = useCallback(async (url: string, options?: RequestInit, timeoutMs = 15000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }, []);

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

  // Esc key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPaymentModal) {
          setShowPaymentModal(false);
          resetPaymentState();
        } else if (showRefundModal) {
          setShowRefundModal(false);
        } else if (showSavedCartsModal) {
          setShowSavedCartsModal(false);
        } else if (showSaveCartModal) {
          setShowSaveCartModal(false);
        } else if (showQRScanner) {
          setShowQRScanner(false);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaymentModal, showRefundModal, showSavedCartsModal, showSaveCartModal, showQRScanner]);


  // Initialize hardware services
  useEffect(() => {
    if (settings) {
      // Prefer localStorage (set by hardware admin page or standalone hardware settings modal),
      // fall back to DB-saved settings.hardwareConfig so the POS works even without a prior
      // localStorage write.
      const hardwareConfigKey = `hardware_config_${tenant}`;
      const savedConfig = localStorage.getItem(hardwareConfigKey);
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          hardwareService.setConfig(config);
        } catch (error) {
          console.error('Failed to load hardware config:', error);
          if (settings.hardwareConfig) {
            hardwareService.setConfig(settings.hardwareConfig);
          }
        }
      } else if (settings.hardwareConfig) {
        hardwareService.setConfig(settings.hardwareConfig);
      }
    }
  }, [settings, tenant]);

  // Live clock
  useEffect(() => {
    const tick = () =>
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  // Redirect specialized business types to their dedicated POS pages
  useEffect(() => {
    if (businessType === 'laundry') router.replace(`/${tenant}/${lang}/laundry`);
    if (businessType === 'restaurant') router.replace(`/${tenant}/${lang}/restaurant`);
  }, [businessType, router, tenant, lang]);

  // Refocus search box whenever any modal closes
  useEffect(() => {
    if (!showPaymentModal && !showQRScanner && !showRefundModal && !showSavedCartsModal && !showSaveCartModal) {
      searchInputRef.current?.focus();
    }
  }, [showPaymentModal, showQRScanner, showRefundModal, showSavedCartsModal, showSaveCartModal]);

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
    const code = barcode.trim();
    if (!code) return;
    // Match against barcode field, SKU, or _id
    const product = products.find(
      p => p.barcode === code || p.sku === code || p._id === code
    );
    // Clear any text that the scanner may have typed into the search box
    setSearchInput('');
    setSearch('');
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
          const res = await fetchWithTimeout(`/api/products?search=${encodeURIComponent(search)}&tenant=${tenant}`);
          const data = await res.json();
          if (data.success) {
            setProducts(data.data);
            // Cache products and discounts for offline use
            const storage = await getOfflineStorage();
            await storage.cacheProducts(data.data, tenant);
            // Pre-cache active discounts for offline validation
            try {
              const discountRes = await fetch(`/api/discounts?tenant=${tenant}`);
              const discountData = await discountRes.json();
              if (discountData.success && discountData.data) {
                await storage.cacheDiscounts(discountData.data, tenant);
              }
            } catch {
              // Discount cache is best-effort — don't fail product load
            }
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
  }, [search, tenant, isOnline, loadCachedProducts, fetchWithTimeout]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const updateQuantity = (productId: string, quantity: number) => {
    if (!dict) return;
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    if (quantity > MAX_QUANTITY) {
      showToast.error(dict.pos?.maxQuantityReached || `Maximum quantity is ${MAX_QUANTITY}`);
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

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const taxAmount = useMemo(() => {
    if (!settings?.taxEnabled || !settings?.taxRate) return 0;
    const discount = appliedDiscount?.amount || 0;
    const taxable = Math.max(0, subtotal - discount);
    return Math.round(taxable * (settings.taxRate / 100) * 100) / 100;
  }, [settings, subtotal, appliedDiscount]);

  const total = useMemo(() => {
    const discount = appliedDiscount?.amount || 0;
    const afterDiscount = Math.max(0, subtotal - discount);
    return Math.round((afterDiscount + taxAmount) * 100) / 100;
  }, [subtotal, taxAmount, appliedDiscount]);

  // Stable aliases for use inside async callbacks (values are always current via closure)
  const getSubtotal = useCallback(() => subtotal, [subtotal]);
  const getTotal = useCallback(() => total, [total]);

  // Consolidated payment field reset — used in every modal close and post-payment path
  const resetPaymentState = useCallback(() => {
    setCashReceived('');
    setPaymentMethod('cash');
    setPaymentProvider('');
    setPaymentReference('');
    setBnplProvider('');
    setInstallmentTerms('');
  }, []);

  // Memoized sorted product list — avoids re-sorting on every render
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [products]);

  // Unique categories derived from products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [products]);

  // Products filtered by selected category (applied on top of sortedProducts)
  const filteredProducts = useMemo(() => {
    if (!selectedCategory) return sortedProducts;
    return sortedProducts.filter(p => p.category === selectedCategory);
  }, [sortedProducts, selectedCategory]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch { /* fullscreen not supported */ }
  }, []);

  const handleExitPOS = useCallback(async () => {
    if (cart.length > 0) {
      const confirmed = await confirm(
        dict?.pos?.exitPosTitle || 'Exit POS',
        dict?.pos?.exitPosConfirm || 'You have items in your cart. Are you sure you want to exit?',
        { variant: 'warning' }
      );
      if (!confirmed) return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch { /* ignore */ }
    router.push(`/${tenant}/${lang}`);
  }, [cart.length, confirm, dict, router, tenant, lang]);

  // Debounced search handler — updates `search` (which drives fetchProducts) 300 ms after typing stops
  const handleSearchChange = useCallback((value: string) => {
    const trimmed = value.slice(0, MAX_SEARCH_LENGTH);
    setSearchInput(trimmed);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(trimmed), 300);
  }, []);

  const applyDiscount = async () => {
    if (!dict || !promoCode.trim() || applyingDiscount) return;

    setApplyingDiscount(true);
    try {
      const currentSubtotal = subtotal;

      // Try online validation first
      if (navigator.onLine) {
        const res = await fetchWithTimeout(`/api/discounts/validate?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: promoCode, subtotal: currentSubtotal }),
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
          return;
        } else {
          showToast.error(data.error || dict.pos.invalidDiscountCode);
          return;
        }
      }

      // Offline fallback: validate against cached discounts
      const storage = await getOfflineStorage();
      const cachedDiscount = await storage.getCachedDiscountByCode(promoCode.toUpperCase(), tenant);

      if (cachedDiscount) {
        // Basic offline validation
        const now = new Date();
        const validFrom = cachedDiscount.validFrom || cachedDiscount.startDate;
        const validUntil = cachedDiscount.validUntil || cachedDiscount.endDate;
        if (validFrom && new Date(validFrom) > now) {
          showToast.error(dict.pos.invalidDiscountCode || 'Discount not yet active');
          return;
        }
        if (validUntil && new Date(validUntil) < now) {
          showToast.error(dict.pos.invalidDiscountCode || 'Discount expired');
          return;
        }
        if (cachedDiscount.minPurchaseAmount && currentSubtotal < cachedDiscount.minPurchaseAmount) {
          showToast.error(dict.pos.invalidDiscountCode || 'Minimum purchase not met');
          return;
        }

        let discountAmount = 0;
        if (cachedDiscount.type === 'percentage') {
          discountAmount = (currentSubtotal * cachedDiscount.value) / 100;
          if (cachedDiscount.maxDiscountAmount) {
            discountAmount = Math.min(discountAmount, cachedDiscount.maxDiscountAmount);
          }
        } else {
          discountAmount = cachedDiscount.value;
        }

        setAppliedDiscount({
          code: cachedDiscount.code,
          amount: Math.round(discountAmount * 100) / 100,
          name: cachedDiscount.name,
        });
        setPromoCode('');
        showToast.success((dict.pos.discountApplied || 'Discount applied') + ' (offline)');
      } else {
        showToast.error(dict.pos.invalidDiscountCode || 'Invalid discount code');
      }
    } catch (error) {
      console.error('Error applying discount:', error);
      showToast.error(dict.pos.invalidDiscountCode);
    } finally {
      setApplyingDiscount(false);
    }
  };

  const removeDiscount = () => {
    setAppliedDiscount(null);
    setPromoCode('');
  };

  const lookupTransaction = async () => {
    if (!dict || !refundTransactionId.trim() || lookingUpRefund) return;

    setLookingUpRefund(true);
    try {
      const res = await fetchWithTimeout(`/api/transactions/${refundTransactionId}?tenant=${tenant}`);
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
        setRefundTransaction(transaction as RefundTransaction);
        // Initialize refund items with all items at full quantity
        const items: Record<string, number> = {};
        (transaction.items as RefundTransactionItem[]).forEach((item) => {
          if (item.product) {
            items[item.product.toString()] = item.quantity;
          }
        });
        setRefundItems(items);
      } else {
        showToast.error(data.error || dict.pos.noTransactionFound);
      }
    } catch (error) {
      console.error('Error looking up transaction:', error);
      showToast.error(dict.pos.noTransactionFound);
    } finally {
      setLookingUpRefund(false);
    }
  };

  const processRefund = async () => {
    if (!dict || !refundTransaction) return;

    const selectedItems = Object.entries(refundItems)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    if (selectedItems.length === 0) {
      showToast.error(dict.pos.selectAtLeastOneItem);
      return;
    }

    setProcessingRefund(true);
    try {
      const res = await fetchWithTimeout(`/api/transactions/${refundTransaction._id}/refund?tenant=${tenant}`, {
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
    // Double-submit guard
    if (processingRef.current) return;

    if (paymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      if (isNaN(cash) || cash < total) {
        showToast.error(dict.pos.insufficientCash);
        return;
      }
    }

    processingRef.current = true;
    setProcessing(true);
    try {
      if (isOnline) {
        // Try to process online
        try {
          const res = await fetchWithTimeout(`/api/transactions?tenant=${tenant}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: cart.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
              paymentMethod,
              cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : undefined,
              paymentProvider: paymentProvider || undefined,
              paymentReference: paymentReference || undefined,
              bnplProvider: bnplProvider || undefined,
              installmentTerms: installmentTerms || undefined,
              discountCode: appliedDiscount?.code,
            }),
          }, 30000); // 30s timeout for transactions

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
            resetPaymentState();
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
        paymentProvider: paymentProvider || undefined,
        paymentReference: paymentReference || undefined,
        bnplProvider: bnplProvider || undefined,
        installmentTerms: installmentTerms ? String(installmentTerms) : undefined,
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
        total,
        paymentMethod,
        cashReceived: paymentMethod === 'cash' ? parseFloat(cashReceived) : undefined,
        change: paymentMethod === 'cash' ? parseFloat(cashReceived) - total : undefined,
      };

      // Print receipt if configured (even for offline transactions)
      if (settings) {
        await printReceipt(offlineTransaction);
        
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
      resetPaymentState();
      setAppliedDiscount(null);
      setPromoCode('');

      // Refresh products if online
      if (isOnline) {
        fetchProducts();
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
      showToast.error(dict.pos.transactionError || 'Failed to process transaction');
      // Reset payment method so next attempt starts fresh
      resetPaymentState();
    } finally {
      processingRef.current = false;
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

  const loadCart = async (savedCart: SavedCart) => {
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
      const restoredCart = savedCart.items.map((item) => ({
        productId: item.productId.toString(),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        stock: item.stock ?? 0,
      }));

      // Warn about items whose stock may have changed since the cart was saved
      const outOfStockItems = restoredCart.filter((item) => {
        const currentProduct = products.find((p) => p._id === item.productId);
        if (!currentProduct) return false;
        return currentProduct.trackInventory !== false
          && !currentProduct.allowOutOfStockSales
          && currentProduct.stock < item.quantity;
      });
      if (outOfStockItems.length > 0) {
        showToast.error(
          `${outOfStockItems.map((i) => i.name).join(', ')} — stock changed since cart was saved`
        );
      }

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
        const updatedCache = cached.map((p: CachedProduct) => {
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

    // Cast to a typed shape for safe property access
    const tx = transaction as {
      subtotal?: number; total?: number; discountAmount?: number;
      _id?: string; receiptNumber?: string; date?: string;
      createdAt?: string | number; items?: unknown[];
      paymentMethod?: string; cashReceived?: number; change?: number;
    };

    // Resolve the active receipt template HTML (if configured)
    const defaultTemplateId = settings.receiptTemplates?.default;
    const templateHtml = defaultTemplateId
      ? settings.receiptTemplates?.templates?.find((t) => t.id === defaultTemplateId)?.html
      : undefined;

    const addressStr = settings.address
      ? [settings.address.street, settings.address.city, settings.address.state, settings.address.zipCode]
          .filter(Boolean).join(', ')
      : undefined;
    const taxEnabled = settings.taxEnabled && settings.taxRate;
    const taxableBase = (tx.subtotal ?? tx.total ?? 0) - (tx.discountAmount ?? 0);
    const taxAmount = taxEnabled ? taxableBase * (settings.taxRate! / 100) : undefined;
    const isVAT = taxEnabled && (settings.taxLabel || '').toUpperCase().includes('VAT');
    const ptuDateStr = settings.birPtuIssuedDate
      ? new Date(settings.birPtuIssuedDate).toLocaleDateString()
      : undefined;

    const receiptData = {
      storeName: settings.companyName,
      address: addressStr,
      phone: settings.phone,
      logo: settings.receiptShowLogo !== false ? settings.logo : undefined,
      receiptNumber: tx.receiptNumber || tx._id?.slice(-8) || 'N/A',
      date: tx.date || formatDateTime(new Date(tx.createdAt ?? Date.now()), settings || getDefaultTenantSettings()),
      items: (tx.items || []) as Array<{ name: string; quantity: number; price: number; subtotal: number; sku?: string }>,
      subtotal: tx.subtotal ?? tx.total ?? 0,
      discount: tx.discountAmount ?? undefined,
      tax: taxAmount,
      taxLabel: settings.taxLabel,
      total: tx.total ?? 0,
      paymentMethod: tx.paymentMethod ?? '',
      cashReceived: tx.cashReceived,
      change: tx.change,
      footer: settings.receiptFooter,
      header: settings.receiptHeader,
      template: templateHtml,
      // BIR compliance
      tin: settings.birTin,
      businessStyle: settings.birBusinessStyle,
      ptuNumber: settings.birPtuNumber,
      ptuDate: ptuDateStr,
      minNumber: settings.birMinNumber,
      systemProvider: settings.birSystemProvider,
      isVAT: isVAT || false,
    };

    try {
      const printed = await hardwareService.printReceipt(receiptData);
      if (!printed) {
        showToast.error(dict?.pos?.printFailed || 'Receipt could not be printed. Check printer settings.');
      }
    } catch (error) {
      console.error('Failed to print receipt:', error);
      showToast.error(dict?.pos?.printFailed || 'Receipt could not be printed. Check printer settings.');
    }
  };

  if (!dict) {
    return <div className="text-center py-12">{dict?.common?.loading || 'Loading...'}</div>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">
      <OfflineIndicator />
      {posConfig.showBarcodeScanner && <BarcodeScanner onScan={handleBarcodeScan} enabled={true} />}
      {showQRScanner && (
        <QRCodeScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
          enabled={true}
        />
      )}

      {/* Navbar — hidden in fullscreen */}
      {!isFullscreen && <Navbar />}

      {/* ── Register Header Bar ── */}
      <header className="flex-shrink-0 bg-gray-900 text-white px-4 py-2 flex items-center justify-between gap-3 z-30">
        {/* Left: store name + clock */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 bg-blue-500 flex items-center justify-center flex-shrink-0 text-base leading-none">
            {posConfig.icon}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{settings?.companyName || 'POS Register'}</p>
            <p className="text-xs text-gray-400 leading-tight">{new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · {currentTime}</p>
          </div>
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Online/offline pill */}
          <div className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full mr-1 ${isOnline ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </div>

          {/* Refund */}
          <button
            onClick={() => setShowRefundModal(true)}
            className="p-2 rounded hover:bg-orange-500/20 text-orange-300 hover:text-orange-200 transition-colors"
            title={dict.pos.refunds}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>

          {/* Exit POS */}
          <button
            onClick={handleExitPOS}
            className="p-2 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title={dict?.pos?.exitPos || 'Exit POS'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Products Panel ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Search + actions bar */}
          <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 py-2.5 flex gap-2">
            <div className="relative flex-1">
              <input
                ref={searchInputRef}
                type="text"
                placeholder={posConfig.searchPlaceholder}
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                maxLength={MAX_SEARCH_LENGTH}
                autoFocus
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all outline-none"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {posConfig.showBarcodeScanner && (
              <button
                onClick={() => setShowQRScanner(true)}
                className="px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors flex-shrink-0"
                title="Scan QR / Barcode"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </button>
            )}
          </div>

          {/* Category filter tabs */}
          {categories.length > 0 && (
            <div className="flex-shrink-0 bg-white border-b border-gray-100 px-3 py-2 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap flex-shrink-0 transition-colors ${
                  !selectedCategory ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap flex-shrink-0 transition-colors ${
                    selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Product grid — scrollable */}
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="bg-white border border-gray-200 overflow-hidden animate-pulse">
                    <div className="h-28 bg-gray-100" />
                    <div className="p-3 space-y-2">
                      <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                      <div className="h-3 bg-gray-100 rounded w-1/3" />
                      <div className="flex justify-between items-end">
                        <div className="h-5 bg-gray-100 rounded w-14" />
                        <div className="h-4 bg-gray-100 rounded w-10" />
                      </div>
                      <div className="h-8 bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">{dict.common.noResults}</p>
                {selectedCategory && (
                  <button onClick={() => setSelectedCategory('')} className="mt-2 text-xs text-blue-600 hover:underline">
                    Clear filter
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                {filteredProducts.map((product) => (
                  <div
                    key={product._id}
                    onClick={() => { if (product.stock > 0 || product.allowOutOfStockSales) addToCart(product); }}
                    className={`bg-white border border-gray-200 hover:border-green-400 hover:shadow-md transition-all duration-150 relative overflow-hidden flex flex-col cursor-pointer group ${
                      product.stock === 0 && !product.allowOutOfStockSales ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {/* Pin button */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleTogglePin(product._id, product.pinned || false); }}
                      className={`absolute top-1.5 right-1.5 z-10 p-1 transition-all duration-150 rounded border shadow-sm ${
                        product.pinned
                          ? 'bg-amber-50 text-amber-600 border-amber-200'
                          : 'bg-white/80 text-gray-300 border-gray-200 opacity-0 group-hover:opacity-100'
                      }`}
                      title={product.pinned ? 'Unpin' : 'Pin to top'}
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12M8.5,12V4H15.5V12L17.5,14H14.3V20H9.7V14H6.5L8.5,12Z" />
                      </svg>
                    </button>

                    {/* Image */}
                    <div className="w-full h-24 bg-gray-50 overflow-hidden flex-shrink-0">
                      {product.image ? (
                        <img // eslint-disable-line
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                          <svg className="w-8 h-8 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-col flex-1 p-2.5 pt-2">
                      <p className="font-semibold text-gray-900 text-xs leading-4 line-clamp-2 min-h-[2rem] mb-1.5">
                        {product.name}
                      </p>

                      <div className="flex items-center justify-between gap-1 mt-auto">
                        <span className="font-bold text-blue-600 text-sm">
                          <Currency amount={product.price} />
                        </span>
                        {posConfig.showStockBadge && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                            product.stock > 10
                              ? 'bg-green-100 text-green-700'
                              : product.stock > 0
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-600'
                          }`}>
                            {product.stock > 0 ? `${product.stock}` : '0'} {dict.pos.inStock}
                          </span>
                        )}
                      </div>

                      {/* Add bar */}
                      <div className={`mt-2 w-full py-2 text-center text-xs font-bold tracking-wide transition-colors ${
                        product.stock > 0 || product.allowOutOfStockSales
                          ? 'bg-green-50 text-green-700 group-hover:bg-green-600 group-hover:text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {product.stock > 0 || product.allowOutOfStockSales ? `+ ${dict.common.add}` : dict.pos.outOfStock}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Cart Panel ── */}
        <div className="w-72 lg:w-80 xl:w-88 flex-shrink-0 flex flex-col bg-white border-l border-gray-200 shadow-xl">

          {/* Cart header */}
          <div className="flex-shrink-0 px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="font-bold text-gray-900 text-sm">{posConfig.cartLabel}</span>
              {cart.length > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {cart.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {cart.length > 0 && (
                <>
                  <button
                    onClick={() => setShowSaveCartModal(true)}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                    title={dict.pos?.saveCart || 'Save Cart'}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                  </button>
                  <button
                    onClick={clearCart}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title={dict.common.clear}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
              <button
                onClick={() => { setShowSavedCartsModal(true); loadSavedCarts(); }}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title={dict.pos?.loadCart || 'Load Saved Cart'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Cart items — scrollable */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm font-medium">{dict.pos.cartEmpty}</p>
                <p className="text-gray-300 text-xs mt-1">{posConfig.emptyCartHint}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {cart.map((item) => (
                  <div key={item.productId} className="px-3 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-semibold text-gray-900 text-xs leading-4 flex-1 min-w-0 truncate">
                        {item.name}
                      </p>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="p-0.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                        aria-label={dict?.pos?.removeItem || 'Remove'}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-gray-200 rounded overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="px-3 py-1.5 hover:bg-gray-100 active:bg-gray-200 text-gray-600 font-bold text-sm transition-colors leading-none"
                          aria-label={dict?.pos?.decreaseQuantity || '−'}
                        >
                          −
                        </button>
                        <span className="px-2.5 py-1 text-xs font-bold text-gray-900 bg-white min-w-[2rem] text-center tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          disabled={(() => {
                            const product = products.find(p => p._id === item.productId);
                            return (product?.trackInventory !== false) && !product?.allowOutOfStockSales && item.quantity >= item.stock;
                          })()}
                          className="px-3 py-1.5 hover:bg-gray-100 active:bg-gray-200 text-gray-600 font-bold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                          aria-label={dict?.pos?.increaseQuantity || '+'}
                        >
                          +
                        </button>
                      </div>
                      <span className="font-bold text-gray-900 text-xs tabular-nums">
                        <Currency amount={item.price * item.quantity} />
                      </span>
                    </div>
                    <p className="text-gray-400 text-[10px] mt-1"><Currency amount={item.price} /> {dict.pos.each}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Cart Footer: discount + totals + checkout ── */}
          <div className="flex-shrink-0 border-t border-gray-200">

            {/* Discount */}
            <div className="px-3 py-2.5 border-b border-gray-100">
              {!appliedDiscount ? (
                <div className="space-y-2">
                  {posConfig.showScPwdDiscounts && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={applyingDiscount || cart.length === 0}
                      onClick={async () => {
                        setApplyingDiscount(true);
                        try {
                          const currentSubtotal = getSubtotal();
                          let res = await fetchWithTimeout(`/api/discounts/validate?tenant=${tenant}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code: 'SC20', subtotal: currentSubtotal }),
                          });
                          let data = await res.json();
                          if (!data.success && res.status === 404) {
                            await fetchWithTimeout('/api/discounts/seed-defaults', { method: 'POST', credentials: 'include' });
                            res = await fetchWithTimeout(`/api/discounts/validate?tenant=${tenant}`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ code: 'SC20', subtotal: currentSubtotal }),
                            });
                            data = await res.json();
                          }
                          if (data.success) {
                            setAppliedDiscount({ code: data.data.code, amount: data.data.discountAmount, name: data.data.name });
                            setPromoCode('');
                            showToast.success(dict.pos.discountApplied || 'Discount applied');
                          } else {
                            showToast.error(data.error || 'Failed to apply Senior discount');
                          }
                        } catch { showToast.error('Failed to apply discount'); }
                        finally { setApplyingDiscount(false); }
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded transition-colors disabled:opacity-40"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      {dict.pos?.seniorDiscount || 'Senior 20%'}
                    </button>
                    <button
                      type="button"
                      disabled={applyingDiscount || cart.length === 0}
                      onClick={async () => {
                        setApplyingDiscount(true);
                        try {
                          const currentSubtotal = getSubtotal();
                          let res = await fetchWithTimeout(`/api/discounts/validate?tenant=${tenant}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code: 'PWD20', subtotal: currentSubtotal }),
                          });
                          let data = await res.json();
                          if (!data.success && res.status === 404) {
                            await fetchWithTimeout('/api/discounts/seed-defaults', { method: 'POST', credentials: 'include' });
                            res = await fetchWithTimeout(`/api/discounts/validate?tenant=${tenant}`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ code: 'PWD20', subtotal: currentSubtotal }),
                            });
                            data = await res.json();
                          }
                          if (data.success) {
                            setAppliedDiscount({ code: data.data.code, amount: data.data.discountAmount, name: data.data.name });
                            setPromoCode('');
                            showToast.success(dict.pos.discountApplied || 'Discount applied');
                          } else {
                            showToast.error(data.error || 'Failed to apply PWD discount');
                          }
                        } catch { showToast.error('Failed to apply discount'); }
                        finally { setApplyingDiscount(false); }
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded transition-colors disabled:opacity-40"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                      {dict.pos?.pwdDiscount || 'PWD 20%'}
                    </button>
                  </div>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder={dict.pos.promoCode || 'Promo code'}
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase().slice(0, MAX_PROMO_CODE_LENGTH))}
                      onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 focus:border-green-500 focus:ring-1 focus:ring-green-500 bg-gray-50 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={applyDiscount}
                      disabled={!promoCode.trim() || applyingDiscount}
                      className="px-2.5 py-1.5 bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center flex-shrink-0"
                    >
                      {applyingDiscount
                        ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      }
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-xs font-semibold text-green-800 truncate">{appliedDiscount.code}{appliedDiscount.name ? ` — ${appliedDiscount.name}` : ''}</span>
                  </div>
                  <button onClick={removeDiscount} className="p-0.5 text-red-400 hover:text-red-600 transition-colors flex-shrink-0" title={dict.pos.removeDiscount}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="px-3 py-2.5 space-y-1">
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>{dict.pos.subtotal}</span>
                <span className="font-medium text-gray-700 tabular-nums"><Currency amount={subtotal} /></span>
              </div>
              {appliedDiscount && (
                <div className="flex justify-between items-center text-xs text-green-600">
                  <span>{dict.pos.discount} ({appliedDiscount.code})</span>
                  <span className="font-medium tabular-nums">−<Currency amount={appliedDiscount.amount} /></span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>{settings?.taxLabel || 'Tax'} ({settings?.taxRate}%)</span>
                  <span className="font-medium text-gray-700 tabular-nums"><Currency amount={taxAmount} /></span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="font-bold text-gray-900 text-sm">{dict.common.total}</span>
                <span className="font-bold text-green-600 text-xl tabular-nums"><Currency amount={total} /></span>
              </div>
            </div>

            {/* Checkout button */}
            <div className="px-3 pb-3">
              <button
                type="button"
                onClick={handleCheckout}
                disabled={processing || cart.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-4 text-base tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 rounded shadow-sm shadow-green-200"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {dict.pos.checkout}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div 
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
          onClick={() => { setShowPaymentModal(false); resetPaymentState(); }}
        >
          <div
            className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{dict.pos.payment}</h2>
              <button
                onClick={() => { setShowPaymentModal(false); resetPaymentState(); }}
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
                {dict.common.total}: <Currency amount={total} />
              </div>
              <div className="space-y-4">
                {/* Payment method selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict.pos.paymentMethod}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'cash',           label: dict.pos.cash          || 'Cash',           icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /> },
                      { id: 'card',           label: dict.pos.card          || 'Card',           icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /> },
                      { id: 'tap_to_pay',     label: dict.pos.tapToPay      || 'Tap to Pay',     icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></> },
                      { id: 'digital_wallet', label: dict.pos.digitalWallet || 'e-Wallet',       icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /> },
                      { id: 'qr_code',        label: dict.pos.qrCode        || 'QR Code',        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /> },
                      { id: 'bnpl',           label: dict.pos.bnpl          || 'Pay Later',      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /> },
                    ] as const).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(m.id as typeof paymentMethod);
                          setCashReceived('');
                          setPaymentProvider('');
                          setPaymentReference('');
                          setBnplProvider('');
                          setInstallmentTerms('');
                        }}
                        className={`flex flex-col items-center gap-1.5 px-2 py-3.5 border-2 font-medium text-xs transition-all duration-200 ${
                          paymentMethod === m.id
                            ? 'bg-green-600 text-white border-green-700 shadow-sm shadow-green-200'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-green-400 hover:bg-green-50'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          {m.icon}
                        </svg>
                        <span className="leading-tight text-center">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cash */}
                {paymentMethod === 'cash' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {dict.pos.cashReceived}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashReceived}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || parseFloat(val) >= 0) setCashReceived(val);
                      }}
                      className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                    {cashReceived && parseFloat(cashReceived) >= total && (
                      <div className="mt-2 text-sm text-green-600 font-medium">
                        {dict.pos.change}: <Currency amount={parseFloat(cashReceived) - total} />
                      </div>
                    )}
                  </div>
                )}

                {/* Tap to Pay — optional reference */}
                {paymentMethod === 'tap_to_pay' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {dict.pos.referenceNumber || 'Reference No.'} <span className="text-gray-400 font-normal">({dict.common.optional || 'optional'})</span>
                    </label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={dict.pos.referenceNumberPlaceholder || 'e.g. 00123456'}
                    />
                  </div>
                )}

                {/* Digital Wallet */}
                {paymentMethod === 'digital_wallet' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {dict.pos.walletProvider || 'Wallet Provider'}
                      </label>
                      <select
                        value={paymentProvider}
                        onChange={(e) => setPaymentProvider(e.target.value)}
                        className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">{dict.pos.selectProvider || '— Select provider —'}</option>
                        <option value="gcash">GCash</option>
                        <option value="maya">Maya</option>
                        <option value="apple_pay">Apple Pay</option>
                        <option value="google_pay">Google Pay</option>
                        <option value="samsung_pay">Samsung Pay</option>
                        <option value="other">{dict.common.other || 'Other'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {dict.pos.referenceNumber || 'Reference No.'} <span className="text-gray-400 font-normal">({dict.common.optional || 'optional'})</span>
                      </label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder={dict.pos.referenceNumberPlaceholder || 'e.g. 00123456'}
                      />
                    </div>
                  </div>
                )}

                {/* QR Code */}
                {paymentMethod === 'qr_code' && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                      {dict.pos.qrCodeInstruction || 'Show the QR code to the customer to scan and pay.'}
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {dict.pos.referenceNumber || 'Reference No.'} <span className="text-gray-400 font-normal">({dict.common.optional || 'optional'})</span>
                      </label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder={dict.pos.referenceNumberPlaceholder || 'e.g. 00123456'}
                      />
                    </div>
                  </div>
                )}

                {/* BNPL */}
                {paymentMethod === 'bnpl' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {dict.pos.bnplProvider || 'BNPL Provider'}
                      </label>
                      <select
                        value={bnplProvider}
                        onChange={(e) => setBnplProvider(e.target.value)}
                        className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">{dict.pos.selectProvider || '— Select provider —'}</option>
                        <option value="ggives">GGives (GCash)</option>
                        <option value="billease">BillEase</option>
                        <option value="akulaku">Akulaku</option>
                        <option value="kredivo">Kredivo</option>
                        <option value="other">{dict.common.other || 'Other'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {dict.pos.installmentTerms || 'Installment Terms'}
                      </label>
                      <select
                        value={installmentTerms}
                        onChange={(e) => setInstallmentTerms(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">{dict.pos.selectTerms || '— Select terms —'}</option>
                        <option value="1">{dict.pos.payInFull || 'Pay in full (0% interest)'}</option>
                        <option value="3">3 {dict.pos.months || 'months'}</option>
                        <option value="6">6 {dict.pos.months || 'months'}</option>
                        <option value="12">12 {dict.pos.months || 'months'}</option>
                        <option value="24">24 {dict.pos.months || 'months'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {dict.pos.referenceNumber || 'Reference No.'} <span className="text-gray-400 font-normal">({dict.common.optional || 'optional'})</span>
                      </label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        className="w-full px-4 py-3 text-base border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder={dict.pos.referenceNumberPlaceholder || 'e.g. 00123456'}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => { setShowPaymentModal(false); resetPaymentState(); }}
                className="w-full sm:w-auto px-4 py-2.5 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 font-medium transition-colors bg-white"
              >
                {dict.common.cancel}
              </button>
              <button
                type="button"
                onClick={processPayment}
                disabled={
                  processing
                  || (paymentMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < total))
                  || (paymentMethod === 'digital_wallet' && total > 0 && !paymentProvider)
                  || (paymentMethod === 'bnpl' && total > 0 && (!bnplProvider || !installmentTerms))
                }
                className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-base transition-colors shadow-sm shadow-green-200 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{dict.pos.processing}</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{dict.pos.completePayment}</>
                )}
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
                      disabled={!refundTransactionId.trim() || lookingUpRefund}
                      className="px-4 py-3 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors border border-blue-700 flex items-center gap-2"
                    >
                      {lookingUpRefund && (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      )}
                      {lookingUpRefund ? (dict.pos.lookingUp || 'Looking up…') : dict.pos.lookupTransaction}
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
                  <div className="font-semibold text-lg">{refundTransaction.receiptNumber || refundTransaction._id}</div>
                  <div className="text-sm text-gray-600 mt-2">
                    {formatDateTime(new Date(refundTransaction.createdAt), settings || getDefaultTenantSettings())}
                  </div>
                  <div className="text-sm text-gray-600">
                    {dict.common.total}: <Currency amount={refundTransaction.total} />
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict.pos.selectItemsToRefund}
                  </label>
                  <div className="space-y-3 max-h-64 overflow-y-auto border border-gray-300 p-3">
                    {refundTransaction.items.map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
                              className="ml-2 px-2 py-1 text-xs bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200"
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
                    onChange={(e) => setRefundNotes(e.target.value.slice(0, MAX_REFUND_NOTES_LENGTH))}
                    maxLength={MAX_REFUND_NOTES_LENGTH}
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
                    className="px-6 py-3 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-base transition-colors flex items-center gap-2"
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
                    key={savedCart._id}
                    className="border-2 border-gray-300 p-4 hover:border-green-500 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 text-lg mb-1">{savedCart.name}</h3>
                        <p className="text-sm text-gray-500">
                          {formatDateTime(new Date(savedCart.createdAt), settings || getDefaultTenantSettings())}
                        </p>
                        <p className="text-sm text-gray-600 mt-2">
                          {savedCart.items.length} {savedCart.items.length === 1 ? (dict.pos?.item || 'item') : (dict.pos?.items || 'items')}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-green-600 mb-2">
                          <Currency amount={savedCart.total} />
                        </div>
                        {savedCart.discountCode && (
                          <div className="text-xs text-green-600">
                            {dict.pos?.discount || 'Discount'}: {savedCart.discountCode}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadCart(savedCart)}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white hover:bg-green-700 font-semibold transition-colors border border-green-700"
                      >
                        {dict.pos?.loadCart || 'Load Cart'}
                      </button>
                      <button
                        onClick={() => deleteSavedCart(savedCart._id)}
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
      {confirmDialog}
    </div>
  );
}

