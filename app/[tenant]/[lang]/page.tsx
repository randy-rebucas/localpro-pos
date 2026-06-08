'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import OfflineIndicator from '@/components/OfflineIndicator';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from './dictionaries-client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useStockSync } from '@/hooks/useStockSync';
import { useUpsell } from '@/hooks/useUpsell';
import { useCart } from '@/hooks/useCart';
import { useDiscount, type Discount } from '@/hooks/useDiscount';
import { usePayment } from '@/hooks/usePayment';
import { useRefund } from '@/hooks/useRefund';
import { useCashDrawer } from '@/hooks/useCashDrawer';
import { getOfflineStorage } from '@/lib/offline-storage';
import { TranslationDict } from '@/types/dictionary';
import dynamic from 'next/dynamic';
import PageLoading from '@/components/ui/PageLoading';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading scanner...</div>,
});
const QRCodeScanner = dynamic(() => import('@/components/QRCodeScanner'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading scanner...</div>,
});
const HardwareStatusChecker = dynamic(() => import('@/components/HardwareStatus'), {
  ssr: false,
});

const DynamicCustomerSidePanel = dynamic(() => import('@/components/CustomerSidePanel'), {
  ssr: false,
  loading: () => <LoadingSpinner size="sm" className="py-2" />,
});

const PosRoamingCart = dynamic(() => import('@/components/pos/PosRoamingCart'), {
  ssr: false,
  loading: () => null,
});

const PosPaymentModal = dynamic(() => import('@/components/pos/modals/PosPaymentModal'), {
  ssr: false,
  loading: () => null,
});
const PosRefundModal = dynamic(() => import('@/components/pos/modals/PosRefundModal'), {
  ssr: false,
  loading: () => null,
});
const PosSavedCartsModal = dynamic(() => import('@/components/pos/modals/PosSavedCartsModal'), {
  ssr: false,
  loading: () => null,
});
const PosAgeVerificationModal = dynamic(() => import('@/components/pos/modals/PosAgeVerificationModal'), {
  ssr: false,
  loading: () => null,
});
const PosSplitCheckModal = dynamic(() => import('@/components/pos/modals/PosSplitCheckModal'), {
  ssr: false,
  loading: () => null,
});
const PosBranchLookupModal = dynamic(() => import('@/components/pos/modals/PosBranchLookupModal'), {
  ssr: false,
  loading: () => null,
});
const PosModifierModal = dynamic(() => import('@/components/pos/modals/PosModifierModal'), {
  ssr: false,
  loading: () => null,
});
const FloorMap = dynamic(() => import('@/components/FloorMap'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <LoadingSpinner label="Loading floor map…" />
    </div>
  ),
});
import { hardwareService } from '@/lib/hardware';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';
import { useDeviceType } from '@/hooks/useDeviceType';
import type { CustomerSummary } from '@/types/customer';
import CartLineItem from '@/components/pos/CartLineItem';
import CartActionBar from '@/components/pos/CartActionBar';
import CartDiscountSection from '@/components/pos/CartDiscountSection';
import CartSummaryFooter from '@/components/pos/CartSummaryFooter';
import CartUpsellSuggestions from '@/components/pos/CartUpsellSuggestions';
import ProductGrid from '@/components/pos/ProductGrid';
import { usePosProducts, type PosProduct } from '@/hooks/usePosProducts';
import { CartVariant, CartItemModifier } from '@/hooks/useCart';
import {
  findProductByBarcode,
  getMaxSaleUnitQuantity,
  getSaleUnits,
  hasMultipleSaleUnits,
  resolveSaleUnitPrice,
  type ProductSaleUnit,
} from '@/lib/product-units';
import { RestaurantMeta, SplitPaymentEntry } from '@/hooks/usePayment';
import type { SplitGuestPayment } from '@/components/pos/modals/PosSplitCheckModal';
import type { RefundTransaction as PosRefundTransaction } from '@/components/pos/modals/PosRefundModal';

type Product = PosProduct;

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
}

