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
import { TranslationDict } from '@/types/dictionary';
import dynamic from 'next/dynamic';
import PageLoading from '@/components/ui/PageLoading';
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
import {
  AlertTriangle, CirclePause, FolderOpen, LayoutGrid, List, Loader2, LogOut, QrCode, Radio,
  ScanBarcode, Search, ShoppingBasket, ShoppingCart, Smartphone, Split, Undo2, Wallet, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { hardwareService } from '@/lib/hardware';
import { getAssignedDeviceId } from '@/lib/device-identity';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDate, formatDateTime, formatTime } from '@/lib/formatting';
import { useDeviceType } from '@/hooks/useDeviceType';
import type { CustomerSummary } from '@/types/customer';
import CartLineItem from '@/components/pos/CartLineItem';
import CartActionBar from '@/components/pos/CartActionBar';
import CartDiscountSection from '@/components/pos/CartDiscountSection';
import CartSummaryFooter from '@/components/pos/CartSummaryFooter';
import CartUpsellSuggestions from '@/components/pos/CartUpsellSuggestions';
import ProductGrid from '@/components/pos/ProductGrid';
import { usePosProducts, type PosProduct } from '@/hooks/usePosProducts';
import { CartVariant } from '@/hooks/useCart';
import { SplitPaymentEntry } from '@/hooks/usePayment';
import type { SplitGuestPayment } from '@/components/pos/modals/PosSplitCheckModal';
import type { RefundTransaction as PosRefundTransaction } from '@/components/pos/modals/PosRefundModal';

type Product = PosProduct;

