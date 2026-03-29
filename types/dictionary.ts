/**
 * Dictionary interface for multi-language support
 */
export interface TranslationDict {
  common: {
    loading?: string;
    error?: string;
    success?: string;
    cancel?: string;
    save?: string;
    delete?: string;
    edit?: string;
    close?: string;
    failedToTogglePin?: string;
    [key: string]: string | undefined;
  };
  pos: {
    // Cart
    cartEmpty?: string;
    cartEmptyAlert?: string;
    cartCleared?: string;
    cartNameRequired?: string;
    saveCartError?: string;
    loadCartError?: string;
    deleteCartError?: string;
    cartLoaded?: string;
    deleteCartConfirmTitle?: string;
    deleteCartConfirm?: string;
    loadCartConfirmTitle?: string;
    loadCartConfirm?: string;
    clearCartConfirmTitle?: string;
    clearCartConfirm?: string;

    // Stock
    outOfStock?: string;
    insufficientStock?: string;
    maxQuantityReached?: string;

    // Discounts
    discountApplied?: string;
    invalidDiscountCode?: string;

    // Payment
    checkoutLabel?: string;
    paymentMethod?: string;
    paymentMethodRequired?: string;
    cash?: string;
    card?: string;
    digital?: string;
    cashReceivedLabel?: string;
    changeLabel?: string;
    insufficientCash?: string;
    invalidCashAmount?: string;
    processPaymentLabel?: string;

    // Transaction
    transactionCompleted?: string;
    transactionError?: string;
    transactionSavedOffline?: string;
    willSyncWhenOnline?: string;
    noTransactionFound?: string;

    // Refunds
    refundLabel?: string;
    selectAtLeastOneItem?: string;
    refundError?: string;

    // Printing
    printFailed?: string;

    // Other
    [key: string]: string | undefined;
  };
}

/**
 * Create a typed dictionary getter that returns undefined for missing keys
 * instead of crashing
 */
export function getDictionaryValue(
  dict: TranslationDict | null | undefined,
  path: string,
  fallback: string
): string {
  if (!dict) return fallback;

  const parts = path.split('.');
  let value: any = dict;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return fallback;
    }
  }

  return typeof value === 'string' ? value : fallback;
}
