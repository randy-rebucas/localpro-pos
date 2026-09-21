import { describe, it, expect } from 'vitest';
import { suggestCurrencyForCountry } from '@/lib/country-currency';

describe('suggestCurrencyForCountry', () => {
  it('matches an exact country name', () => {
    expect(suggestCurrencyForCountry('Philippines')).toEqual({ currency: 'PHP', countryName: 'Philippines' });
  });

  it('is case-insensitive', () => {
    expect(suggestCurrencyForCountry('philippines')).toEqual({ currency: 'PHP', countryName: 'Philippines' });
  });

  it('matches a bare ISO code', () => {
    expect(suggestCurrencyForCountry('PH')).toEqual({ currency: 'PHP', countryName: 'Philippines' });
  });

  it('resolves common aliases that do not match the table name literally', () => {
    expect(suggestCurrencyForCountry('USA')).toEqual({ currency: 'USD', countryName: 'United States of America' });
    expect(suggestCurrencyForCountry('UK')).toEqual({ currency: 'GBP', countryName: 'United Kingdom' });
  });

  it('matches via substring in either direction', () => {
    expect(suggestCurrencyForCountry('Republic of the Philippines')).toEqual({ currency: 'PHP', countryName: 'Philippines' });
  });

  it('returns null for empty, missing, or unresolvable input', () => {
    expect(suggestCurrencyForCountry('')).toBeNull();
    expect(suggestCurrencyForCountry(undefined)).toBeNull();
    expect(suggestCurrencyForCountry(null)).toBeNull();
    expect(suggestCurrencyForCountry('Narnia')).toBeNull();
  });

  it('gives every Eurozone country entry the same EUR currency', () => {
    for (const country of ['Germany', 'France', 'Spain', 'Italy', 'Ireland', 'Netherlands']) {
      expect(suggestCurrencyForCountry(country)?.currency).toBe('EUR');
    }
  });
});