// Inset field shadow shared with the gloss forms (see fieldCls in app/signup/page.tsx).
const fieldShadow = 'shadow-[inset_0_1px_2px_rgba(16,42,56,0.06)]';

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
  const { canAccess } = usePermissions();
  const isCashier = authUser?.role === 'cashier';
  // Mirrors the backend's refunds.process permission check (see app/api/transactions/[id]/refund) —
  // hides the refund entry points for roles that can't refund, respecting tenant overrides.
  const canRefund = canAccess('refunds.process');
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const enableOnAccountSales = settings?.enableOnAccountSales === true;
  const rawBt = (settings?.businessType || 'general').toLowerCase();
  const businessType = rawBt === 'retail' ? 'retail' as const : 'general' as const;
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

  // Retail: customer side panel
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  // Retail: cross-branch inventory lookup
  const [branchLookupProduct, setBranchLookupProduct] = useState<Product | null>(null);
  const [branchLookupData, setBranchLookupData] = useState<Array<{ branchId: string; stock: number; name: string }>>([]);
  const [loadingBranchLookup, setLoadingBranchLookup] = useState(false);
  const [branchLookupError, setBranchLookupError] = useState<string | null>(null);

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
    findByCode: findProductByCode,
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
  const [scPwdName, setScPwdName] = useState('');
  const [scPwdId, setScPwdId] = useState('');
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

  // Debounce search input. Search runs against the on-device catalog (usePosProducts), so a short
  // delay is enough — it only smooths re-renders and costs no database reads.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 150);
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
      }
    }
  }, [showAgeVerificationModal, showSplitCheckModal, showPaymentModal, showRefundModal, showSavedCartsModal, showSaveCartModal, showQRScanner, showCashDrawerModal, closingSummary, showRoamingCart, setCashReceived, setPaymentProvider, setPaymentReference]);

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
      const id = crypto.randomUUID();
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
      !showRoamingCart
    ) {
      if (!device.isTouch) {
        searchInputRef.current?.focus();
      }
    }
  }, [showPaymentModal, showQRScanner, showRefundModal, showSavedCartsModal, showSaveCartModal, showAgeVerificationModal, showSplitCheckModal, showRoamingCart, device.isTouch]);

  // Handle barcode scanning
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;

    setSearch('');

    // Fast path: the on-device catalog (no database read)
    let product = findProductByCode(code);

    // Fallback: indexed API lookup for products the catalog hasn't synced yet
    if (!product) {
      try {
        const res = await fetch(`/api/products/by-barcode?code=${encodeURIComponent(code)}&tenant=${tenant}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.product) {
            product = data.data.product as PosProduct;
          }
        }
      } catch {
        // fall through to "not found"
      }
    }

    if (product && (product.stock > 0 || product.allowOutOfStockSales)) {
      handleAddToCart(product);
    } else {
      if (dict) {
        showToast.error(dict.pos.productNotFound || 'Product not found');
      }
    }
  }, [findProductByCode, tenant, dict, addToCart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle QR code scan
  const handleQRScan = useCallback((data: string) => {
    // QR codes might contain product IDs, URLs, or other data
    // Try to parse as product ID first
    const product = findProductByCode(data);
    if (product && (product.stock > 0 || product.allowOutOfStockSales)) {
      handleAddToCart(product);
      setShowQRScanner(false);
    }
  }, [findProductByCode, addToCart]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const handleAddToCart = (product: Product, variant?: CartVariant) => {
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
    addToCart(product, variant);
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
    setScPwdName('');
    setScPwdId('');
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
      if (!data.success) {
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
    const isScPwd = transaction.discountCategory === 'senior' || transaction.discountCategory === 'pwd';
    const taxableBase = (transaction.subtotal || transaction.total) - (transaction.discountAmount || 0);
    // SC/PWD transactions are fully VAT-exempt (RA 9994 / RA 10754) — never taxed
    const taxAmount = isScPwd ? 0 : (taxEnabled ? taxableBase * (settings.taxRate! / 100) : undefined);
    const isVAT = !isScPwd && !!(taxEnabled && (settings.taxLabel || '').toUpperCase().includes('VAT'));
    const ptuDateStr = settings.birPtuIssuedDate
      ? new Date(settings.birPtuIssuedDate).toLocaleDateString()
      : undefined;
    const ptuValidUntilStr = settings.birPtuExpiryDate
      ? new Date(settings.birPtuExpiryDate).toLocaleDateString()
      : undefined;
    const accreditationDateStr = settings.birAccreditationDate
      ? new Date(settings.birAccreditationDate).toLocaleDateString()
      : undefined;
    const accreditationValidUntilStr = settings.birAccreditationValidUntil
      ? new Date(settings.birAccreditationValidUntil).toLocaleDateString()
      : undefined;

    const receiptData = {
      storeName: settings.companyName,
      address: addressStr,
      phone: settings.phone,
      logo: settings.receiptShowLogo !== false ? settings.logo : undefined,
      receiptNumber: transaction.receiptNumber || transaction._id?.slice(-8) || 'N/A',
      date: transaction.date || formatDateTime(new Date(transaction.createdAt || Date.now()), settings || getDefaultTenantSettings()),
      items: (transaction.items || []).map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...item,
        taxable: isScPwd ? false : undefined,
      })),
      subtotal: transaction.subtotal || transaction.total,
      discount: transaction.discountAmount || undefined,
      tax: taxAmount,
      taxLabel: settings.taxLabel,
      taxRate: settings.taxRate,
      zeroRatedSales: transaction.zeroRatedAmount || 0,
      total: transaction.total,
      paymentMethod: transaction.paymentMethod,
      cashReceived: transaction.cashReceived,
      change: transaction.change,
      footer: settings.receiptFooter,
      header: settings.receiptHeader,
      template: templateHtml,
      cashierName: authUser?.name,
      // BIR compliance
      tin: settings.birTin,
      businessStyle: settings.birBusinessStyle,
      ptuNumber: settings.birPtuNumber,
      ptuDate: ptuDateStr,
      ptuValidUntil: ptuValidUntilStr,
      minNumber: settings.birMinNumber,
      // Prefer the specific device's serial number (per-terminal, BYOD-compliant) over the
      // tenant-wide fallback, so multi-terminal merchants print the correct machine identity.
      terminalSN: transaction.deviceSerialNumber || settings.birTerminalSN,
      terminalId: transaction.terminalId,
      systemProvider: settings.birSystemProvider,
      accreditationNo: settings.birAccreditationNo,
      accreditationDate: accreditationDateStr,
      accreditationValidUntil: accreditationValidUntilStr,
      isVAT,
      // Senior Citizen / PWD discount block
      scPwdName: isScPwd ? transaction.scPwdName : undefined,
      scPwdId: isScPwd ? transaction.scPwdId : undefined,
      scPwdDiscount: isScPwd ? transaction.discountAmount : undefined,
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

  // Register function keys (F2 search … F9 charge). Re-bound every render so handlers see fresh state;
  // ignored while a modal or the start-shift overlay is up.
  const anyModalOpen =
    showPaymentModal || showRefundModal || showSavedCartsModal || showSaveCartModal || showQRScanner ||
    showAgeVerificationModal || showSplitCheckModal || showVariantModal || !!showCashDrawerModal ||
    !!branchLookupProduct || showRoamingCart;
  const shiftBlocked = isCashier && !cashDrawerSession;
  useEffect(() => {
    if (anyModalOpen || shiftBlocked) return;
    const actions: Record<string, (() => void) | undefined> = {
      F2: () => searchInputRef.current?.focus(),
      F3: isCashier ? undefined : () => {
        if (cart.length === 0) return showToast.error(dictValue('pos.cartEmptyAlert', 'Cart is empty'));
        setSplitStep('guests');
        setGuestPayments([]);
        setShowSplitCheckModal(true);
      },
      F4: isCashier ? undefined : () =>
        cart.length > 0 ? setShowSaveCartModal(true) : showToast.error(dictValue('pos.cartEmptyAlert', 'Cart is empty')),
      F6: isCashier ? undefined : () => { setShowSavedCartsModal(true); loadSavedCarts(); },
      F7: canRefund ? () => setShowRefundModal(true) : undefined,
      F8: () => setShowQRScanner(true),
      F9: handleCheckout,
    };
    const onKey = (e: KeyboardEvent) => {
      const action = actions[e.key];
      if (!action || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      action();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const completePayment = async () => {
    const result = await processPayment(
      cart,
      appliedDiscount,
      getTotal(),
      tenant,
      (msg) => showToast.error(msg),
      fetchWithTimeout,
      selectedCustomer?._id,
      undefined,
      { name: scPwdName || undefined, id: scPwdId || undefined },
      getAssignedDeviceId(tenant) || undefined
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
      splitEntries,
      { name: scPwdName || undefined, id: scPwdId || undefined },
      getAssignedDeviceId(tenant) || undefined
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
      if (result.data) printReceipt(result.data);
    } else if (result) {
      const message =
        result.error ||
        (Array.isArray(result.errors) && result.errors.map((e) => e.message).filter(Boolean).join(', ')) ||
        dictValue('pos.paymentFailed', 'Payment failed');
      showToast.error(message);
    }
  };

  const settingsOrDefault = settings || getDefaultTenantSettings();
  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const emptyCartToast = () => showToast.error(dictValue('pos.cartEmptyAlert', 'Cart is empty'));
  const fnKeys: Array<{ key: string; label: string; title: string; icon: typeof Split; onClick: () => void; danger?: boolean }> = [
    ...(!isCashier
      ? [
          {
            key: 'F3',
            label: dictValue('pos.splitCheck', 'Split Check'),
            title: dictValue('pos.titleSplitBill', 'Split bill equally between guests'),
            icon: Split,
            onClick: () => { if (cart.length > 0) { setSplitStep('guests'); setGuestPayments([]); setShowSplitCheckModal(true); } else emptyCartToast(); },
          },
          {
            key: 'F4',
            label: dictValue('pos.holdOrder', 'Hold Order'),
            title: dictValue('pos.titleHoldOrder', 'Hold current order'),
            icon: CirclePause,
            onClick: () => (cart.length > 0 ? setShowSaveCartModal(true) : emptyCartToast()),
          },
          {
            key: 'F6',
            label: dictValue('pos.savedOrders', 'Saved Orders'),
            title: dictValue('pos.titleSavedOrders', 'Load a saved order'),
            icon: FolderOpen,
            onClick: () => { setShowSavedCartsModal(true); loadSavedCarts(); },
          },
        ]
      : []),
    ...(canRefund
      ? [{
          key: 'F7',
          label: dictValue('pos.refund', 'Refund'),
          title: dictValue('pos.titleProcessRefund', 'Process a refund'),
          icon: Undo2,
          onClick: () => setShowRefundModal(true),
          danger: true,
        }]
      : []),
  ];

  return (
    <div className="mk-root flex h-dvh min-h-0 flex-col bg-[#eef3f5]">
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
        <div className="shrink-0 bg-amber-50 border-b border-amber-300 px-4 py-1.5 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-amber-900 min-w-0">
            <AlertTriangle className="size-4 flex-shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="font-medium truncate">{hwStatusMsg}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setHwStatusMsg(null)}
            className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
            aria-label={dictValue('common.close', 'Close')}
          >
            <X aria-hidden />
          </Button>
        </div>
      )}

      {/* Cash drawer shift strip */}
      {cashDrawerSession && (
        <div className="mk-dark shrink-0 border-b border-black/40 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-white">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2 py-0.5 font-bold uppercase tracking-wider text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
              {dict.pos?.shiftActive || 'Shift Active'}
            </span>
            <span className="mk-lcd rounded px-2 py-0.5 font-bold tabular-nums hidden sm:inline-block">
              {dictValue('pos.opened', 'Opened')} {formatTime(cashDrawerSession.openingTime, settingsOrDefault)}
            </span>
            <span className="mk-lcd rounded px-2 py-0.5 font-bold tabular-nums">
              {dictValue('pos.float', 'Float')} <Currency amount={cashDrawerSession.openingAmount} />
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
              <Radio
                className={stockSyncConnected ? 'size-3.5 text-emerald-300' : 'size-3.5 text-white/35'}
                strokeWidth={2.25}
                aria-hidden
              />
              {stockSyncConnected ? dictValue('pos.stockLive', 'Stock live') : dictValue('pos.stockOffline', 'Stock offline')}
            </span>
            <Button
              type="button"
              variant="key"
              size="sm"
              className="h-7 text-red-300"
              onClick={async () => {
                const ok = await confirm(
                  dictValue('pos.endShift', 'End shift'),
                  dictValue('pos.endShiftConfirm', 'End your shift? You will count the cash in the drawer next.')
                );
                if (!ok) return;
                setDrawerAmount('');
                setDrawerNotes('');
                setClosingSummary(null);
                setShowCashDrawerModal('close');
              }}
            >
              <LogOut strokeWidth={2.25} aria-hidden />
              {dictValue('pos.endShift', 'End shift')}
            </Button>
          </div>
        </div>
      )}

      {/* Start Shift Overlay - only blocks cashier role when no cash drawer session */}
      {isCashier && !cashDrawerSession && !cashDrawerLoading && productsStatus !== 'loading' && (
        <div className="fixed inset-0 z-50 bg-[#0a1620]/70 backdrop-blur-sm flex items-center justify-center" style={{ top: '64px' }}>
          <div className="mk-dark mk-glass mk-hero-in rounded-xl p-6 sm:p-8 max-w-md w-full mx-4 text-center text-white">
            <span className="mk-key-brand mx-auto mb-4 flex size-14 items-center justify-center rounded-md">
              <Wallet className="size-7" strokeWidth={2.25} aria-hidden />
            </span>
            <h2 className="text-2xl font-bold mb-1.5">{dictValue('pos.startYourShift', 'Start Your Shift')}</h2>
            <p className="text-sm text-white/70 mb-6">{dictValue('pos.startShiftDescription', 'Open the cash drawer to begin processing transactions.')}</p>
            <Button
              type="button"
              variant="brand"
              size="xl"
              className="w-full mb-2"
              onClick={() => {
                setDrawerAmount('');
                setDrawerNotes('');
                setShowCashDrawerModal('open');
              }}
            >
              <Wallet strokeWidth={2.25} aria-hidden />
              {dictValue('pos.openCashDrawer', 'Open Cash Drawer')}
            </Button>
            <Button
              type="button"
              variant="key"
              size="xl"
              className="w-full"
              onClick={async () => {
                await logout();
                window.location.href = `/${tenant}/${lang}/login`;
              }}
            >
              <LogOut strokeWidth={2.25} aria-hidden />
              {dictValue('common.logout', 'Logout')}
            </Button>
          </div>
        </div>
      )}

      {/* Cash Drawer Open/Close Modal */}
      {showCashDrawerModal && (
        <div className="fixed inset-0 z-[60] bg-[#0a1620]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="mk-panel mk-hero-in rounded-xl p-5 sm:p-6 max-w-md w-full text-gray-900">
            <div className="flex items-center gap-3 mb-4">
              <span className={`${showCashDrawerModal === 'open' ? 'mk-key-brand' : 'mk-key'} flex size-10 items-center justify-center rounded-md`}>
                <Wallet className="size-5" strokeWidth={2.25} aria-hidden />
              </span>
              <h3 className="text-lg font-bold">
                {showCashDrawerModal === 'open' ? dictValue('pos.openCashDrawer', 'Open Cash Drawer') : dictValue('pos.closeCashDrawer', 'Close Cash Drawer')}
              </h3>
            </div>

            {closingSummary ? (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">{dictValue('pos.shiftSummary', 'Shift Summary')}</h4>
                <dl className="mk-lcd rounded-md p-3 space-y-1.5 text-sm tabular-nums">
                  <div className="flex justify-between gap-3">
                    <dt className="opacity-80">{dictValue('admin.expectedAmount', 'Expected Amount')}</dt>
                    <dd className="font-bold"><Currency amount={closingSummary.expectedAmount || 0} /></dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="opacity-80">{dictValue('pos.actualClosing', 'Actual Closing')}</dt>
                    <dd className="font-bold"><Currency amount={closingSummary.closingAmount || 0} /></dd>
                  </div>
                  <div className="border-t border-[#7ef0d6]/25 pt-1.5 flex justify-between gap-3 font-bold">
                    <dt>{dictValue('pos.difference', 'Difference')}</dt>
                    <dd className={
                      (closingSummary.shortage || 0) > 0 ? 'text-red-300' :
                        (closingSummary.overage || 0) > 0 ? 'text-amber-200' : ''
                    }>
                      {(closingSummary.shortage || 0) > 0 && <>{dictValue('pos.short', 'Short')} <Currency amount={closingSummary.shortage || 0} /></>}
                      {(closingSummary.overage || 0) > 0 && <>{dictValue('pos.over', 'Over')} <Currency amount={closingSummary.overage || 0} /></>}
                      {!(closingSummary.shortage || 0) && !(closingSummary.overage || 0) && dictValue('pos.balanced', 'Balanced')}
                    </dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  variant="brand"
                  size="xl"
                  className="w-full"
                  onClick={() => {
                    setClosingSummary(null);
                    setShowCashDrawerModal(null);
                  }}
                >
                  {dictValue('common.done', 'Done')}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="drawer-amount">
                      {showCashDrawerModal === 'open' ? dictValue('admin.openingAmount', 'Opening Amount') : dictValue('pos.actualClosingAmount', 'Actual Closing Amount')}
                    </Label>
                    <Input
                      id="drawer-amount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={drawerAmount}
                      onChange={(e) => setDrawerAmount(e.target.value)}
                      placeholder="0.00"
                      className={`h-12 bg-white font-mono text-lg tabular-nums placeholder:text-gray-400 ${fieldShadow}`}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="drawer-notes">{dictValue('pos.notesOptional', 'Notes (optional)')}</Label>
                    <Input
                      id="drawer-notes"
                      type="text"
                      value={drawerNotes}
                      onChange={(e) => setDrawerNotes(e.target.value)}
                      placeholder={dictValue('pos.morningShiftPlaceholder', 'e.g. Morning shift')}
                      className={`h-11 bg-white placeholder:text-gray-400 ${fieldShadow}`}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="light"
                    size="xl"
                    className="flex-1"
                    onClick={() => {
                      setShowCashDrawerModal(null);
                      setDrawerAmount('');
                      setDrawerNotes('');
                    }}
                  >
                    {dictValue('common.cancel', 'Cancel')}
                  </Button>
                  <Button
                    type="button"
                    variant={showCashDrawerModal === 'open' ? 'brand' : 'key'}
                    size="xl"
                    className="flex-1"
                    onClick={showCashDrawerModal === 'open' ? handleOpenDrawer : handleCloseDrawer}
                    disabled={cashDrawerLoading || !drawerAmount}
                  >
                    {cashDrawerLoading && <Loader2 className="animate-spin" aria-hidden />}
                    {cashDrawerLoading
                      ? dictValue('pos.processing', 'Processing...')
                      : showCashDrawerModal === 'open'
                        ? dictValue('pos.openDrawer', 'Open Drawer')
                        : dictValue('pos.closeDrawer', 'Close Drawer')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile: stacked cart + products. Tablet/laptop (md+): products left, register column right */}
      <div
        className={`flex flex-col flex-1 min-h-0 overflow-hidden ${roamingMode ? '' : 'md:flex-row'}`}
      >
        {/* Register column - hidden in roaming mode (replaced by FAB + bottom sheet) */}
        <div
          className={`order-1 flex flex-col min-h-0 flex-1 max-h-[min(50vh,440px)] sm:max-h-[min(55vh,480px)] md:max-h-none md:h-full md:min-h-0 md:flex-none md:order-2 md:shrink-0 md:w-[min(100%,300px)] lg:w-[320px] xl:w-[380px] 2xl:w-[420px] ${roamingMode ? 'hidden' : ''}`}
        >
          <div className="mk-dark text-white flex h-full min-h-0 flex-1 flex-col overflow-hidden p-2.5 sm:p-3 md:border-l md:border-black/40">
            <CartActionBar
              cartLength={cart.length}
              itemCount={cartItemCount}
              dict={dict}
              isCashier={isCashier}
              customerDisplayUrl={customerDisplayUrl}
              compact
              tone="dark"
              onSaveCart={() => setShowSaveCartModal(true)}
              onClearCart={clearCart}
              onLoadSavedCarts={() => {
                setShowSavedCartsModal(true);
                loadSavedCarts();
              }}
            />

            {/* Customer panel (retail) */}
            {businessType === 'retail' && (
              <div className="shrink-0 mb-2 min-w-0 rounded-lg bg-white p-1.5 text-gray-900">
                <DynamicCustomerSidePanel
                  tenant={tenant}
                  selectedCustomer={selectedCustomer}
                  onSelectCustomer={setSelectedCustomer}
                />
              </div>
            )}

            {/* Receipt paper: ticket lines, upsell, discounts */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-white text-gray-900 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.7)]">
              <div className="flex shrink-0 items-center justify-between border-b border-dashed border-gray-300 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400">
                <span>{dictValue('pos.ticket', 'Ticket')}</span>
                <span className="tabular-nums">{formatDate(new Date(), settingsOrDefault)}</span>
              </div>
              {cart.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                  <span className="mk-key-light flex size-11 items-center justify-center rounded-md text-gray-400">
                    <ScanBarcode className="size-5" strokeWidth={2.25} aria-hidden />
                  </span>
                  <p className="text-sm font-semibold text-gray-700">{dictValue('pos.ticketEmpty', 'Nothing rung up yet')}</p>
                  <p className="text-xs text-gray-500">{dictValue('pos.ticketEmptyHint', 'Scan a barcode or tap a product to add it here.')}</p>
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                    <div className="divide-y divide-dashed divide-gray-200">
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
                      dict={dict}
                      onAdd={(productId) => {
                        const product = products.find((p) => p._id === productId);
                        if (product) addToCart(product);
                      }}
                    />
                  </div>

                  <div className="shrink-0 px-2.5">
                    <CartDiscountSection
                      dict={dict}
                      primaryColor={primaryColor}
                      tenant={tenant}
                      cartLength={cart.length}
                      promoCode={promoCode}
                      setPromoCode={setPromoCode}
                      appliedDiscount={appliedDiscount}
                      applyingDiscount={applyingDiscount}
                      scPwdName={scPwdName}
                      setScPwdName={setScPwdName}
                      scPwdId={scPwdId}
                      setScPwdId={setScPwdId}
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
                  </div>
                </>
              )}
            </div>

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
        </div>

        {/* Products column: nav width matches this column only */}
        <div className={`order-2 flex flex-col min-h-0 flex-1 min-w-0 md:order-1 ${roamingMode ? 'w-full' : ''}`}>
          <Navbar />
          <div
            ref={productsScrollRef}
            className="flex-1 overflow-y-auto min-h-0 w-full px-3 sm:px-4 lg:px-5 py-3"
          >
            <div className="mb-3 space-y-2">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="mk-key-brand flex size-9 flex-shrink-0 items-center justify-center rounded-md">
                    <ShoppingBasket className="size-[18px]" strokeWidth={2.25} aria-hidden />
                  </span>
                  <h1 className="text-xl lg:text-2xl font-black tracking-tight text-[#10222f] truncate">{dict.pos.title}</h1>
                </div>

                {/* Function-key row */}
                <div className={roamingMode ? 'grid grid-cols-2 sm:grid-cols-3 lg:flex gap-1.5' : 'flex flex-wrap gap-1.5'}>
                  {fnKeys.map(({ key, label, title, icon: Icon, onClick, danger }) => (
                    <Button
                      key={key}
                      type="button"
                      variant="light"
                      className="h-10 gap-2 px-3 text-xs"
                      onClick={onClick}
                      title={`${title} (${key})`}
                    >
                      <Icon className={danger ? 'size-4 text-red-600' : 'size-4 text-brand'} strokeWidth={2.25} aria-hidden />
                      <span>{label}</span>
                      <kbd className="rounded border border-[#cdd8dc] bg-[#eef3f5] px-1 font-mono text-[10px] font-bold text-gray-500">{key}</kbd>
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant={roamingMode ? 'brand' : 'light'}
                    className="h-10 gap-2 px-3 text-xs"
                    onClick={() => { setRoamingMode((v) => !v); setShowRoamingCart(false); }}
                    aria-pressed={roamingMode}
                    title={roamingMode ? dictValue('pos.exitRoamingMode', 'Exit roaming mode') : dictValue('pos.enableRoamingMode', 'Enable roaming mode (line-busting)')}
                    aria-label={roamingMode ? dictValue('pos.exitRoamingMode', 'Exit roaming mode') : dictValue('pos.enableRoamingMode', 'Enable roaming mode')}
                  >
                    <Smartphone className={roamingMode ? 'size-4' : 'size-4 text-brand'} strokeWidth={2.25} aria-hidden />
                    <span>{roamingMode ? dictValue('pos.roamingMode', 'Roaming') : dictValue('pos.roamMode', 'Roam')}</span>
                  </Button>
                </div>
              </div>

              {/* Search / scan row */}
              <div className="flex gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-gray-400" strokeWidth={2.25} aria-hidden />
                  <Input
                    ref={searchInputRef}
                    type="search"
                    placeholder={dict.pos.searchPlaceholder}
                    aria-label={dict.pos.searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus={!device.isTouch}
                    className={`h-11 bg-white pl-10 pr-12 text-[15px] placeholder:text-gray-400 ${fieldShadow}`}
                  />
                  <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[#cdd8dc] bg-[#eef3f5] px-1 font-mono text-[10px] font-bold text-gray-500">F2</kbd>
                </div>
                <Button
                  type="button"
                  variant="brand"
                  className="size-11 p-0"
                  onClick={() => setShowQRScanner(true)}
                  title={`${dictValue('pos.scanQRCode', 'Scan QR Code')} (F8)`}
                  aria-label={dictValue('pos.scanQRCode', 'Scan QR Code')}
                >
                  <QrCode className="size-5" strokeWidth={2.25} aria-hidden />
                </Button>
                <div className="flex rounded-md" role="group" aria-label={dictValue('pos.viewMode', 'View')}>
                  <Button
                    type="button"
                    variant={displayMode === 'grid' ? 'brand' : 'light'}
                    className="size-11 rounded-r-none p-0"
                    onClick={() => setDisplayMode('grid')}
                    title={dictValue('common.gridView', 'Grid View')}
                    aria-label={dictValue('common.gridView', 'Grid View')}
                    aria-pressed={displayMode === 'grid'}
                  >
                    <LayoutGrid className="size-[18px]" strokeWidth={2.25} aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant={displayMode === 'list' ? 'brand' : 'light'}
                    className="size-11 rounded-l-none border-l-0 p-0"
                    onClick={() => setDisplayMode('list')}
                    title={dictValue('common.listView', 'List View')}
                    aria-label={dictValue('common.listView', 'List View')}
                    aria-pressed={displayMode === 'list'}
                  >
                    <List className="size-[18px]" strokeWidth={2.25} aria-hidden />
                  </Button>
                </div>
              </div>
            </div>

            {debouncedSearch.trim() ? (
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
            ) : (
              <div className="mk-panel rounded-xl flex flex-col items-center justify-center gap-3 px-6 py-14 sm:py-20 text-center select-none">
                <span className="mk-key-brand flex size-14 items-center justify-center rounded-md">
                  <ScanBarcode className="size-7" strokeWidth={2.25} aria-hidden />
                </span>
                <div>
                  <p className="text-lg font-bold text-[#10222f]">{dict.pos?.searchPrompt || 'Search for a product to begin'}</p>
                  <p className="mt-1 text-sm text-gray-500">{dictValue('pos.searchHint', 'Scan a barcode, or type a product name or SKU.')}</p>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-xs text-gray-600">
                  {[
                    ['F2', dictValue('pos.keySearch', 'Search')],
                    ['F8', dictValue('pos.keyScanQr', 'Scan QR')],
                    ['F9', dictValue('pos.keyCharge', 'Charge')],
                  ].map(([k, label]) => (
                    <span key={k} className="mk-key-light inline-flex items-center gap-1.5 rounded-md px-2 py-1">
                      <kbd className="font-mono text-[10px] font-bold text-brand">{k}</kbd>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Roaming Mode — Floating Cart Button */}
      {roamingMode && (
        <span className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <button
            type="button"
            onClick={() => setShowRoamingCart(true)}
            className="mk-key mk-sheen flex items-center gap-3 rounded-lg py-2 pl-2 pr-2 font-bold text-white shadow-[0_14px_30px_-10px_rgba(0,0,0,0.6)]"
            aria-label={`${dict.pos.cart}, ${cartItemCount} ${dict.pos?.items || 'items'}, ${dict.pos?.total || dict.common?.total || 'Total'} ${getTotal()}`}
          >
            <span className="mk-key-brand flex size-10 items-center justify-center rounded-md">
              <ShoppingCart className="size-5" strokeWidth={2.25} aria-hidden />
            </span>
            {cart.length > 0 ? (
              <>
                <span className="text-sm whitespace-nowrap">{cartItemCount} {dict.pos.items || 'items'}</span>
                <span key={getTotal()} className="mk-lcd mk-lcd-on rounded-md px-2.5 py-1.5 text-base tabular-nums whitespace-nowrap">
                  <Currency amount={getTotal()} />
                </span>
              </>
            ) : (
              <span className="pr-2 text-sm text-white/70 whitespace-nowrap">{dict.pos.cartEmpty}</span>
            )}
          </button>
        </span>
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
          isCashier={isCashier}
          customerDisplayUrl={customerDisplayUrl}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={setSelectedCustomer}
          upsellSuggestions={upsellSuggestions}
          promoCode={promoCode}
          setPromoCode={setPromoCode}
          appliedDiscount={appliedDiscount}
          applyingDiscount={applyingDiscount}
          scPwdName={scPwdName}
          setScPwdName={setScPwdName}
          scPwdId={scPwdId}
          setScPwdId={setScPwdId}
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

      {/* Save Cart Sheet */}
      <Sheet
        open={showSaveCartModal}
        onOpenChange={(open) => {
          setShowSaveCartModal(open);
          if (!open) setCartName('');
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md gap-0 bg-[#eef3f5] p-0 [&>[data-slot=sheet-close]]:text-white/70 [&>[data-slot=sheet-close]]:hover:bg-white/10 [&>[data-slot=sheet-close]]:hover:text-white">
          <SheetHeader className="mk-dark border-b border-black/40 p-5 text-white">
            <SheetTitle className="flex items-center gap-2.5 text-xl font-bold text-white">
              <span className="mk-key-brand flex size-9 items-center justify-center rounded-md">
                <CirclePause className="size-[18px]" strokeWidth={2.25} aria-hidden />
              </span>
              {dict.pos?.saveCart || 'Save Cart'}
            </SheetTitle>
            <SheetDescription className="text-white/70">
              {dict.pos?.cartNameHint || 'This cart will be saved for later processing'}
            </SheetDescription>
          </SheetHeader>
          <form
            className="mk-root flex-1 overflow-y-auto p-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveCart();
            }}
          >
            <div className="mk-panel rounded-lg p-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500">{cartItemCount} {dict.pos?.items || 'items'}</span>
              <span className="mk-lcd rounded px-2 py-1 text-sm font-bold tabular-nums"><Currency amount={getTotal()} /></span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="save-cart-name">{dict.pos?.cartName || 'Cart Name'}</Label>
              <Input
                id="save-cart-name"
                type="text"
                value={cartName}
                onChange={(e) => setCartName(e.target.value)}
                className={`h-11 bg-white placeholder:text-gray-400 ${fieldShadow}`}
                placeholder={dict.pos?.cartNamePlaceholder || 'Enter a name for this cart'}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="light"
                size="xl"
                onClick={() => {
                  setShowSaveCartModal(false);
                  setCartName('');
                }}
              >
                {dict.common.cancel}
              </Button>
              <Button type="submit" variant="brand" size="xl" disabled={savingCart || !cartName.trim()}>
                {savingCart && <Loader2 className="animate-spin" aria-hidden />}
                {savingCart ? (dict.common.saving || 'Saving...') : (dict.common.save || 'Save')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

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
              addToCart(pendingAgeVerifyProduct);
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

      {/* Variant Selector Modal */}
      <Dialog
        open={showVariantModal && !!pendingVariantProduct}
        onOpenChange={(open) => {
          if (!open) {
            setShowVariantModal(false);
            setPendingVariantProduct(null);
          }
        }}
      >
        {pendingVariantProduct && (
          <DialogContent className="mk-root sm:max-w-md bg-[#eef3f5] p-0 gap-0 overflow-hidden [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:text-white/70 [&>[data-slot=dialog-close]]:hover:bg-white/10 [&>[data-slot=dialog-close]]:hover:text-white">
            <DialogHeader className="mk-dark px-5 py-4 text-white">
              <DialogTitle className="text-lg font-bold text-white">{pendingVariantProduct.name}</DialogTitle>
              <DialogDescription className="text-white/70">{dictValue('pos.selectAVariant', 'Select a variant')}</DialogDescription>
            </DialogHeader>
            <div className="p-3 grid grid-cols-2 gap-1.5 max-h-80 overflow-y-auto">
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
                    className={`mk-key-light mk-sheen flex flex-col items-start rounded-md p-2.5 text-left ${outOfStock ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span className="font-semibold text-sm text-gray-900">{label}</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-brand mt-0.5">
                      <Currency amount={effectivePrice} />
                    </span>
                    <span className={`font-mono text-[10px] mt-1 font-bold uppercase ${outOfStock ? 'text-red-600' : effectiveStock <= 5 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {outOfStock ? dictValue('pos.outOfStockShort', 'Out of stock') : `${effectiveStock} ${dictValue('pos.inStock', 'in stock')}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        )}
      </Dialog>

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

    </div>
  );
}
