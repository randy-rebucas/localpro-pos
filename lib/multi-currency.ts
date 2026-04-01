/**
 * Multi-Currency Support
 * Handles exchange rates and currency conversion
 */

import { ITenantSettings } from '@/models/Tenant';
import { formatCurrency, formatNumber } from './currency'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { logger } from '@/lib/logger';

export interface ExchangeRateResponse {
  base: string;
  rates: Record<string, number>;
  date?: string;
}

/**
 * Fetch exchange rates from API
 * Supports multiple providers: exchangerate-api.com (free tier), fixer.io, etc.
 */
export async function fetchExchangeRates(
  baseCurrency: string,
  targetCurrencies: string[],
  apiKey?: string
): Promise<Record<string, number> | null> {
  try {
    // Free tier: open.er-api.com returns { result, base_code, rates: {...} } — no API key required.
    // Fallback: exchangerate-api.com v6 standard endpoint returns conversion_rates when an API key is provided.
    if (!apiKey) {
      const response = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
      if (response.ok) {
        const data = await response.json();
        // open.er-api.com uses `rates`; guard against non-success results
        if (data.result && data.result !== 'success') return null;
        const ratesMap: Record<string, number> = data.rates || {};
        const rates: Record<string, number> = {};
        targetCurrencies.forEach((currency) => {
          if (ratesMap[currency]) rates[currency] = ratesMap[currency];
        });
        return Object.keys(rates).length > 0 ? rates : null;
      }
    }

    // exchangerate-api.com v6 with API key — standard (not pair) endpoint returns conversion_rates
    if (apiKey) {
      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.result && data.result !== 'success') return null;
        const ratesMap: Record<string, number> = data.conversion_rates || data.rates || {};
        const rates: Record<string, number> = {};
        targetCurrencies.forEach((currency) => {
          if (ratesMap[currency]) rates[currency] = ratesMap[currency];
        });
        return Object.keys(rates).length > 0 ? rates : null;
      }
    }

    return null;
  } catch (error) {
    logger.error('Error fetching exchange rates:', error);
    return null;
  }
}

/**
 * Safely read a rate from a rates map that may be a Mongoose Map or plain object.
 */
function getRate(
  rates: Record<string, number> | Map<string, number> | undefined,
  currency: string
): number | undefined {
  if (!rates) return undefined;
  if (rates instanceof Map) return rates.get(currency);
  return (rates as Record<string, number>)[currency];
}

/**
 * Convert amount from one currency to another.
 * All exchange rates are expressed as: 1 baseCurrency = N targetCurrency.
 * Returns null when conversion is not possible.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: Record<string, number> | Map<string, number>,
  baseCurrency: string
): number | null {
  if (fromCurrency === toCurrency) return round2(amount);

  // base → target
  if (fromCurrency === baseCurrency) {
    const rate = getRate(exchangeRates, toCurrency);
    if (rate == null || rate <= 0) return null;
    return round2(amount * rate);
  }

  // target → base
  if (toCurrency === baseCurrency) {
    const rate = getRate(exchangeRates, fromCurrency);
    if (rate == null || rate <= 0) return null;
    return round2(amount / rate);
  }

  // cross-currency: target A → base → target B
  const rateFrom = getRate(exchangeRates, fromCurrency);
  const rateTo = getRate(exchangeRates, toCurrency);
  if (rateFrom == null || rateFrom <= 0 || rateTo == null || rateTo <= 0) return null;
  return round2((amount / rateFrom) * rateTo);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Format amount in multiple currencies.
 * Skips currencies whose exchange rate is missing or invalid.
 */
export function formatMultiCurrency(
  amount: number,
  baseCurrency: string,
  displayCurrencies: string[],
  exchangeRates: Record<string, number> | Map<string, number>,
  settings: ITenantSettings
): Array<{ currency: string; formatted: string; amount: number }> {
  const results: Array<{ currency: string; formatted: string; amount: number }> = [];

  for (const currency of displayCurrencies) {
    const convertedAmount = convertCurrency(amount, baseCurrency, currency, exchangeRates, baseCurrency);
    if (convertedAmount === null) continue; // skip currencies with missing rates

    const tempSettings: ITenantSettings = {
      ...settings,
      currency,
      currencySymbol: undefined, // Will be auto-detected
    };

    results.push({
      currency,
      formatted: formatCurrency(convertedAmount, tempSettings),
      amount: convertedAmount,
    });
  }

  return results;
}

/**
 * Get exchange rate for a specific currency pair (base → target).
 */
export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: Record<string, number> | Map<string, number>
): number | null {
  if (fromCurrency === toCurrency) return 1;
  const rate = getRate(exchangeRates, toCurrency);
  return rate != null && rate > 0 ? rate : null;
}
