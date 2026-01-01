/**
 * Multi-Currency Support
 * Handles exchange rates and currency conversion
 */

import { ITenantSettings } from '@/models/Tenant';
import { formatCurrency, formatNumber } from './currency';

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
    // Try exchangerate-api.com first (free, no API key needed for basic usage)
    if (!apiKey) {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`);
      if (response.ok) {
        const data = await response.json();
        const rates: Record<string, number> = {};
        targetCurrencies.forEach((currency) => {
          if (data.rates && data.rates[currency]) {
            rates[currency] = data.rates[currency];
          }
        });
        return rates;
      }
    }

    // Try Fixer.io if API key is provided
    if (apiKey) {
      const response = await fetch(
        `https://api.fixer.io/latest?access_key=${apiKey}&base=${baseCurrency}&symbols=${targetCurrencies.join(',')}`
      );
      if (response.ok) {
        const data: ExchangeRateResponse = await response.json();
        return data.rates || null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return null;
  }
}

/**
 * Convert amount from one currency to another
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: Record<string, number>
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // If converting from base currency
  if (exchangeRates[toCurrency]) {
    return amount * exchangeRates[toCurrency];
  }

  // If converting to base currency
  if (exchangeRates[fromCurrency]) {
    return amount / exchangeRates[fromCurrency];
  }

  // Cross-currency conversion (via base)
  // This assumes base currency is in the rates
  // For simplicity, we'll use direct rate if available
  return amount;
}

/**
 * Format amount in multiple currencies
 */
export function formatMultiCurrency(
  amount: number,
  baseCurrency: string,
  displayCurrencies: string[],
  exchangeRates: Record<string, number>,
  settings: ITenantSettings
): Array<{ currency: string; formatted: string; amount: number }> {
  const results: Array<{ currency: string; formatted: string; amount: number }> = [];

  displayCurrencies.forEach((currency) => {
    const convertedAmount = convertCurrency(amount, baseCurrency, currency, exchangeRates);
    
    // Create temporary settings for this currency
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
  });

  return results;
}

/**
 * Get exchange rate for a specific currency pair
 */
export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: Record<string, number>
): number | null {
  if (fromCurrency === toCurrency) {
    return 1;
  }

  if (exchangeRates[toCurrency]) {
    return exchangeRates[toCurrency];
  }

  return null;
}
