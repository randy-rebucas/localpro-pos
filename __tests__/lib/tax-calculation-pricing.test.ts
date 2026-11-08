import { beforeEach, describe, expect, it, vi } from 'vitest';

const taxRules = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));

vi.mock('@/models/TaxRule', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: {} }));
vi.mock('@/models/Product', () => ({ default: {} }));
vi.mock('@/lib/cache', () => ({
  cacheWrap: () => Promise.resolve(taxRules.list),
  CacheKeys: { taxRules: () => 'tax-rules' },
  TTL: { DEFAULT: 60 },
}));

import { calculateTax } from '@/lib/tax-calculation';
import type { ITenantSettings } from '@/models/Tenant';

const settings = (pricesIncludeTax: boolean) =>
  ({ taxEnabled: true, taxRate: 12, taxLabel: 'VAT', pricesIncludeTax }) as unknown as ITenantSettings;

describe('calculateTax with a pricing mode', () => {
  beforeEach(() => {
    taxRules.list = [];
  });

  it('calculates tax on top when prices exclude it', async () => {
    const result = await calculateTax('tenant-a', 1000, [{ subtotal: 1000 }], settings(false));
    expect(result.taxAmount).toBe(120);
  });

  it('finds the tax inside the price when prices include it', async () => {
    const result = await calculateTax('tenant-a', 1120, [{ subtotal: 1120 }], settings(true));
    expect(result.taxAmount).toBe(120);
  });

  it('applies the same mode to a tax rule', async () => {
    taxRules.list = [{ rate: 12, label: 'VAT', appliesTo: 'all' }];

    const result = await calculateTax('tenant-a', 1120, [{ subtotal: 1120 }], settings(true));

    expect(result.taxAmount).toBe(120);
  });

  it('only finds tax in the taxable part of a mixed sale', async () => {
    const result = await calculateTax(
      'tenant-a',
      1620,
      [{ subtotal: 1120 }, { subtotal: 500, taxExempt: true }],
      settings(true)
    );

    expect(result).toMatchObject({ taxAmount: 120, exemptAmount: 500 });
  });

  it('charges a Senior sale no VAT in either mode', async () => {
    const result = await calculateTax('tenant-a', 80, [{ subtotal: 112 }], settings(true), 'senior');
    expect(result).toMatchObject({ taxAmount: 0, exemptAmount: 80 });
  });
});

describe('calculateTax when rules exist but none matches', () => {
  beforeEach(() => {
    taxRules.list = [{ rate: 5, label: 'Food tax', appliesTo: 'categories', categoryIds: ['cat-food'] }];
  });

  it('uses the rule when it matches', async () => {
    const result = await calculateTax('tenant-a', 1050, [{ subtotal: 1050, categoryId: 'cat-food' }], settings(true));
    expect(result).toMatchObject({ taxAmount: 50, taxRate: 5, taxLabel: 'Food tax' });
  });

  it('falls back to the Settings rate instead of charging nothing', async () => {
    const result = await calculateTax('tenant-a', 1120, [{ subtotal: 1120, categoryId: 'cat-other' }], settings(true));
    expect(result).toMatchObject({ taxAmount: 120, taxRate: 12, taxLabel: 'VAT' });
  });

  it('still charges nothing when Settings tax is off', async () => {
    const off = { ...settings(true), taxEnabled: false } as unknown as ITenantSettings;
    const result = await calculateTax('tenant-a', 1120, [{ subtotal: 1120, categoryId: 'cat-other' }], off);
    expect(result).toMatchObject({ taxAmount: 0, taxRate: 0 });
  });

  it('charges nothing when every item is exempt, even without item subtotals', async () => {
    const result = await calculateTax('tenant-a', 500, [{ taxExempt: true }], settings(true));
    expect(result.taxAmount).toBe(0);
  });
});