export default function Dashboard() {
  const params = useParams();

  const tenant = params.tenant as string;
  const rawLang = params.lang as string;
  const lang = (['en', 'es'] as const).includes(rawLang as 'en' | 'es') ? (rawLang as 'en' | 'es') : 'en';
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { isOnline } = useNetworkStatus(tenant);
  const { settings } = useTenantSettings();
  const { logout, user: authUser } = useAuth();
  const isCashier = authUser?.role === 'cashier';
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const enableOnAccountSales = settings?.enableOnAccountSales === true;
  const rawBt = (settings?.businessType || 'general').toLowerCase();
  const businessType = (['retail', 'restaurant', 'laundry', 'service'] as const).includes(rawBt as 'retail' | 'restaurant' | 'laundry' | 'service') ? rawBt as 'retail' | 'restaurant' | 'laundry' | 'service' : 'general' as const;
  const device = useDeviceType();
  const isHandheld = device.isTouch && (device.isMobile || device.isTablet || device.isIpad);

  // Additional state for modals and UI
  const [savedCarts, setSavedCarts] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loadingSavedCarts, setLoadingSavedCarts] = useState(false);
  const [savedCartsError, setSavedCartsError] = useState<string | null>(null);
  const [savingCart, setSavingCart] = useState(false);
  const [cartName, setCartName] = useState('');
  const [lookingUpRefund, setLookingUpRefund] = useState(false);
  const [refundTransactionId, setRefundTransactionId] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [customerDisplayUrl, setCustomerDisplayUrl] = useState<string>('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showSavedCartsModal, setShowSavedCartsModal] = useState(false);
  const [showSaveCartModal, setShowSaveCartModal] = useState(false);

  // Restaurant-specific state
  const [orderType, setOrderType] = useState<'dine-in' | 'takeout' | 'delivery'>('dine-in');
  const [tableNumber, setTableNumber] = useState('');
  // Service/laundry: scheduling
  const [scheduledFor, setScheduledFor] = useState('');
  // Hardware status banner
  const [hwStatusMsg, setHwStatusMsg] = useState<string | null>(null);

  // Age verification modal state
  const [showAgeVerificationModal, setShowAgeVerificationModal] = useState(false);
  const [pendingAgeVerifyProduct, setPendingAgeVerifyProduct] = useState<Product | null>(null);
  // Split Check modal state
  const [showSplitCheckModal, setShowSplitCheckModal] = useState(false);
  const [splitGuests, setSplitGuests] = useState(2);

  // Retail: variant selector modal
  const [pendingVariantProduct, setPendingVariantProduct] = useState<Product | null>(null);
  const [showVariantModal, setShowVariantModal] = useState(false);

  // Sale unit selector modal
  const [pendingUnitProduct, setPendingUnitProduct] = useState<Product | null>(null);
  const [pendingUnitVariant, setPendingUnitVariant] = useState<CartVariant | undefined>();
  const [pendingUnitModifiers, setPendingUnitModifiers] = useState<CartItemModifier[] | undefined>();
  const [showUnitModal, setShowUnitModal] = useState(false);

  // Retail: customer side panel
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  // Retail: cross-branch inventory lookup
  const [branchLookupProduct, setBranchLookupProduct] = useState<Product | null>(null);
  const [branchLookupData, setBranchLookupData] = useState<Array<{ branchId: string; stock: number; name: string }>>([]);
  const [loadingBranchLookup, setLoadingBranchLookup] = useState(false);
  const [branchLookupError, setBranchLookupError] = useState<string | null>(null);

  // Restaurant: floor map
  const [showFloorMap, setShowFloorMap] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>('');

  // Restaurant: modifier slide-out
  const [showModifierModal, setShowModifierModal] = useState(false);
  const [pendingModifierProduct, setPendingModifierProduct] = useState<Product | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, { option: string; price: number }>>({});

  // Split billing: per-guest state
  const [splitStep, setSplitStep] = useState<'guests' | 'payments'>('guests');
  const [guestPayments, setGuestPayments] = useState<SplitGuestPayment[]>([]);

  const { confirm, Dialog: confirmDialog } = useConfirm();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sessionSyncAbortRef = useRef<AbortController | null>(null);

  // Max limits
  const MAX_REFUND_NOTES_LENGTH = 500;

  // Fetch with timeout helper (defined early for use in hooks)
  const fetchWithTimeout = useCallback(async (url: string, options?: RequestInit, timeoutMs = 15000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const error = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`HTTP ${res.status}: ${error}`);
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }, []);

  const productsScrollRef = useRef<HTMLDivElement>(null);

  const {
    products,
    setProducts,
    status: productsStatus,
    source: productsSource,
    error: productsError,
    hasMore: productsHasMore,
    loadingMore: productsLoadingMore,
    loadMore: loadMoreProducts,
    refetch: refetchProducts,
  } = usePosProducts({
    tenant,
    debouncedSearch,
    isOnline,
    fetchWithTimeout,
  });

  // Custom hooks for state management (after fetchWithTimeout is defined)
  const { cart, setCart, addToCart, removeFromCart, updateQuantity, getSubtotal, getTaxAmount, clearCart: hookClearCart } = useCart(
    (message: string) => showToast.error(message)
  );
  const { promoCode, setPromoCode, appliedDiscount, setAppliedDiscount, applyingDiscount, applyDiscount, removeDiscount } = useDiscount(fetchWithTimeout);
  const {
    paymentMethod, setPaymentMethod,
    cashReceived, setCashReceived,
    paymentProvider, setPaymentProvider,
    paymentReference, setPaymentReference,
    bnplInstallments, setBnplInstallments,
    processing, processPayment,
  } = usePayment();
  const { currentRefundTransaction, setCurrentRefundTransaction, refundItems, setRefundItems, refundNotes, setRefundNotes, refunding, addRefundItem, removeRefundItem, updateRefundQty, calculateRefundAmount, processRefund, clearRefund } = useRefund();
  const { activeSession: cashDrawerSession, checkActiveSession, openDrawer, closeDrawer, loading: cashDrawerLoading } = useCashDrawer();

  // Upsell suggestions — derived from cart product IDs
  const cartProductIds = cart.map((i) => i.productId);
  const { suggestions: upsellSuggestions } = useUpsell(tenant, cartProductIds);

  // Real-time stock sync via SSE
  const { connected: stockSyncConnected } = useStockSync({
    tenant,
    isOnline,
    onStockUpdate: ({ productId, newStock }) => {
      setProducts((prev) =>
        prev.map((p) => (p._id === productId ? { ...p, stock: newStock } : p))
      );
    },
  });

  // Cash drawer UI state
  const [roamingMode, setRoamingMode] = useState(false);
  const [showRoamingCart, setShowRoamingCart] = useState(false);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('list');
  const productGridClass = roamingMode
    ? 'grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
    : 'grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';
  const productCardHeightClass = 'h-52 sm:h-56 md:h-60 xl:h-64';
  const productListClass = 'flex flex-col gap-2';

  const [showCashDrawerModal, setShowCashDrawerModal] = useState<'open' | 'close' | null>(null);
  const [drawerAmount, setDrawerAmount] = useState('');
  const [drawerNotes, setDrawerNotes] = useState('');
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const [closingSummary, setClosingSummary] = useState<{ expectedAmount?: number; closingAmount?: number; shortage?: number; overage?: number } | null>(null);

  // Aliases for backward compatibility with old code
  const setRefundTransaction = setCurrentRefundTransaction;
  const refundTransaction = currentRefundTransaction;

  // Wrapper for getTotal that includes discount logic (needed by old code)
  const getTotal = useCallback(() => {
    const subtotal = getSubtotal();
    const discount = appliedDiscount?.amount || 0;
    const afterDiscount = Math.max(0, subtotal - discount);
    // Tax is calculated on the discounted amount (taxable base)
    const taxAmount = getTaxAmount({ taxEnabled: settings?.taxEnabled, taxRate: settings?.taxRate }, afterDiscount);
    return Math.round((afterDiscount + taxAmount) * 100) / 100;
  }, [getSubtotal, getTaxAmount, appliedDiscount, settings]);

  useEffect(() => {
    if (appliedDiscount) {
      setShowDiscountSection(true);
    }
  }, [appliedDiscount]);

  // Safe dictionary accessor to avoid null checks throughout the code
  const dictValue = (path: string, fallback: string = ''): string => {
    if (!dict) return fallback;
    const keys = path.split('.');
    let value: any = dict; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) return fallback;
    }
    return value || fallback;
  };

  // Create AbortController for session/cart sync that runs on every change

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    const savedDisplayMode = localStorage.getItem(`posDisplayMode_${tenant}`);
    if (savedDisplayMode === 'list' || savedDisplayMode === 'grid') {
      setDisplayMode(savedDisplayMode);
    }
  }, [tenant]);

  useEffect(() => {
    localStorage.setItem(`posDisplayMode_${tenant}`, displayMode);
  }, [displayMode, tenant]);

  // Esc key to close modals
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showAgeVerificationModal) {
        setShowAgeVerificationModal(false);
        setPendingAgeVerifyProduct(null);
      } else if (showSplitCheckModal) {
        setShowSplitCheckModal(false);
      } else if (showPaymentModal) {
        setShowPaymentModal(false);
        setCashReceived('');
        setPaymentProvider('');
        setPaymentReference('');
      } else if (showRefundModal) {
        setShowRefundModal(false);
      } else if (showSavedCartsModal) {
        setShowSavedCartsModal(false);
      } else if (showSaveCartModal) {
        setShowSaveCartModal(false);
      } else if (showQRScanner) {
        setShowQRScanner(false);
      } else if (showCashDrawerModal && !closingSummary) {
        setShowCashDrawerModal(null);
      } else if (showRoamingCart) {
        setShowRoamingCart(false);
      } else if (showFloorMap) {
        setShowFloorMap(false);
      }
    }
  }, [showAgeVerificationModal, showSplitCheckModal, showPaymentModal, showRefundModal, showSavedCartsModal, showSaveCartModal, showQRScanner, showCashDrawerModal, closingSummary, showRoamingCart, showFloorMap, setCashReceived, setPaymentProvider, setPaymentReference]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
      // Surface a banner if a configured device type is network/usb but likely unreachable at init
      if (settings.hardwareConfig?.printer?.type === 'network' && !settings.hardwareConfig.printer.ipAddress) {
        setHwStatusMsg('Printer configured but no IP address set — check Hardware Settings');
      }
    }
  }, [settings, tenant]);

  // Auto-enable roaming mode when running on a touch handheld device
  useEffect(() => {
    if (isHandheld) setRoamingMode(true);
  }, [isHandheld]);

  // Initialize dual-screen terminal session
  useEffect(() => {
    const initSession = async () => {
      const id = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      setSessionId(id);

      // Initialize session on API
      await fetch(`/api/pos/session/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant,
          action: 'init',
          data: {
            cart: [],
            subtotal: 0,
            discount: null,
            taxAmount: 0,
            taxRate: settings?.taxRate || 0,
            taxLabel: settings?.taxLabel || 'Tax',
            tip: 0,
            total: 0,
          },
        }),
      }).catch((err) => {
        console.error('Failed to init session:', err);
      });

      const baseUrl = window.location.origin;
      const displayUrl = `${baseUrl}/${tenant}/${lang}/customer-display?session=${id}`;
      setCustomerDisplayUrl(displayUrl);
    };

    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, lang]); // settings excluded intentionally — session is initialized once per tenant/lang, not on every settings change

  // Sync cart to customer display
  const syncToCustomerDisplay = useCallback(
    async (cartItems?: CartItem[], discount?: Discount | null, tip?: number) => {
      if (!sessionId) return;

      // Cancel previous sync if still in progress
      if (sessionSyncAbortRef.current) {
        sessionSyncAbortRef.current.abort();
      }

      try {
        sessionSyncAbortRef.current = new AbortController();
        const items = cartItems || cart;
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const discountAmount = discount?.amount || appliedDiscount?.amount || 0;
        const taxableBase = Math.max(0, subtotal - discountAmount);
        const taxAmount = settings?.taxEnabled && settings?.taxRate ? (taxableBase * (settings.taxRate / 100)) : 0;
        const tipAmount = tip ?? 0;
        const total = taxableBase + taxAmount + tipAmount;

        const res = await fetch(`/api/pos/session/${sessionId}?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: sessionSyncAbortRef.current.signal,
          body: JSON.stringify({
            tenant,
            action: 'update-cart',
            data: {
              cart: items.map((item) => ({
                productId: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
              })),
              subtotal,
              taxAmount: Math.round(taxAmount * 100) / 100,
              taxRate: settings?.taxRate || 0,
              taxLabel: settings?.taxLabel || 'Tax',
              total: Math.round(total * 100) / 100,
            },
          }),
        });

        if (!res.ok) {
          console.error(`Failed to sync cart: HTTP ${res.status}`);
        }
      } catch (error: unknown) {
        // Ignore abort errors - expected when cart changes rapidly
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('Sync error:', error);
      }
    },
    [sessionId, cart, appliedDiscount, tenant, settings]
  );

  // Sync cart whenever it changes
  useEffect(() => {
    syncToCustomerDisplay();
  }, [cart, syncToCustomerDisplay]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (sessionSyncAbortRef.current) {
        sessionSyncAbortRef.current.abort();
        sessionSyncAbortRef.current = null;
      }
    };
  }, []);

  // Refocus search box whenever any modal closes
  useEffect(() => {
    if (
      !showPaymentModal &&
      !showQRScanner &&
      !showRefundModal &&
      !showSavedCartsModal &&
      !showSaveCartModal &&
      !showAgeVerificationModal &&
      !showSplitCheckModal &&
      !showRoamingCart &&
      !showFloorMap
    ) {
      if (!device.isTouch) {
        searchInputRef.current?.focus();
      }
    }
  }, [showPaymentModal, showQRScanner, showRefundModal, showSavedCartsModal, showSaveCartModal, showAgeVerificationModal, showSplitCheckModal, showRoamingCart, showFloorMap, device.isTouch]);

  // Handle barcode scanning
  const handleBarcodeScan = useCallback((barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    const match = findProductByBarcode(products, code);
    setSearch('');
    if (match && (match.product.stock > 0 || match.product.allowOutOfStockSales)) {
      handleAddToCart(match.product, undefined, undefined, match.saleUnit);
    } else {
      if (dict) {
        showToast.error(dict.pos.productNotFound || 'Product not found');
      }
    }
  }, [products, dict]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle QR code scan
  const handleQRScan = useCallback((data: string) => {
    // QR codes might contain product IDs, URLs, or other data
    // Try to parse as product ID first
    const product = products.find(p => p._id === data);
    if (product && (product.stock > 0 || product.allowOutOfStockSales)) {
      handleAddToCart(product);
      setShowQRScanner(false);
    }
  }, [products, addToCart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for active cash drawer session on mount
  useEffect(() => {
    checkActiveSession();
  }, [checkActiveSession]);

  // Cash drawer handlers
  const handleOpenDrawer = async () => {
    const amount = parseFloat(drawerAmount);
    if (isNaN(amount) || amount < 0) {
      showToast.error('Please enter a valid opening amount');
      return;
    }
    const success = await openDrawer(amount, drawerNotes || undefined);
    if (success) {
      showToast.success('Cash drawer opened. Shift started.');
      setShowCashDrawerModal(null);
      setDrawerAmount('');
      setDrawerNotes('');
    }
  };

  const handleCloseDrawer = async () => {
    const amount = parseFloat(drawerAmount);
    if (isNaN(amount) || amount < 0) {
      showToast.error('Please enter the actual closing amount');
      return;
    }
    const result = await closeDrawer(amount, drawerNotes || undefined);
    if (result.success && result.session) {
      setClosingSummary({
        expectedAmount: result.session.expectedAmount,
        closingAmount: result.session.closingAmount,
        shortage: result.session.shortage,
        overage: result.session.overage,
      });
      setDrawerAmount('');
      setDrawerNotes('');
      showToast.success('Cash drawer closed. Shift ended.');
    } else {
      showToast.error(result.error || 'Failed to close drawer');
    }
  };

  // Refund and transaction lookup helpers
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
        setRefundTransaction(transaction);
        // Initialize refund items with all items - use hook method instead of direct setState
        // Clear any existing refund items first
        refundItems.forEach((item) => removeRefundItem(item.productId));
        // Add all transaction items for refund selection
        transaction.items.forEach((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          addRefundItem(item.product.toString(), item.quantity);
        });
      } else {
        showToast.error(data.error || dict.pos.noTransactionFound);
      }
    } catch (error) {
      console.error('Error looking up transaction:', error);
      if (dict) {
        showToast.error(dict.pos?.noTransactionFound || 'Transaction not found');
      }
    } finally {
      setLookingUpRefund(false);
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast.error(dictValue('pos.cartEmptyAlert', 'Cart is empty'));
      return;
    }
    setShowPaymentModal(true);
  };

  // Wrap addToCart with context-aware checks (e.g. age verification for alcohol)
  const ALCOHOL_PATTERN = /alcohol|beer|wine|spirits|liquor|whiskey|whisky|vodka|rum|gin|brandy|tequila|cider|mead|sake/i;
  const handleAddToCart = (
    product: Product,
    variant?: CartVariant,
    modifiers?: CartItemModifier[],
    saleUnit?: ProductSaleUnit
  ) => {
    if (ALCOHOL_PATTERN.test(product.category || '') || ALCOHOL_PATTERN.test(product.name || '')) {
      setPendingAgeVerifyProduct(product);
      setShowAgeVerificationModal(true);
      return;
    }
    if (product.hasVariations && product.variations?.length && !variant) {
      setPendingVariantProduct(product);
      setShowVariantModal(true);
      return;
    }
    if (businessType === 'restaurant' && product.modifiers?.length && !modifiers) {
      setPendingModifierProduct(product);
      setSelectedModifiers({});
      setShowModifierModal(true);
      return;
    }
    if (!saleUnit && hasMultipleSaleUnits(product)) {
      setPendingUnitProduct(product);
      setPendingUnitVariant(variant);
      setPendingUnitModifiers(modifiers);
      setShowUnitModal(true);
      return;
    }
    addToCart(product, variant, modifiers, saleUnit);
  };

  const handleBranchLookup = async (product: Product) => {
    setBranchLookupProduct(product);
    setBranchLookupData([]);
    setBranchLookupError(null);
    setLoadingBranchLookup(true);
    try {
      const [productRes, branchRes] = await Promise.all([
        fetch(`/api/products/${product._id}?tenant=${tenant}`, { credentials: 'include' }),
        fetch(`/api/branches?isActive=true&tenant=${tenant}`, { credentials: 'include' }),
      ]);
      const [productData, branchData] = await Promise.all([productRes.json(), branchRes.json()]);
      if (productData.success && branchData.success) {
        const branchMap: Record<string, string> = {};
        for (const b of branchData.data) branchMap[String(b._id)] = b.name;
        const rows = (productData.data.branchStock || []).map((bs: { branchId: string; stock: number }) => ({
          branchId: String(bs.branchId),
          stock: bs.stock,
          name: branchMap[String(bs.branchId)] || 'Unknown branch',
        }));
        setBranchLookupData(rows);
      } else {
        setBranchLookupError(dictValue('pos.failedToLoadBranchStock', 'Failed to load branch stock'));
      }
    } catch {
      setBranchLookupError(dictValue('pos.failedToLoadBranchStock', 'Failed to load branch stock'));
    } finally {
      setLoadingBranchLookup(false);
    }
  };

  // Refund and saved carts functions
  const clearCart = () => {
    hookClearCart();
    setAppliedDiscount(null);
    setPromoCode('');
    showToast.success(dictValue('pos.cartCleared', 'Cart cleared'));
  };

  const saveCart = async () => {
    if (cart.length === 0) return;
    if (!cartName.trim()) {
      showToast.error(dictValue('pos.cartNameRequired', 'Please enter a name for this cart'));
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
        showToast.success(dictValue('pos.cartSaved', 'Cart saved successfully'));
        setShowSaveCartModal(false);
        setCartName('');
        loadSavedCarts();
      } else {
        showToast.error(data.error || dictValue('pos.saveCartError', 'Failed to save cart'));
      }
    } catch (error) {
      console.error('Error saving cart:', error);
      showToast.error(dictValue('pos.saveCartError', 'Failed to save cart'));
    } finally {
      setSavingCart(false);
    }
  };

  const loadSavedCarts = async () => {
    try {
      setLoadingSavedCarts(true);
      setSavedCartsError(null);
      const res = await fetch('/api/saved-carts', {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setSavedCarts(data.data);
      } else {
        setSavedCartsError(data.error || dictValue('pos.failedToLoadSavedCarts', 'Failed to load saved carts'));
      }
    } catch (error) {
      console.error('Error loading saved carts:', error);
      setSavedCartsError(dictValue('pos.failedToLoadSavedCarts', 'Failed to load saved carts'));
    } finally {
      setLoadingSavedCarts(false);
    }
  };

  const loadCart = async (savedCart: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (cart.length > 0) {
      const confirmed = await confirm(
        dictValue('pos.loadCartConfirmTitle', 'Load Saved Cart'),
        dictValue('pos.loadCartConfirm', 'Loading a saved cart will replace your current cart. Continue?'),
        { variant: 'warning' }
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      // Restore cart items
      const restoredCart = savedCart.items.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        productId: item.productId.toString(),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        stock: item.stock,
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
      refetchProducts();
      showToast.success(dictValue('pos.cartLoaded', 'Cart loaded successfully'));
    } catch (error) {
      console.error('Error loading cart:', error);
      showToast.error(dictValue('pos.loadCartError', 'Failed to load cart'));
    }
  };

  const deleteSavedCart = async (cartId: string) => {
    const confirmed = await confirm(
      dictValue('pos.deleteCartConfirmTitle', 'Delete Saved Cart'),
      dictValue('pos.deleteCartConfirm', 'Are you sure you want to delete this saved cart?'),
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
        showToast.success(dictValue('pos.cartDeleted', 'Cart deleted successfully'));
        loadSavedCarts();
      } else {
        showToast.error(data.error || dictValue('pos.deleteCartError', 'Failed to delete cart'));
      }
    } catch (error) {
      console.error('Error deleting cart:', error);
      showToast.error(dictValue('pos.deleteCartError', 'Failed to delete cart'));
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
        const updatedCache = cached.map((p: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
        showToast.error(data.error || dictValue('common.failedToTogglePin', 'Failed to toggle pin status'));
      }
    } catch (error) {
      // Revert optimistic update on error
      setProducts(prev => prev.map(p =>
        p._id === productId ? { ...p, pinned: currentPinned } : p
      ));
      console.error('Error toggling pin:', error);
      showToast.error(dictValue('common.failedToTogglePin', 'Failed to toggle pin status'));
    }
  };

  // Print receipt helper
  const printReceipt = async (transaction: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!settings) return;

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
    const taxableBase = (transaction.subtotal || transaction.total) - (transaction.discountAmount || 0);
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
      receiptNumber: transaction.receiptNumber || transaction._id?.slice(-8) || 'N/A',
      date: transaction.date || formatDateTime(new Date(transaction.createdAt || Date.now()), settings || getDefaultTenantSettings()),
      items: transaction.items || [],
      subtotal: transaction.subtotal || transaction.total,
      discount: transaction.discountAmount || undefined,
      tax: taxAmount,
      taxLabel: settings.taxLabel,
      taxRate: settings.taxRate,
      total: transaction.total,
      paymentMethod: transaction.paymentMethod,
      cashReceived: transaction.cashReceived,
      change: transaction.change,
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
      // Auto-kick cash drawer on cash payments (drawer connected to printer via RJ11)
      openDrawerOnPrint: transaction.paymentMethod === 'cash' && !!cashDrawerSession,
    };

    try {
      const printed = await hardwareService.printReceipt(receiptData);
      if (!printed) {
        showToast.error(dict?.pos?.printFailed || 'Receipt could not be printed. Check printer settings.');
      }
    } catch (error) {
      console.error('Failed to print receipt:', error);
      showToast.error(dictValue('pos.printFailed', 'Receipt could not be printed. Check printer settings.'));
    }
  };

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const completePayment = async () => {
    const restaurantMeta: RestaurantMeta | undefined =
      businessType === 'restaurant'
        ? { orderType, tableNumber: tableNumber || undefined, tableId: selectedTableId || undefined }
        : undefined;
    const result = await processPayment(
      cart,
      appliedDiscount,
      getTotal(),
      tenant,
      (msg) => showToast.error(msg),
      fetchWithTimeout,
      selectedCustomer?._id,
      restaurantMeta
    );
    if (result?.success) {
      showToast.success(dict.pos.paymentCompleted || 'Payment completed');
      const soldItems = [...cart];
      setProducts((prev) =>
        prev.map((p) => {
          const soldItem = soldItems.find((i) => i.productId === p._id);
          if (!soldItem || p.trackInventory === false) return p;
          return { ...p, stock: Math.max(0, p.stock - soldItem.quantity) };
        })
      );
      clearCart();
      setAppliedDiscount(null);
      setShowPaymentModal(false);
      setCashReceived('');
      setPaymentProvider('');
      setPaymentReference('');
      if (businessType === 'restaurant' && orderType === 'dine-in' && selectedTableId) {
        setSelectedTableId('');
        setTableNumber('');
      }
      if (result.data) {
        printReceipt(result.data);
      }
      if (sessionId) {
        fetch(`/api/pos/session/${sessionId}?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant,
            action: 'transaction-complete',
            data: result.data,
          }),
        }).catch((err) => console.error('Failed to sync transaction:', err));
      }
    } else if (result) {
      const message =
        result.error ||
        (Array.isArray(result.errors) && result.errors.map((e) => e.message).filter(Boolean).join(', ')) ||
        dictValue('pos.paymentFailed', 'Payment failed');
      showToast.error(message);
    }
  };

  const closeRefundModal = () => {
    setShowRefundModal(false);
    setRefundTransactionId('');
    setRefundTransaction(null);
    clearRefund();
    setRefundReason('');
  };

  const handleProcessRefund = async () => {
    const result = await processRefund(currentRefundTransaction, fetchWithTimeout);
    if (result?.success) {
      showToast.success(dict.pos.refundProcessed || 'Refund processed successfully');
      closeRefundModal();
      setRefundNotes('');
    } else if (result?.errors && result.errors.length > 0) {
      showToast.error(result.errors.join(', '));
    } else {
      showToast.error(result?.error || 'Failed to process refund');
    }
  };

  const handleCollectGuest = (idx: number) => {
    const m = guestPayments[idx]?.method;
    if (m === 'on_account' && !selectedCustomer) {
      showToast.error(dictValue('pos.onAccountRequiresCustomer', 'Select a customer first'));
      return;
    }
    setGuestPayments((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, collected: true } as typeof p : p))
    );
  };

  const handleCompleteSplitPayment = async () => {
    const restaurantMeta: RestaurantMeta | undefined =
      businessType === 'restaurant'
        ? { orderType, tableNumber: tableNumber || undefined, tableId: selectedTableId || undefined }
        : undefined;
    const splitEntries: SplitPaymentEntry[] = guestPayments.map(({ guestIndex, method, amount, reference }) => ({
      guestIndex,
      method,
      amount,
      reference,
    }));
    const result = await processPayment(
      cart,
      appliedDiscount,
      getTotal(),
      tenant,
      (msg) => showToast.error(msg),
      fetchWithTimeout,
      selectedCustomer?._id,
      restaurantMeta,
      splitEntries
    );
    if (result?.success) {
      showToast.success(
        `${dictValue('pos.splitPaymentComplete', 'Split payment complete')} — ${splitGuests} ${dictValue('pos.guests', 'guests')}`
      );
      const soldItems = [...cart];
      setProducts((prev) =>
        prev.map((p) => {
          const soldItem = soldItems.find((i) => i.productId === p._id);
          if (!soldItem || p.trackInventory === false) return p;
          return { ...p, stock: Math.max(0, p.stock - soldItem.quantity) };
        })
      );
      clearCart();
      setAppliedDiscount(null);
      setShowSplitCheckModal(false);
      setSplitStep('guests');
      setGuestPayments([]);
      if (businessType === 'restaurant' && orderType === 'dine-in' && selectedTableId) {
        setSelectedTableId('');
        setTableNumber('');
      }
      if (result.data) printReceipt(result.data);
    } else if (result) {
      const message =
        result.error ||
        (Array.isArray(result.errors) && result.errors.map((e) => e.message).filter(Boolean).join(', ')) ||
        dictValue('pos.paymentFailed', 'Payment failed');
      showToast.error(message);
    }
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <OfflineIndicator />
      <BarcodeScanner onScan={handleBarcodeScan} enabled={true} />
      {showQRScanner && (
        <QRCodeScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
          enabled={true}
        />
      )}
      <div className="fixed bottom-4 right-4 z-40">
        <HardwareStatusChecker compact={true} autoRefresh={true} />
      </div>

      {/* Hardware status banner */}
      {hwStatusMsg && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">{hwStatusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setHwStatusMsg(null)}
            className="p-1 text-amber-600 hover:text-amber-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Cash Drawer Shift Bar */}
      {cashDrawerSession && (
        <div className="bg-green-50 border-b border-green-200 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-green-800 min-w-0">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Shift Active</span>
            <span className="text-green-600 text-xs sm:text-sm truncate">
              <span className="hidden sm:inline">| Opened: {new Date(cashDrawerSession.openingTime).toLocaleTimeString()}</span>
              <span className="sm:ml-1">| Opening: <Currency amount={cashDrawerSession.openingAmount} /></span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`w-2 h-2 rounded-full ${stockSyncConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className={stockSyncConnected ? 'text-green-700' : 'text-gray-500'}>
                {stockSyncConnected ? 'Stock Live' : 'Stock Offline'}
              </span>
            </div>
            <button
              onClick={async () => {
                const ok = await confirm('End Shift', 'Are you sure you want to end your shift? You will need to count the cash in the drawer.');
                if (!ok) return;
                setDrawerAmount('');
                setDrawerNotes('');
                setClosingSummary(null);
                setShowCashDrawerModal('close');
              }}
              className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded text-xs font-medium transition-colors"
            >
              End Shift
            </button>
          </div>
        </div>
      )}

      {/* Start Shift Overlay - only blocks cashier role when no cash drawer session */}
      {isCashier && !cashDrawerSession && !cashDrawerLoading && productsStatus !== 'loading' && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center" style={{ top: '64px' }}>
          <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-brand-soft rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Start Your Shift</h2>
            <p className="text-gray-600 mb-6">Open the cash drawer to begin processing transactions.</p>
            <button
              onClick={() => {
                setDrawerAmount('');
                setDrawerNotes('');
                setShowCashDrawerModal('open');
              }}
              className="w-full py-3 text-white font-semibold rounded-lg transition-colors mb-3"
              style={{ backgroundColor: primaryColor }}
            >
              {dictValue('pos.openCashDrawer', 'Open Cash Drawer')}
            </button>
            <button
              onClick={async () => {
                await logout();
                window.location.href = `/${tenant}/${lang}/login`;
              }}
              className="w-full py-2.5 text-gray-600 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors text-sm"
            >
              {dictValue('common.logout', 'Logout')}
            </button>
          </div>
        </div>
      )}

      {/* Cash Drawer Open/Close Modal */}
      {showCashDrawerModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {showCashDrawerModal === 'open' ? dictValue('pos.openCashDrawer', 'Open Cash Drawer') : dictValue('pos.closeCashDrawer', 'Close Cash Drawer')}
            </h3>

            {closingSummary ? (
              <div className="space-y-3 mb-6">
                <h4 className="font-semibold text-gray-800">{dictValue('pos.shiftSummary', 'Shift Summary')}</h4>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{dictValue('admin.expectedAmount', 'Expected Amount')}:</span>
                    <span className="font-medium"><Currency amount={closingSummary.expectedAmount || 0} /></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{dictValue('pos.actualClosing', 'Actual Closing')}:</span>
                    <span className="font-medium"><Currency amount={closingSummary.closingAmount || 0} /></span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>{dictValue('pos.difference', 'Difference')}:</span>
                    <span className={
                      (closingSummary.shortage || 0) > 0 ? 'text-red-600' :
                        (closingSummary.overage || 0) > 0 ? 'text-green-600' : 'text-gray-900'
                    }>
                      {(closingSummary.shortage || 0) > 0 && <>{dictValue('pos.short', 'Short')}: <Currency amount={closingSummary.shortage || 0} /></>}
                      {(closingSummary.overage || 0) > 0 && <>{dictValue('pos.over', 'Over')}: <Currency amount={closingSummary.overage || 0} /></>}
                      {!(closingSummary.shortage || 0) && !(closingSummary.overage || 0) && dictValue('pos.balanced', 'Balanced')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setClosingSummary(null);
                    setShowCashDrawerModal(null);
                  }}
                  className="w-full py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {showCashDrawerModal === 'open' ? 'Opening Amount' : 'Actual Closing Amount'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={drawerAmount}
                      onChange={(e) => setDrawerAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-brand focus:border-brand"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                    <input
                      type="text"
                      value={drawerNotes}
                      onChange={(e) => setDrawerNotes(e.target.value)}
                      placeholder="e.g. Morning shift"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-brand"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCashDrawerModal(null);
                      setDrawerAmount('');
                      setDrawerNotes('');
                    }}
                    className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={showCashDrawerModal === 'open' ? handleOpenDrawer : handleCloseDrawer}
                    disabled={cashDrawerLoading || !drawerAmount}
                    className="flex-1 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: showCashDrawerModal === 'open' ? primaryColor : '#dc2626' }}
                  >
                    {cashDrawerLoading ? 'Processing...' : showCashDrawerModal === 'open' ? 'Open Drawer' : 'Close Drawer'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile: stacked cart + products. Tablet/laptop (md+): side-by-side with compact cart */}
      <div
        className={`flex flex-col flex-1 min-h-0 overflow-hidden gap-3 sm:gap-4 md:gap-0 ${roamingMode ? '' : 'md:flex-row'}`}
      >
        {/* Cart Section - hidden in roaming mode (replaced by FAB + bottom sheet) */}
        <div
          className={`order-1 flex flex-col min-h-0 flex-1 max-h-[min(50vh,440px)] sm:max-h-[min(55vh,480px)] md:max-h-none md:h-full md:min-h-0 md:flex-none md:order-2 md:shrink-0 md:w-[min(100%,280px)] lg:w-[300px] xl:w-[360px] 2xl:w-[420px] md:border-l md:border-gray-300 ${roamingMode ? 'hidden' : ''}`}
        >
            <div className="bg-white border border-gray-300 p-3 sm:p-4 md:p-4 lg:p-5 flex h-full min-h-0 flex-col flex-1 overflow-hidden md:min-h-0">
              <CartActionBar
                cartLength={cart.length}
                itemCount={cart.reduce((s, i) => s + i.quantity, 0)}
                primaryColor={primaryColor}
                dict={dict}
                isCashier={isCashier}
                customerDisplayUrl={customerDisplayUrl}
                businessType={businessType}
                orderType={orderType}
                tableNumber={tableNumber}
                compact
                onSaveCart={() => setShowSaveCartModal(true)}
                onClearCart={clearCart}
                onLoadSavedCarts={() => {
                  setShowSavedCartsModal(true);
                  loadSavedCarts();
                }}
              />

              {/* Customer panel (retail) */}
              {businessType === 'retail' && (
                <div className="shrink-0 mb-3 min-w-0">
                  <DynamicCustomerSidePanel
                    tenant={tenant}
                    selectedCustomer={selectedCustomer}
                    onSelectCustomer={setSelectedCustomer}
                  />
                </div>
              )}

              {cart.length === 0 ? (
                <EmptyState icon="cart" title={dictValue('pos.cartEmpty', 'Cart is empty')} compact className="flex-1" />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 -mr-1 [scrollbar-gutter:stable]">
                    <div className="divide-y divide-gray-200 border border-gray-200 bg-white">
                    {cart.map((item) => {
                      const product = products.find((p) => p._id === item.productId);
                      return (
                        <CartLineItem
                          key={item.cartItemId}
                          item={item}
                          dict={dict}
                          businessType={businessType}
                          product={product}
                          onRemove={removeFromCart}
                          onUpdateQuantity={updateQuantity}
                          onQuantityError={(msg) => showToast.error(msg)}
                          onBranchLookup={
                            businessType === 'retail' && product
                              ? () => handleBranchLookup(product)
                              : undefined
                          }
                        />
                      );
                    })}
                    </div>
                    <CartUpsellSuggestions
                      suggestions={upsellSuggestions}
                      primaryColor={primaryColor}
                      dict={dict}
                      onAdd={(productId) => {
                        const product = products.find((p) => p._id === productId);
                        if (product) handleAddToCart(product);
                      }}
                    />
                  </div>

                  <CartDiscountSection
                    dict={dict}
                    primaryColor={primaryColor}
                    tenant={tenant}
                    cartLength={cart.length}
                    promoCode={promoCode}
                    setPromoCode={setPromoCode}
                    appliedDiscount={appliedDiscount}
                    applyingDiscount={applyingDiscount}
                    showDiscountSection={showDiscountSection}
                    setShowDiscountSection={setShowDiscountSection}
                    getSubtotal={getSubtotal}
                    sessionId={sessionId}
                    settings={settings ?? undefined}
                    fetchWithTimeout={fetchWithTimeout}
                    applyDiscount={applyDiscount}
                    setAppliedDiscount={setAppliedDiscount}
                    removeDiscount={removeDiscount}
                    onDiscountApplied={(msg) => showToast.success(msg)}
                    onDiscountError={(msg) => showToast.error(msg)}
                  />

                  <CartSummaryFooter
                    dict={dict}
                    primaryColor={primaryColor}
                    subtotal={getSubtotal()}
                    total={getTotal()}
                    taxAmount={getTaxAmount(
                      { taxEnabled: settings?.taxEnabled, taxRate: settings?.taxRate },
                      Math.max(0, getSubtotal() - (appliedDiscount?.amount || 0))
                    )}
                    appliedDiscount={appliedDiscount}
                    taxEnabled={settings?.taxEnabled}
                    taxLabel={settings?.taxLabel}
                    taxRate={settings?.taxRate}
                    processing={processing}
                    processingLabel={dictValue('pos.processing', 'Processing...')}
                    onCheckout={handleCheckout}
                  />
                </div>
              )}
            </div>
          </div>

        {/* Products column: nav width matches this column only */}
        <div className={`order-2 flex flex-col min-h-0 flex-1 min-w-0 md:order-1 ${roamingMode ? 'w-full' : ''}`}>
          <Navbar />
          <div
            ref={productsScrollRef}
            className="flex-1 overflow-y-auto min-h-0 mx-auto w-full px-3 sm:px-4 md:px-4 lg:px-5 py-3 sm:py-4 md:py-3 lg:py-4"
          >
            <div className="mb-4 md:mb-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3 md:mb-4">
                {/* Restaurant: order-type selector + table number */}
                {businessType === 'restaurant' ? (
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <h1 className="text-xl sm:text-2xl md:text-xl lg:text-2xl font-bold text-gray-900">{dict.pos.title}</h1>
                    <div className="flex gap-1">
                      {(['dine-in', 'takeout', 'delivery'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setOrderType(type)}
                          className={`px-3 py-2 text-sm font-semibold border-2 transition-all capitalize ${orderType === type
                            ? 'text-white border-transparent'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                            }`}
                          style={orderType === type ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}
                        >
                          {type === 'dine-in' ? '🍽 Dine-in' : type === 'takeout' ? '🥡 Takeout' : '🛵 Delivery'}
                        </button>
                      ))}
                    </div>
                    {orderType === 'dine-in' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium flex-shrink-0">Table #</span>
                        <input
                          type="text"
                          value={tableNumber}
                          onChange={(e) => {
                            setTableNumber(e.target.value.slice(0, 6));
                            setSelectedTableId('');
                          }}
                          placeholder="e.g. 5A"
                          className="w-24 px-3 py-1.5 text-sm border-2 border-gray-300 bg-white font-semibold"
                          onFocus={(e) => { e.currentTarget.style.borderColor = primaryColor; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <h1 className="text-xl sm:text-2xl md:text-xl lg:text-2xl xl:text-3xl font-bold text-gray-900">{dict.pos.title}</h1>
                )}
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">
                  {/* Quick Actions Row */}
                  {!isCashier && (
                    <div className={`${roamingMode ? 'grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto' : 'flex flex-wrap sm:flex-nowrap gap-2 max-w-full'}`}>

                      {/* Restaurant: Floor Map table selector + Check Requested */}
                      {businessType === 'restaurant' && orderType === 'dine-in' ? (
                        <div className={`flex items-center ${roamingMode ? 'gap-1 w-full' : 'gap-2 flex-shrink-0'}`}>
                          <button
                            type="button"
                            onClick={() => setShowFloorMap(true)}
                            className={`flex flex-col items-center justify-center gap-1 border-2 transition-all text-xs font-medium min-h-[52px] md:min-h-[56px] ${roamingMode ? 'w-full px-2 py-1.5 text-[11px]' : 'px-4 py-2 min-w-[100px]'} ${selectedTableId
                              ? 'bg-green-50 border-green-400 text-green-800'
                              : 'bg-orange-50 border-orange-300 text-orange-700 hover:border-orange-400'
                              }`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
                            </svg>
                            {tableNumber || 'Select Table'}
                          </button>
                          {selectedTableId && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await fetch(`/api/tables/${selectedTableId}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({ status: 'check-requested' }),
                                  });
                                  showToast.success(`${dictValue('pos.checkRequested', 'Check requested for')} ${tableNumber}`);
                                } catch {
                                  showToast.error(dictValue('pos.failedToUpdateTableStatus', 'Failed to update table status'));
                                }
                              }}
                              className={`flex flex-col items-center justify-center gap-1 bg-yellow-50 border-2 border-yellow-400 text-yellow-800 hover:bg-yellow-100 transition-all text-xs font-medium min-h-[52px] md:min-h-[56px] ${roamingMode ? 'w-full px-2 py-1.5 text-[11px]' : 'px-3 py-2'}`}
                              title={dictValue('pos.titleMarkCheckRequested', 'Mark check requested')}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              {dictValue('pos.checkBtn', 'Check')}
                            </button>
                          )}
                        </div>
                      ) : businessType === 'restaurant' ? (
                        /* Takeout/delivery: show order type label */
                        <div className={`flex flex-col justify-center gap-1 bg-orange-50 border-2 border-orange-200 text-gray-700 font-medium text-xs min-h-[52px] md:min-h-[56px] ${roamingMode ? 'w-full px-2 py-1.5 text-[11px]' : 'px-4 py-2 min-w-[100px]'}`}>
                          <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">{dictValue('pos.orderNumber', 'Order #')}</span>
                          <input
                            type="text"
                            value={tableNumber}
                            onChange={(e) => {
                              setTableNumber(e.target.value.slice(0, 8));
                              setSelectedTableId('');
                            }}
                            placeholder="T/O-1"
                            className={`text-sm border border-orange-300 bg-white font-semibold focus:outline-none focus:border-orange-500 ${roamingMode ? 'px-1 py-0.5' : 'px-2 py-1'}`}
                          />
                        </div>
                      ) : (
                        /* Retail / general: Split Check */
                        <button
                          type="button"
                          onClick={() => { if (cart.length > 0) { setSplitStep('guests'); setGuestPayments([]); setShowSplitCheckModal(true); } else showToast.error(dictValue('pos.cartEmptyAlert', 'Cart is empty')); }}
                          className={`flex items-center gap-2 min-h-[52px] md:min-h-[56px] bg-white border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-700 font-medium text-xs ${roamingMode ? 'w-full px-3 py-2' : 'flex-shrink-0 px-5 py-3'}`}
                          title={dictValue('pos.titleSplitBill', 'Split bill equally between guests')}
                        >
                          <svg className="w-5 h-5 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          <span>{dictValue('pos.splitCheck', 'Split Check')}</span>
                        </button>
                      )}

                      {/* Restaurant: Split Check button (always available) */}
                      {businessType === 'restaurant' && (
                        <button
                          type="button"
                          onClick={() => { if (cart.length > 0) { setSplitStep('guests'); setGuestPayments([]); setShowSplitCheckModal(true); } else showToast.error(dictValue('pos.cartEmptyAlert', 'Cart is empty')); }}
                          className={`flex items-center gap-1.5 min-h-[52px] md:min-h-[56px] bg-white border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-700 font-medium text-xs ${roamingMode ? 'w-full px-3 py-2' : 'flex-shrink-0 px-4 py-2'}`}
                          title={dictValue('pos.titleSplitBill', 'Split bill equally between guests')}
                        >
                          <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          <span>{dictValue('pos.split', 'Split')}</span>
                        </button>
                      )}

                      {/* Service/laundry: Schedule appointment */}
                      {(businessType === 'service' || businessType === 'laundry') && (
                        <div className={`flex flex-col justify-center gap-1 bg-brand-soft border-2 border-teal-200 text-gray-700 font-medium text-xs min-h-[52px] md:min-h-[56px] ${roamingMode ? 'w-full px-2 py-1.5 text-[11px]' : 'px-4 py-2 min-w-[140px]'}`}>
                          <span className="text-[10px] font-semibold text-brand uppercase tracking-wide">{dictValue('pos.scheduleFor', 'Schedule for')}</span>
                          <input
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            className={`border border-teal-300 bg-white font-medium focus:outline-none focus:border-brand ${roamingMode ? 'px-1 py-0.5 text-[10px]' : 'px-1 py-1 text-xs'}`}
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => cart.length > 0 ? setShowSaveCartModal(true) : showToast.error(dictValue('pos.cartEmptyAlert', 'Cart is empty'))}
                        className={`flex items-center gap-2 min-h-[52px] md:min-h-[56px] bg-white border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-700 font-medium text-xs ${roamingMode ? 'w-full px-3 py-2' : 'flex-shrink-0 px-5 py-3'}`}
                        title={dictValue('pos.titleHoldOrder', 'Hold current order')}
                      >
                        <svg className="w-5 h-5 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{dictValue('pos.holdOrder', 'Hold Order')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRefundModal(true)}
                        className={`flex items-center gap-2 min-h-[52px] md:min-h-[56px] bg-white border-2 border-gray-200 hover:border-red-200 hover:bg-red-50 transition-all text-gray-700 font-medium text-xs ${roamingMode ? 'w-full px-3 py-2' : 'flex-shrink-0 px-5 py-3'}`}
                        title={dictValue('pos.titleProcessRefund', 'Process a refund')}
                      >
                        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        <span>{dictValue('pos.refund', 'Refund')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowSavedCartsModal(true); loadSavedCarts(); }}
                        className={`flex items-center gap-2 min-h-[52px] md:min-h-[56px] bg-white border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all text-gray-700 font-medium text-xs ${roamingMode ? 'w-full px-3 py-2' : 'flex-shrink-0 px-5 py-3'}`}
                        title={dictValue('pos.titleSavedOrders', 'Load a saved order')}
                      >
                        <svg className="w-5 h-5 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>{dictValue('pos.savedOrders', 'Saved Orders')}</span>
                      </button>
                    </div>
                  )}

                  <div className="w-px min-h-[52px] md:min-h-[56px] bg-gray-200" />

                  <button
                    type="button"
                    onClick={() => { setRoamingMode((v) => !v); setShowRoamingCart(false); }}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border transition-colors flex-shrink-0 ${roamingMode
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    style={roamingMode ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}
                    title={roamingMode ? dictValue('pos.exitRoamingMode', 'Exit roaming mode') : dictValue('pos.enableRoamingMode', 'Enable roaming mode (line-busting)')}
                    aria-label={roamingMode ? dictValue('pos.exitRoamingMode', 'Exit roaming mode') : dictValue('pos.enableRoamingMode', 'Enable roaming mode')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden sm:inline">{roamingMode ? dictValue('pos.roamingMode', 'Roaming') : dictValue('pos.roamMode', 'Roam')}</span>
                    {roamingMode && (
                      <span className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mt-3 md:mt-4">
                <div className="relative flex-1 min-w-0">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={dict.pos.searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus={!device.isTouch}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pl-10 sm:pl-11 text-sm sm:text-base border-2 border-gray-300 bg-white transition-all"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  onClick={() => setShowQRScanner(true)}
                  className="px-2.5 py-2.5 sm:px-3 sm:py-3 min-h-[44px] min-w-[44px] text-white transition-colors border flex-shrink-0"
                  style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}dd`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = primaryColor; }}
                  title={dictValue('pos.scanQRCode', 'Scan QR Code')}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowRefundModal(true)}
                  className="px-2.5 py-2.5 sm:px-3 sm:py-3 min-h-[44px] min-w-[44px] bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700 flex-shrink-0"
                  title={dict.pos.refunds}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode('grid')}
                  className="px-2.5 py-2.5 sm:px-3 sm:py-3 min-h-[44px] min-w-[44px] bg-white transition-all flex-shrink-0 border-2"
                  style={
                    displayMode === 'grid'
                      ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, color: primaryColor }
                      : { borderColor: '#d1d5db', color: '#374151' }
                  }
                  title={dictValue('common.gridView', 'Grid View')}
                  aria-label={dictValue('common.gridView', 'Grid View')}
                  aria-pressed={displayMode === 'grid'}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode('list')}
                  className="px-2.5 py-2.5 sm:px-3 sm:py-3 min-h-[44px] min-w-[44px] bg-white transition-all flex-shrink-0 border-2"
                  style={
                    displayMode === 'list'
                      ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, color: primaryColor }
                      : { borderColor: '#d1d5db', color: '#374151' }
                  }
                  title={dictValue('common.listView', 'List View')}
                  aria-label={dictValue('common.listView', 'List View')}
                  aria-pressed={displayMode === 'list'}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>


            <ProductGrid
              products={products}
              status={productsStatus}
              source={productsSource}
              error={productsError}
              search={search}
              gridClassName={productGridClass}
              listClassName={productListClass}
              cardHeightClass={productCardHeightClass}
              displayMode={displayMode}
              primaryColor={primaryColor}
              businessType={businessType}
              cart={cart}
              dict={dict}
              addLabel={dict.common?.add || 'Add'}
              onAdd={handleAddToCart}
              onTogglePin={handleTogglePin}
              onClearSearch={() => setSearch('')}
              onRetry={refetchProducts}
              hasMore={productsHasMore}
              loadingMore={productsLoadingMore}
              onLoadMore={loadMoreProducts}
              scrollRootRef={productsScrollRef}
            />
          </div>
        </div>
      </div>

      {/* Roaming Mode — Floating Cart Button */}
      {roamingMode && (
        <button
          type="button"
          onClick={() => setShowRoamingCart(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 min-h-[44px] text-white font-bold shadow-2xl border-2 border-white/20 transition-all active:scale-95"
          style={{ backgroundColor: primaryColor }}
          aria-label={`${dict.pos.cart}, ${cart.reduce((s, i) => s + i.quantity, 0)} ${dict.pos?.items || 'items'}, ${dict.pos?.total || dict.common?.total || 'Total'} ${getTotal()}`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span>{dict.pos.cart}</span>
          {cart.length > 0 ? (
            <>
              <span className="bg-white/20 px-2.5 py-0.5 text-sm font-bold">
                {cart.reduce((s, i) => s + i.quantity, 0)} {dict.pos.items || 'items'}
              </span>
              <span className="text-white/90 text-base font-bold">
                <Currency amount={getTotal()} />
              </span>
            </>
          ) : (
            <span className="text-white/70 text-sm">{dict.pos.cartEmpty}</span>
          )}
        </button>
      )}

      {/* Roaming Mode — Bottom Sheet Cart */}
      {roamingMode && showRoamingCart && (
        <PosRoamingCart
          primaryColor={primaryColor}
          dict={dict}
          dictValue={dictValue}
          tenant={tenant}
          cart={cart}
          products={products}
          businessType={businessType}
          orderType={orderType}
          tableNumber={tableNumber}
          isCashier={isCashier}
          customerDisplayUrl={customerDisplayUrl}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={setSelectedCustomer}
          upsellSuggestions={upsellSuggestions}
          promoCode={promoCode}
          setPromoCode={setPromoCode}
          appliedDiscount={appliedDiscount}
          applyingDiscount={applyingDiscount}
          showDiscountSection={showDiscountSection}
          setShowDiscountSection={setShowDiscountSection}
          sessionId={sessionId}
          settings={settings ?? undefined}
          processing={processing}
          fetchWithTimeout={fetchWithTimeout}
          applyDiscount={applyDiscount}
          setAppliedDiscount={setAppliedDiscount}
          removeDiscount={removeDiscount}
          getSubtotal={getSubtotal}
          getTotal={getTotal}
          getTaxAmount={getTaxAmount}
          onClose={() => setShowRoamingCart(false)}
          onSaveCart={() => setShowSaveCartModal(true)}
          onClearCart={clearCart}
          onLoadSavedCarts={() => {
            setShowSavedCartsModal(true);
            loadSavedCarts();
          }}
          onCheckout={() => {
            setShowRoamingCart(false);
            handleCheckout();
          }}
          onRemoveFromCart={removeFromCart}
          onUpdateQuantity={updateQuantity}
          onQuantityError={(msg) => showToast.error(msg)}
          onAddProduct={handleAddToCart}
          onDiscountApplied={(msg) => showToast.success(msg)}
          onDiscountError={(msg) => showToast.error(msg)}
        />
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <PosPaymentModal
          dict={dict}
          dictValue={dictValue}
          primaryColor={primaryColor}
          total={getTotal()}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashReceived={cashReceived}
          setCashReceived={setCashReceived}
          paymentProvider={paymentProvider}
          setPaymentProvider={setPaymentProvider}
          paymentReference={paymentReference}
          setPaymentReference={setPaymentReference}
          bnplInstallments={bnplInstallments}
          setBnplInstallments={setBnplInstallments}
          enableOnAccountSales={enableOnAccountSales}
          selectedCustomer={selectedCustomer}
          processing={processing}
          onClose={() => setShowPaymentModal(false)}
          onCompletePayment={completePayment}
        />
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <PosRefundModal
          dict={dict}
          primaryColor={primaryColor}
          settings={settings}
          refundTransaction={refundTransaction as PosRefundTransaction | null}
          refundTransactionId={refundTransactionId}
          setRefundTransactionId={setRefundTransactionId}
          refundItems={refundItems}
          refundReason={refundReason}
          setRefundReason={setRefundReason}
          refundNotes={refundNotes}
          setRefundNotes={setRefundNotes}
          refunding={refunding}
          maxRefundNotesLength={MAX_REFUND_NOTES_LENGTH}
          onClose={closeRefundModal}
          onCloseFull={closeRefundModal}
          onLookupTransaction={lookupTransaction}
          onProcessRefund={handleProcessRefund}
          addRefundItem={addRefundItem}
          removeRefundItem={removeRefundItem}
          updateRefundQty={updateRefundQty}
          calculateRefundAmount={calculateRefundAmount as (transaction: PosRefundTransaction) => number}
          currentRefundTransaction={currentRefundTransaction as PosRefundTransaction | null}
        />
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
                  className="w-full px-4 py-3 text-base border-2 border-gray-300 transition-all"
                  placeholder={dict.pos?.cartNamePlaceholder || 'Enter a name for this cart'}
                  autoFocus
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
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
        <PosSavedCartsModal
          dict={dict}
          primaryColor={primaryColor}
          settings={settings}
          loading={loadingSavedCarts}
          savedCarts={savedCarts}
          error={savedCartsError}
          onRetry={loadSavedCarts}
          onClose={() => setShowSavedCartsModal(false)}
          onLoadCart={loadCart}
          onDeleteCart={deleteSavedCart}
        />
      )}

      {/* Age Verification Modal */}
      {showAgeVerificationModal && pendingAgeVerifyProduct && (
        <PosAgeVerificationModal
          product={pendingAgeVerifyProduct}
          onCancel={() => {
            setShowAgeVerificationModal(false);
            setPendingAgeVerifyProduct(null);
          }}
          onConfirm={() => {
            if (pendingAgeVerifyProduct) {
              handleAddToCart(pendingAgeVerifyProduct);
            }
            setShowAgeVerificationModal(false);
            setPendingAgeVerifyProduct(null);
          }}
        />
      )}

      {/* Split Check Modal */}
      {showSplitCheckModal && (
        <PosSplitCheckModal
          dictValue={dictValue}
          primaryColor={primaryColor}
          total={getTotal()}
          splitStep={splitStep}
          setSplitStep={setSplitStep}
          splitGuests={splitGuests}
          setSplitGuests={setSplitGuests}
          guestPayments={guestPayments}
          setGuestPayments={setGuestPayments}
          enableOnAccountSales={enableOnAccountSales}
          processing={processing}
          onClose={() => {
            setShowSplitCheckModal(false);
            setSplitStep('guests');
            setGuestPayments([]);
          }}
          onCollectGuest={handleCollectGuest}
          onCompleteSplitPayment={handleCompleteSplitPayment}
        />
      )}

      {confirmDialog}

      {/* Sale Unit Selector Modal */}
      {showUnitModal && pendingUnitProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{pendingUnitProduct.name}</h2>
                <p className="text-sm text-gray-500">{dict.pos?.selectSaleUnit || 'Select sale unit'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUnitModal(false);
                  setPendingUnitProduct(null);
                  setPendingUnitVariant(undefined);
                  setPendingUnitModifiers(undefined);
                }}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 gap-3 max-h-80 overflow-y-auto">
              {getSaleUnits(pendingUnitProduct).map((unit) => {
                const stockBase = pendingUnitVariant?.stock ?? pendingUnitProduct.stock;
                const maxQty = getMaxSaleUnitQuantity(stockBase, unit.factor);
                const basePrice = pendingUnitVariant?.price ?? pendingUnitProduct.price;
                const unitPrice = resolveSaleUnitPrice({ price: basePrice }, unit);
                const outOfStock =
                  maxQty === 0 && !pendingUnitProduct.allowOutOfStockSales && pendingUnitProduct.trackInventory !== false;
                return (
                  <button
                    key={unit.code}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => {
                      addToCart(
                        pendingUnitProduct,
                        pendingUnitVariant,
                        pendingUnitModifiers,
                        unit
                      );
                      setShowUnitModal(false);
                      setPendingUnitProduct(null);
                      setPendingUnitVariant(undefined);
                      setPendingUnitModifiers(undefined);
                    }}
                    className={`flex items-center justify-between p-3 border-2 transition-all text-left ${
                      outOfStock
                        ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                        : 'border-gray-300 hover:border-brand hover:bg-brand-soft cursor-pointer'
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-sm text-gray-900">{unit.label}</span>
                      <span className={`block text-[11px] mt-1 font-medium ${
                        outOfStock ? 'text-red-500' : maxQty <= 5 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {outOfStock
                          ? (dict.pos?.outOfStock || 'Out of stock')
                          : `${maxQty} ${dict.pos?.available || 'available'}`}
                      </span>
                    </div>
                    <Currency amount={unitPrice} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Variant Selector Modal */}
      {showVariantModal && pendingVariantProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">{pendingVariantProduct.name}</h2>
                <p className="text-sm text-gray-500">Select a variant</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowVariantModal(false); setPendingVariantProduct(null); }}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
              {(pendingVariantProduct.variations || []).map((v, idx) => {
                const label = [v.size, v.color, v.type].filter(Boolean).join(' / ') || v.sku || `Variant ${idx + 1}`;
                const effectivePrice = v.price ?? pendingVariantProduct.price;
                const effectiveStock = v.stock ?? 0;
                const sku = v.sku || `${pendingVariantProduct._id}-v${idx}`;
                const outOfStock = effectiveStock === 0 && !pendingVariantProduct.allowOutOfStockSales;
                return (
                  <button
                    key={sku}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => {
                      handleAddToCart(pendingVariantProduct, {
                        sku,
                        label,
                        price: v.price,
                        stock: effectiveStock,
                        variation: { size: v.size, color: v.color, type: v.type },
                      });
                      setShowVariantModal(false);
                      setPendingVariantProduct(null);
                    }}
                    className={`flex flex-col items-start p-3 border-2 transition-all text-left ${outOfStock
                      ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-300 hover:border-brand hover:bg-brand-soft cursor-pointer'
                      }`}
                  >
                    <span className="font-semibold text-sm text-gray-900">{label}</span>
                    <span className="text-sm text-gray-600 mt-0.5">
                      <Currency amount={effectivePrice} />
                    </span>
                    <span className={`text-[11px] mt-1 font-medium ${outOfStock ? 'text-red-500' : effectiveStock <= 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {outOfStock ? 'Out of stock' : `${effectiveStock} in stock`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cross-Branch Inventory Lookup Modal */}
      {branchLookupProduct && (
        <PosBranchLookupModal
          product={branchLookupProduct}
          loading={loadingBranchLookup}
          data={branchLookupData}
          error={branchLookupError}
          onRetry={() => handleBranchLookup(branchLookupProduct)}
          onClose={() => {
            setBranchLookupProduct(null);
            setBranchLookupError(null);
          }}
        />
      )}

      {/* Floor Map Modal */}
      {showFloorMap && (
        <FloorMap
          tenant={tenant}
          selectedTableId={selectedTableId}
          onSelectTable={async (table) => {
            setSelectedTableId(table._id);
            setTableNumber(table.name);
            setShowFloorMap(false);
            // Mark table as occupied
            try {
              await fetch(`/api/tables/${table._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status: 'occupied' }),
              });
            } catch {
              // non-critical
            }
          }}
          onClose={() => setShowFloorMap(false)}
        />
      )}

      {/* Modifier Slide-Out Modal */}
      {showModifierModal && pendingModifierProduct && (
        <PosModifierModal
          product={pendingModifierProduct}
          selectedModifiers={selectedModifiers}
          setSelectedModifiers={setSelectedModifiers}
          onClose={() => {
            setShowModifierModal(false);
            setPendingModifierProduct(null);
          }}
          onAddToOrder={(modifiers) => {
            handleAddToCart(pendingModifierProduct, undefined, modifiers);
            setShowModifierModal(false);
            setPendingModifierProduct(null);
          }}
        />
      )}

    </div>
  );
}
