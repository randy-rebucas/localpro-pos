import { ITenantSettings } from '@/models/Tenant';

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$',
    CHF: 'CHF',
    CNY: '¥',
    INR: '₹',
    MXN: 'Mex$',
    BRL: 'R$',
    ZAR: 'R',
    SEK: 'kr',
    NOK: 'kr',
    DKK: 'kr',
    PLN: 'zł',
    RUB: '₽',
    TRY: '₺',
    KRW: '₩',
    SGD: 'S$',
    HKD: 'HK$',
    NZD: 'NZ$',
    THB: '฿',
    PHP: '₱',
    IDR: 'Rp',
    MYR: 'RM',
    VND: '₫',
  };
  
  return symbols[currencyCode.toUpperCase()] || currencyCode;
}

/**
 * Format currency based on tenant settings
 */
export function formatCurrency(
  amount: number,
  settings: ITenantSettings
): string {
  const {
    currency,
    currencySymbol,
    currencyPosition,
    numberFormat,
  } = settings;

  const symbol = currencySymbol || getCurrencySymbol(currency);
  const formatted = formatNumber(amount, numberFormat);
  
  if (currencyPosition === 'after') {
    return `${formatted} ${symbol}`;
  }
  return `${symbol}${formatted}`;
}

/**
 * Format number based on tenant number format settings
 */
export function formatNumber(
  amount: number,
  numberFormat: ITenantSettings['numberFormat']
): string {
  const { decimalSeparator, thousandsSeparator, decimalPlaces } = numberFormat;
  
  // Round to specified decimal places
  const rounded = Number(amount.toFixed(decimalPlaces));
  
  // Split integer and decimal parts
  const parts = rounded.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '';
  
  // Add thousands separator
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  
  // Combine with decimal part
  if (decimalPart) {
    return `${formattedInteger}${decimalSeparator}${decimalPart}`;
  }
  
  return formattedInteger;
}

/**
 * Parse currency string to number
 */
export function parseCurrency(
  value: string,
  settings: ITenantSettings
): number {
  const { decimalSeparator, thousandsSeparator } = settings.numberFormat;
  
  // Remove currency symbol and whitespace
  let cleaned = value.replace(/[^\d.,\s-]/g, '').trim();
  
  // Replace thousands separator with nothing
  if (thousandsSeparator) {
    cleaned = cleaned.replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '');
  }
  
  // Replace decimal separator with dot
  if (decimalSeparator !== '.') {
    cleaned = cleaned.replace(decimalSeparator, '.');
  }
  
  return parseFloat(cleaned) || 0;
}

/**
 * Get default settings for a new tenant
 */
export function getDefaultTenantSettings(): ITenantSettings {
  return {
    currency: 'USD',
    currencyPosition: 'before',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    timezone: 'UTC',
    language: 'en',
    numberFormat: {
      decimalSeparator: '.',
      thousandsSeparator: ',',
      decimalPlaces: 2,
    },
    primaryColor: '#2563eb',
    receiptShowLogo: true,
    receiptShowAddress: true,
    receiptShowPhone: false,
    receiptShowEmail: false,
    taxEnabled: false,
    taxRate: 0,
    taxLabel: 'Tax',
    lowStockThreshold: 10,
    lowStockAlert: true,
    emailNotifications: false,
    smsNotifications: false,
    enableInventory: true,
    enableCategories: true,
    enableDiscounts: false,
    enableLoyaltyProgram: false,
    enableCustomerManagement: false,
  };
}

