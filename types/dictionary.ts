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
  admin?: {
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
  products?: {
    title?: string;
    addProduct?: string;
    searchPlaceholder?: string;
    sku?: string;
    category?: string;
    price?: string;
    stock?: string;
    inStock?: string;
    deleteConfirm?: string;
    deleteConfirmTitle?: string;
    deleteError?: string;
    productDeleted?: string;
    viewBarcode?: string;
    failedToLoadProducts?: string;
    noProductsYet?: string;
    clearSearch?: string;
    refill?: { title?: string; [key: string]: string | undefined };
    [key: string]: string | { [key: string]: string | undefined } | undefined;
  };
  transactions?: {
    title?: string;
    date?: string;
    items?: string;
    item?: string;
    payment?: string;
    view?: string;
    hide?: string;
    transactionDetails?: string;
    noTransactions?: string;
    noExpenses?: string;
    noActivityYet?: string;
    failedToLoadTransactions?: string;
    completed?: string;
    cancelled?: string;
    refunded?: string;
    page?: string;
    of?: string;
    cash?: string;
    change?: string;
    previous?: string;
    next?: string;
    all?: string;
    transactions?: string;
    expenses?: string;
    expense?: string;
    name?: string;
    adjust?: string;
    addExpense?: string;
    addManual?: string;
    [key: string]: string | undefined;
  };
  reports?: {
    title?: string;
    subtitle?: string;
    startDate?: string;
    endDate?: string;
    period?: string;
    daily?: string;
    weekly?: string;
    monthly?: string;
    noData?: string;
    noCashDrawerReports?: string;
    failedToLoadReports?: string;
    tabs?: Record<string, string | undefined>;
    [key: string]: string | Record<string, string | undefined> | undefined;
  };
  inventory?: {
    title?: string;
    branch?: string;
    allBranches?: string;
    features?: string;
    quickActions?: string;
    manageStock?: string;
    viewHistory?: string;
    manageBundles?: string;
    predictedStockouts?: string;
    noStockoutsPredicted?: string;
    failedToLoadBranches?: string;
    failedToLoadPredictions?: string;
    inventoryNotAvailable?: string;
    inventoryNotAvailableDesc?: string;
    refreshPredictions?: string;
    realtimeTracking?: string;
    lowStockAlerts?: string;
    bundledProducts?: string;
    multiBranch?: string;
    [key: string]: string | undefined;
  };
  nav?: {
    products?: string;
    stockMovements?: string;
    bundles?: string;
    inventory?: string;
    [key: string]: string | undefined;
  };
  components?: {
    lowStockAlerts?: {
      title?: string;
      allProductsWellStocked?: string;
      retry?: string;
      [key: string]: string | undefined;
    };
    [key: string]: Record<string, string | undefined> | undefined;
  };
  profile?: {
    title?: string;
    subtitle?: string;
    information?: string;
    name?: string;
    email?: string;
    role?: string;
    memberSince?: string;
    saved?: string;
    passwordSaved?: string;
    passwordsNotMatch?: string;
    passwordTooShort?: string;
    changePassword?: string;
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
    updatePassword?: string;
    saving?: string;
    save?: string;
    qrCode?: string;
    qrCodeDescription?: string;
    qrNotAvailable?: string;
    generateQR?: string;
    qrRegenerated?: string;
    regenerateQR?: string;
    loadingProfile?: string;
    failedToLoadProfile?: string;
    namePlaceholder?: string;
    emailPlaceholder?: string;
    currentPasswordPlaceholder?: string;
    newPasswordPlaceholder?: string;
    confirmPasswordPlaceholder?: string;
    [key: string]: string | undefined;
  };
  settings?: {
    title?: string;
    subtitle?: string;
    loading?: string;
    failedToLoad?: string;
    loadErrorDescription?: string;
    retry?: string;
    saved?: string;
    saving?: string;
    save?: string;
    error?: string;
    unauthorized?: string;
    failedToDetect?: string;
    detecting?: string;
    detectLocation?: string;
    detected?: string;
    businessTypeChangeWarning?: string;
    loadingBusinessTypes?: string;
    tabs?: Record<string, string | undefined>;
    ecommerce?: Record<string, string | undefined>;
    [key: string]: string | Record<string, string | undefined> | undefined;
  };
  subscription?: {
    upgradeTitle?: string;
    upgradeMessage?: string;
    chooseBilling?: string;
    currentPlan?: string;
    selectPlan?: string;
    contactUs?: string;
    failedToLoadPlans?: string;
    noPlansAvailable?: string;
    unlimited?: string;
    users?: string;
    branches?: string;
    products?: string;
    perMonth?: string;
    oneTimeSetup?: string;
    monthly?: string;
    yearlyDiscount?: string;
    enterprise?: string;
    customPricing?: string;
    processingPayment?: string;
    activatingSubscription?: string;
    paymentSuccess?: string;
    subscriptionActivated?: string;
    activationFailed?: string;
    activationFailedMessage?: string;
    paymentFailed?: string;
    paymentFailedMessage?: string;
    paymentCancelled?: string;
    paymentCancelledMessage?: string;
    backToSubscription?: string;
    tryAgain?: string;
    failedToCreatePayment?: string;
    failedToInitiatePayment?: string;
    missingOrderId?: string;
    missingPlanId?: string;
    [key: string]: string | undefined;
  };
  documentation?: {
    tableOfContents?: string;
    overview?: string;
    searchPages?: string;
    userManualDesc?: string;
    tenantManualDesc?: string;
    birDocumentation?: string;
    birDocs?: string;
    birDesc?: string;
    noSearchResults?: string;
    chapter?: string;
    chapters?: string;
    chapterLabel?: string;
    previous?: string;
    next?: string;
    failedToLoadDocs?: string;
    failedToLoadPage?: string;
    [key: string]: string | undefined;
  };
  customerDisplay?: {
    noSessionFound?: string;
    noSessionMessage?: string;
    connectionError?: string;
    loadingSession?: string;
    waitingForItems?: string;
    scanItemsToStart?: string;
    thankYou?: string;
    paymentComplete?: string;
    yourOrder?: string;
    session?: string;
    items?: string;
    qty?: string;
    tax?: string;
    readyToPay?: string;
    digitalNFC?: string;
    staffWillComplete?: string;
    processingPayment?: string;
    invalidSessionData?: string;
    sessionNotFound?: string;
    errorLoadingSession?: string;
    failedToConnect?: string;
    retry?: string;
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
  let value: unknown = dict;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return fallback;
    }
  }

  return typeof value === 'string' ? value : fallback;
}
