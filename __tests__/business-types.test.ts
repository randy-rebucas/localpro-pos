/**
 * Only retail and general are supported. Retired types (pharmacy, laundry,
 * service, restaurant) must be rejected on write and fall back to general on read.
 */
import { describe, it, expect } from 'vitest';
import { isValidBusinessType, getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';

describe('isValidBusinessType', () => {
  it('accepts supported types case-insensitively', () => {
    expect(isValidBusinessType('retail')).toBe(true);
    expect(isValidBusinessType('general')).toBe(true);
    expect(isValidBusinessType('Retail')).toBe(true);
  });

  it('rejects retired types', () => {
    for (const type of ['pharmacy', 'laundry', 'service', 'restaurant']) {
      expect(isValidBusinessType(type)).toBe(false);
    }
  });

  it('rejects non-strings and prototype keys', () => {
    expect(isValidBusinessType(undefined)).toBe(false);
    expect(isValidBusinessType(null)).toBe(false);
    expect(isValidBusinessType(42)).toBe(false);
    expect(isValidBusinessType('')).toBe(false);
    expect(isValidBusinessType('constructor')).toBe(false);
    expect(isValidBusinessType('toString')).toBe(false);
  });
});

describe('retired business types on read', () => {
  it('fall back to general', () => {
    expect(getBusinessType({ businessType: 'laundry' } as never)).toBe('general');
    expect(getBusinessTypeConfig('restaurant').type).toBe('general');
  });

  it('general still allows service products, retail does not', () => {
    expect(getBusinessTypeConfig('general').productTypes).toContain('service');
    expect(getBusinessTypeConfig('retail').productTypes).not.toContain('service');
  });
});
