import { describe, it, expect } from 'vitest';
import {
  BUSINESS_TYPE_CONFIGS,
  SIGNUP_CLOSED_BUSINESS_TYPES,
  isBusinessTypeOpenForSignup,
  isBusinessTypeSelectable,
} from '@/lib/business-types';

describe('isBusinessTypeOpenForSignup', () => {
  it.each(['retail', 'general'])('allows %s', (type) => {
    expect(isBusinessTypeOpenForSignup(type)).toBe(true);
  });

  it.each(['restaurant', 'laundry', 'service', 'pharmacy'])('rejects %s', (type) => {
    expect(isBusinessTypeOpenForSignup(type)).toBe(false);
  });

  it('rejects closed types regardless of case', () => {
    expect(isBusinessTypeOpenForSignup('Restaurant')).toBe(false);
    expect(isBusinessTypeOpenForSignup('LAUNDRY')).toBe(false);
  });

  it('allows a missing type, which falls back to general', () => {
    expect(isBusinessTypeOpenForSignup(undefined)).toBe(true);
    expect(isBusinessTypeOpenForSignup(null)).toBe(true);
  });

  it('keeps configs for closed types so existing tenants still resolve', () => {
    for (const type of SIGNUP_CLOSED_BUSINESS_TYPES) {
      expect(BUSINESS_TYPE_CONFIGS[type]).toBeDefined();
    }
  });
});

describe('isBusinessTypeSelectable', () => {
  it('offers only open types to a tenant on an open type', () => {
    const offered = Object.keys(BUSINESS_TYPE_CONFIGS).filter((type) => isBusinessTypeSelectable(type, 'retail'));

    expect(offered.sort()).toEqual(['general', 'retail']);
  });

  it('keeps the saved closed type so the tenant is not silently switched', () => {
    const offered = Object.keys(BUSINESS_TYPE_CONFIGS).filter((type) => isBusinessTypeSelectable(type, 'Laundry'));

    expect(offered.sort()).toEqual(['general', 'laundry', 'retail']);
  });

  it('offers only open types when nothing is saved', () => {
    expect(isBusinessTypeSelectable('restaurant', undefined)).toBe(false);
    expect(isBusinessTypeSelectable('retail', undefined)).toBe(true);
  });
});
