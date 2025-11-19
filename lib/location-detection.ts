/**
 * Location detection utilities for auto-configuring localization settings
 */

export interface DetectedLocation {
  timezone: string;
  locale: string;
  currency: string;
  currencySymbol?: string;
  currencyPosition: 'before' | 'after';
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  numberFormat: {
    decimalSeparator: string;
    thousandsSeparator: string;
    decimalPlaces: number;
  };
  country?: string;
  language: 'en' | 'es';
}

/**
 * Currency mapping by country code
 */
const countryCurrencyMap: Record<string, string> = {
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
  GB: 'GBP', IE: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK',
  AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', KR: 'KRW', IN: 'INR', SG: 'SGD', HK: 'HKD',
  TH: 'THB', PH: 'PHP', ID: 'IDR', MY: 'MYR', VN: 'VND', ZA: 'ZAR', TR: 'TRY', RU: 'RUB',
};

/**
 * Currency position by country (most use before, some use after)
 */
const currencyPositionMap: Record<string, 'before' | 'after'> = {
  FR: 'after', DE: 'after', IT: 'after', ES: 'after', PT: 'after', NL: 'after',
  BE: 'after', AT: 'after', PL: 'after', CZ: 'after', TR: 'after',
};

/**
 * Date format preferences by locale
 */
const dateFormatMap: Record<string, 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'> = {
  'en-US': 'MM/DD/YYYY',
  'en-CA': 'MM/DD/YYYY',
  'en-GB': 'DD/MM/YYYY',
  'en-AU': 'DD/MM/YYYY',
  'en-NZ': 'DD/MM/YYYY',
  'es-ES': 'DD/MM/YYYY',
  'es-MX': 'DD/MM/YYYY',
  'es-AR': 'DD/MM/YYYY',
  'fr-FR': 'DD/MM/YYYY',
  'de-DE': 'DD/MM/YYYY',
  'it-IT': 'DD/MM/YYYY',
  'pt-BR': 'DD/MM/YYYY',
  'pt-PT': 'DD/MM/YYYY',
  'nl-NL': 'DD/MM/YYYY',
  'ja-JP': 'YYYY-MM-DD',
  'ko-KR': 'YYYY-MM-DD',
  'zh-CN': 'YYYY-MM-DD',
  'sv-SE': 'YYYY-MM-DD',
  'no-NO': 'DD.MM.YYYY',
  'da-DK': 'DD/MM/YYYY',
};

/**
 * Time format preferences (24h is common in Europe, Asia; 12h in Americas)
 */
const timeFormatMap: Record<string, '12h' | '24h'> = {
  'en-US': '12h', 'en-CA': '12h', 'en-MX': '12h',
  'en-GB': '24h', 'en-AU': '24h', 'en-NZ': '24h',
  'es-ES': '24h', 'es-MX': '12h', 'es-AR': '24h',
  'fr-FR': '24h', 'de-DE': '24h', 'it-IT': '24h',
  'pt-BR': '24h', 'pt-PT': '24h', 'nl-NL': '24h',
  'ja-JP': '24h', 'ko-KR': '24h', 'zh-CN': '24h',
  'sv-SE': '24h', 'no-NO': '24h', 'da-DK': '24h',
};

/**
 * Detect user's location and localization preferences
 */
export async function detectLocation(): Promise<DetectedLocation> {
  // Get timezone from browser
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Get locale from browser
  const locale = navigator.language || navigator.languages?.[0] || 'en-US';
  const localeParts = locale.split('-');
  const languageCode = localeParts[0].toLowerCase();
  const countryCode = localeParts[1]?.toUpperCase() || '';
  
  // Determine language
  const language: 'en' | 'es' = languageCode === 'es' ? 'es' : 'en';
  
  // Get currency from country code
  const currency = countryCurrencyMap[countryCode] || 'USD';
  
  // Get currency symbol (will be auto-detected by currency utility)
  const currencyPosition = currencyPositionMap[countryCode] || 'before';
  
  // Get date format preference
  const dateFormat = dateFormatMap[locale] || (countryCode === 'US' || countryCode === 'CA' ? 'MM/DD/YYYY' : 'DD/MM/YYYY');
  
  // Get time format preference
  const timeFormat = timeFormatMap[locale] || (countryCode === 'US' || countryCode === 'CA' || countryCode === 'MX' ? '12h' : '24h');
  
  // Detect number format from locale using Intl.NumberFormat
  const numberFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sampleNumber = 1234.56;
  const formatted = numberFormatter.format(sampleNumber);
  
  // Determine decimal and thousands separators
  // Common patterns: "1,234.56" (US), "1.234,56" (EU), "1 234,56" (FR)
  let decimalSeparator = '.';
  let thousandsSeparator = ',';
  
  // Check for comma as decimal separator (European style)
  if (formatted.includes(',') && formatted.includes('.')) {
    // Both present - check which comes last (that's usually decimal)
    const lastComma = formatted.lastIndexOf(',');
    const lastDot = formatted.lastIndexOf('.');
    if (lastComma > lastDot) {
      decimalSeparator = ',';
      thousandsSeparator = '.';
    } else {
      decimalSeparator = '.';
      thousandsSeparator = ',';
    }
  } else if (formatted.includes(',') && !formatted.includes('.')) {
    // Only comma - check if it's decimal or thousands
    const parts = formatted.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely decimal separator (e.g., "1234,56")
      decimalSeparator = ',';
      thousandsSeparator = '.';
    } else {
      // Likely thousands separator
      decimalSeparator = '.';
      thousandsSeparator = ',';
    }
  } else if (formatted.includes(' ')) {
    // Space as thousands separator (e.g., French: "1 234,56" or "1 234.56")
    thousandsSeparator = ' ';
    if (formatted.includes(',')) {
      decimalSeparator = ',';
    } else {
      decimalSeparator = '.';
    }
  }
  
  return {
    timezone,
    locale,
    currency,
    currencyPosition,
    dateFormat,
    timeFormat,
    numberFormat: {
      decimalSeparator,
      thousandsSeparator,
      decimalPlaces: 2,
    },
    country: countryCode,
    language,
  };
}

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbolForCode(currencyCode: string): string {
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF',
    CNY: '¥', INR: '₹', MXN: 'Mex$', BRL: 'R$', ZAR: 'R', SEK: 'kr', NOK: 'kr',
    DKK: 'kr', PLN: 'zł', RUB: '₽', TRY: '₺', KRW: '₩', SGD: 'S$', HKD: 'HK$',
    NZD: 'NZ$', THB: '฿', PHP: '₱', IDR: 'Rp', MYR: 'RM', VND: '₫', ARS: '$',
    CLP: '$', COP: '$', PEN: 'S/', 
  };
  return symbols[currencyCode.toUpperCase()] || currencyCode;
}

