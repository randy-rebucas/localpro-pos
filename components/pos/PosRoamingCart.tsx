'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import CartActionBar from '@/components/pos/CartActionBar';
import CartLineItem from '@/components/pos/CartLineItem';
import CartDiscountSection from '@/components/pos/CartDiscountSection';
import CartSummaryFooter from '@/components/pos/CartSummaryFooter';
import CartUpsellSuggestions from '@/components/pos/CartUpsellSuggestions';
import type { CartItem } from '@/hooks/useCart';
import type { PosProduct } from '@/hooks/usePosProducts';
import type { Discount } from '@/hooks/useDiscount';
import type { TranslationDict } from '@/types/dictionary';
import type { UpsellProduct } from '@/hooks/useUpsell';
import type { CustomerSummary } from '@/types/customer';

const CustomerSidePanel = dynamic(() => import('@/components/CustomerSidePanel'), {
  ssr: false,
  loading: () => (
    <div className="py-2">
      <LoadingSpinner size="sm" />
    </div>
  ),
});

export interface PosRoamingCartProps {
  primaryColor: string;
  dict: TranslationDict;
  dictValue: (key: string, fallback: string) => string;
  tenant: string;
  cart: CartItem[];
  products: PosProduct[];
  businessType: string;
  orderType: 'dine-in' | 'takeout' | 'delivery';
  tableNumber: string;
  isCashier: boolean;
  customerDisplayUrl: string | null;
  selectedCustomer: CustomerSummary | null;
  onSelectCustomer: (c: CustomerSummary | null) => void;
  upsellSuggestions: UpsellProduct[];
  promoCode: string;
  setPromoCode: (v: string) => void;
  appliedDiscount: Discount | null;
  applyingDiscount: boolean;
  showDiscountSection: boolean;
  setShowDiscountSection: React.Dispatch<React.SetStateAction<boolean>>;
  sessionId: string | null;
  settings?: { taxEnabled?: boolean; taxRate?: number; taxLabel?: string } | null;
  processing: boolean;
  fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>;
  applyDiscount: (
    subtotal: number,
    tenant: string,
    onSuccess: (discount: Discount) => void,
    onError: (error: string) => void
  ) => void;
  setAppliedDiscount: (discount: Discount | null) => void;
  removeDiscount: () => void;
  getSubtotal: () => number;
  getTotal: () => number;
  getTaxAmount: (settings?: { taxEnabled?: boolean; taxRate?: number }, taxableBase?: number) => number;
  onClose: () => void;
  onSaveCart: () => void;
  onClearCart: () => void;
  onLoadSavedCarts: () => void;
  onCheckout: () => void;
  onRemoveFromCart: (id: string) => void;
  onUpdateQuantity: (id: string, qty: number, onError: (msg: string) => void) => void;
  onQuantityError: (msg: string) => void;
  onAddProduct: (product: PosProduct) => void;
  onDiscountApplied: (msg: string) => void;
  onDiscountError: (msg: string) => void;
}

export default function PosRoamingCart(props: PosRoamingCartProps) {
  const {
    primaryColor,
    dict,
    dictValue,
    tenant,
    cart,
    products,
    businessType,
    orderType,
    tableNumber,
    isCashier,
    customerDisplayUrl,
    selectedCustomer,
    onSelectCustomer,
    upsellSuggestions,
    promoCode,
    setPromoCode,
    appliedDiscount,
    applyingDiscount,
    showDiscountSection,
    setShowDiscountSection,
    sessionId,
    settings,
    processing,
    fetchWithTimeout,
    applyDiscount,
    setAppliedDiscount,
    removeDiscount,
    getSubtotal,
    getTotal,
    getTaxAmount,
    onClose,
    onSaveCart,
    onClearCart,
    onLoadSavedCarts,
    onCheckout,
    onRemoveFromCart,
    onUpdateQuantity,
    onQuantityError,
    onAddProduct,
    onDiscountApplied,
    onDiscountError,
  } = props;

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-white border-t-2 border-gray-200 flex min-h-0 flex-col animate-slide-in-bottom max-h-[85vh] overflow-hidden"
        style={{ borderTopColor: primaryColor }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 rounded-full bg-gray-300 mx-auto mt-2 mb-1 flex-shrink-0" aria-hidden />
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
          onSaveCart={onSaveCart}
          onClearCart={onClearCart}
          onLoadSavedCarts={onLoadSavedCarts}
          onClose={onClose}
          closeLabel={dictValue('pos.closeCart', 'Close cart')}
        />

        {businessType === 'retail' && (
          <div className="shrink-0 px-5 pb-2 min-w-0">
            <CustomerSidePanel
              tenant={tenant}
              selectedCustomer={selectedCustomer}
              onSelectCustomer={onSelectCustomer}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]">
          {cart.length === 0 ? (
            <EmptyState icon="cart" title={dict.pos?.cartEmpty || 'Cart is empty'} compact />
          ) : (
            <div className="space-y-3">
              {cart.map((item) => {
                const product = products.find((p) => p._id === item.productId);
                return (
                  <CartLineItem
                    key={item.cartItemId}
                    item={item}
                    variant="roaming"
                    dict={dict}
                    product={product}
                    onRemove={onRemoveFromCart}
                    onUpdateQuantity={onUpdateQuantity}
                    onQuantityError={onQuantityError}
                  />
                );
              })}
              <CartUpsellSuggestions
                suggestions={upsellSuggestions}
                primaryColor={primaryColor}
                dict={dict}
                onAdd={(productId) => {
                  const product = products.find((p) => p._id === productId);
                  if (product) onAddProduct(product);
                }}
              />
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <>
            <div className="shrink-0 px-5">
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
                onDiscountApplied={onDiscountApplied}
                onDiscountError={onDiscountError}
              />
            </div>
            <CartSummaryFooter
              dict={dict}
              primaryColor={primaryColor}
              variant="roaming"
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
              onCheckout={onCheckout}
            />
          </>
        )}
      </div>
    </div>
  );
}
