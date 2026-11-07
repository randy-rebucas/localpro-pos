import { describe, expect, it } from 'vitest';
import { formatCurrency, formatNumber, getDefaultTenantSettings } from '@/lib/currency';

const numberFormat = { decimalSeparator: '.', thousandsSeparator: ',', decimalPlaces: 2 };

describe('formatNumber', () => {
  it('keeps trailing zeros', () => {
    expect(formatNumber(325.5, numberFormat)).toBe('325.50');
    expect(formatNumber(12, numberFormat)).toBe('12.00');
  });

  it('adds thousands separators and rounds to the set places', () => {
    expect(formatNumber(1249.755, numberFormat)).toBe('1,249.76');
    expect(formatNumber(1000000, numberFormat)).toBe('1,000,000.00');
  });

  it('shows no decimals when the charts ask for none', () => {
    expect(formatNumber(1250.4, { ...numberFormat, decimalPlaces: 0 })).toBe('1,250');
  });

  it('honours other separators', () => {
    expect(formatNumber(1234.5, { decimalSeparator: ',', thousandsSeparator: '.', decimalPlaces: 2 })).toBe('1.234,50');
  });

  it('keeps negatives but never shows a negative zero', () => {
    expect(formatNumber(-72.3, numberFormat)).toBe('-72.30');
    expect(formatNumber(-0.001, numberFormat)).toBe('0.00');
  });
});

describe('formatCurrency', () => {
  it('prints a full peso amount', () => {
    expect(formatCurrency(325.5, getDefaultTenantSettings())).toBe('₱325.50');
  });
});
