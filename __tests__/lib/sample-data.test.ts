import { describe, it, expect } from 'vitest';
import { SAMPLE_DATA, sampleSetFor } from '@/lib/sample-data';

describe('sample data', () => {
  it('only offers the Retail and General sets', () => {
    expect(Object.keys(SAMPLE_DATA).sort()).toEqual(['general', 'retail']);
  });

  it('gives retail stores the Retail set and every other type General', () => {
    expect(sampleSetFor('retail')).toBe('retail');
    for (const type of ['general', 'restaurant', 'laundry', 'service', 'pharmacy', undefined, null]) {
      expect(sampleSetFor(type)).toBe('general');
    }
  });

  it('never gives sample customers a phone or email, and marks them as samples', () => {
    for (const set of Object.values(SAMPLE_DATA)) {
      for (const customer of set.customers) {
        expect(customer).not.toHaveProperty('phone');
        expect(customer).not.toHaveProperty('email');
        expect(customer.firstName).toBe('Sample');
        expect(customer.tags).toContain('Sample');
      }
    }
  });

  it('puts every product in one of its set categories', () => {
    for (const set of Object.values(SAMPLE_DATA)) {
      const names = new Set(set.categories.map((c) => c.name));
      for (const product of set.products) expect(names.has(product.category)).toBe(true);
    }
  });
});
