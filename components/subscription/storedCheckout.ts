/** The plan a tenant chose before leaving for PayPal, kept so the return pages can finish or report it. */
export interface StoredCheckout {
  planId?: string;
  billingCycle?: string;
  amount?: number;
  currency?: string;
  couponCode?: string;
}

export const STORED_CHECKOUT_KEY = 'paypal_subscription_plan';

/** Never throws: storage can be blocked, and a hand-edited value must not crash the page. */
export function readStoredCheckout(): StoredCheckout | null {
  try {
    const raw = window.localStorage.getItem(STORED_CHECKOUT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredCheckout) : null;
  } catch {
    return null;
  }
}

export function clearStoredCheckout() {
  try {
    window.localStorage.removeItem(STORED_CHECKOUT_KEY);
  } catch {
    // Storage blocked; nothing to clear
  }
}

/** The amount for the LED readout, or dashes when it is not known. */
export function checkoutAmountCode(checkout: StoredCheckout | null): string {
  return typeof checkout?.amount === 'number'
    ? checkout.amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '--';
}
