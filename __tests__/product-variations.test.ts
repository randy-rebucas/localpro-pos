import { describe, it, expect } from 'vitest';
import {
  findVariationBySku,
  findVariationProblem,
  matchesVariation,
  normalizeVariationRows,
  productStockTotal,
  variationLabel,
  variationsOverlap,
} from '@/lib/product-variations';

describe('matchesVariation', () => {
  it('treats an attribute left unset on the option as matching anything', () => {
    expect(matchesVariation({ size: 'L', color: 'Red' }, { size: 'L' })).toBe(true);
    expect(matchesVariation({ size: 'L', color: 'Red' }, { size: 'S' })).toBe(false);
  });
});

describe('variationsOverlap', () => {
  it('catches a variation that could be mistaken for another', () => {
    expect(variationsOverlap({ size: 'L' }, { size: 'L', color: 'Red' })).toBe(true);
    expect(variationsOverlap({ size: 'L', color: 'red' }, { size: 'l', color: 'RED' })).toBe(true);
  });

  it('leaves genuinely different variations alone', () => {
    expect(variationsOverlap({ size: 'L', color: 'Red' }, { size: 'L', color: 'Blue' })).toBe(false);
    expect(variationsOverlap({ size: 'L' }, { size: 'S' })).toBe(false);
  });
});

describe('productStockTotal', () => {
  it('adds up variations, ignoring the main figure', () => {
    expect(productStockTotal({ stock: 99, hasVariations: true, variations: [{ stock: 2 }, { stock: 3 }, {}] })).toBe(5);
  });

  it('uses the main figure without variations', () => {
    expect(productStockTotal({ stock: 7 })).toBe(7);
    expect(productStockTotal({ stock: 7, hasVariations: true, variations: [] })).toBe(7);
  });
});

describe('findVariationBySku', () => {
  const variations = [{ sku: 'TEE-S' }, { sku: 'TEE-L' }, {}];

  it('finds the variation whatever the case', () => {
    expect(findVariationBySku({ hasVariations: true, variations }, 'tee-l')).toBe(variations[1]);
  });

  it('finds nothing for an unknown code or a product not using variations', () => {
    expect(findVariationBySku({ hasVariations: true, variations }, 'TEE-M')).toBeUndefined();
    expect(findVariationBySku({ hasVariations: false, variations }, 'TEE-S')).toBeUndefined();
  });
});

describe('variationLabel', () => {
  it('joins what is set, falling back to the SKU', () => {
    expect(variationLabel({ size: 'L', type: 'Cotton' })).toBe('L / Cotton');
    expect(variationLabel({ sku: 'X-1' })).toBe('X-1');
  });
});

describe('normalizeVariationRows', () => {
  it('trims text, drops blanks and reads numbers from form strings', () => {
    expect(normalizeVariationRows([{ size: ' L ', color: '', price: '12.5', stock: '3' }])).toEqual([{ size: 'L', price: 12.5, stock: 3 }]);
  });

  it('keeps an empty price and stock unset rather than zero', () => {
    expect(normalizeVariationRows([{ size: 'L', price: '', stock: '' }])).toEqual([{ size: 'L' }]);
  });

  it('refuses anything that is not a list', () => {
    expect(normalizeVariationRows('L')).toBeNull();
    expect(normalizeVariationRows(undefined)).toBeNull();
  });
});

describe('findVariationProblem', () => {
  const code = (...args: Parameters<typeof findVariationProblem>) => findVariationProblem(...args)?.code;

  it('accepts a clean set', () => {
    expect(findVariationProblem([{ size: 'S', stock: 1 }, { size: 'L', price: 20 }])).toBeNull();
    expect(findVariationProblem([])).toBeNull();
  });

  it('needs at least one attribute', () => {
    expect(code([{ sku: 'X' }])).toBe('attribute_required');
  });

  it('rejects bad numbers', () => {
    expect(code([{ size: 'L', price: -1 }])).toBe('invalid_price');
    expect(code([{ size: 'L', price: NaN }])).toBe('invalid_price');
    expect(code([{ size: 'L', stock: 1.5 }])).toBe('invalid_stock');
    expect(code([{ size: 'L', stock: -1 }])).toBe('invalid_stock');
  });

  it('rejects overlaps and repeated SKUs', () => {
    expect(code([{ size: 'L' }, { size: 'L', color: 'Red' }])).toBe('overlap');
    expect(code([{ size: 'L', sku: 'A' }, { size: 'S', sku: 'a' }])).toBe('duplicate_sku');
  });

  it('rejects an id the product no longer has', () => {
    expect(code([{ _id: 'gone', size: 'L' }], [{ _id: 'other', stock: 0 }])).toBe('unknown_variation');
  });

  it('ignores the stock sent for an existing variation, which is never written', () => {
    expect(findVariationProblem([{ _id: 'v1', size: 'L', stock: -5 }], [{ _id: 'v1', stock: 2 }])).toBeNull();
  });

  it('refuses to drop a variation that still has stock, but allows an empty one', () => {
    const existing = [{ _id: 'v1', size: 'L', stock: 3 }, { _id: 'v2', size: 'S', stock: 0 }];

    expect(findVariationProblem([{ _id: 'v2', size: 'S' }], existing)).toEqual({ code: 'remove_with_stock', label: 'L' });
    expect(findVariationProblem([{ _id: 'v1', size: 'L' }], existing)).toBeNull();
  });
});
