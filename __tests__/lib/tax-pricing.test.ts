import { describe, expect, it } from 'vitest';
import { cartTax, cartTotal, discountFor, embeddedVat, isVatExemptDiscount, taxOn, totalWithTax } from '@/lib/tax-pricing';

const exclusive = { taxEnabled: true, taxRate: 12, pricesIncludeTax: false };
const inclusive = { taxEnabled: true, taxRate: 12, pricesIncludeTax: true };
const senior = { category: 'senior', code: 'SC20' };
const twentyPercent = { type: 'percentage', value: 20 };

describe('tax on a price', () => {
  it('adds tax on top when prices exclude it', () => {
    expect(cartTax(1000, exclusive)).toBe(120);
    expect(cartTotal(1000, exclusive)).toBe(1120);
  });

  it('finds the tax inside the price when prices include it, without changing the total', () => {
    expect(cartTax(1120, inclusive)).toBe(120);
    expect(cartTotal(1120, inclusive)).toBe(1120);
  });

  it('defaults to adding tax on top, so existing stores keep their prices', () => {
    expect(cartTotal(1000, { taxEnabled: true, taxRate: 12 })).toBe(1120);
  });

  it('charges no tax when tax is off, or without settings', () => {
    expect(cartTotal(1000, { taxEnabled: false, taxRate: 12 })).toBe(1000);
    expect(cartTotal(1000, null)).toBe(1000);
  });

  it('agrees with the server formula', () => {
    expect(totalWithTax(1000, taxOn(1000, 12, false), false)).toBe(1120);
    expect(totalWithTax(1120, taxOn(1120, 12, true), true)).toBe(1120);
  });
});

describe('Senior and PWD sales', () => {
  it('recognises them by category or by the legal codes', () => {
    expect(isVatExemptDiscount({ category: 'senior' })).toBe(true);
    expect(isVatExemptDiscount({ category: 'pwd' })).toBe(true);
    expect(isVatExemptDiscount({ code: 'sc20' })).toBe(true);
    expect(isVatExemptDiscount({ category: 'promo', code: 'SALE10' })).toBe(false);
    expect(isVatExemptDiscount(null)).toBe(false);
  });

  it('shows no VAT in the cart, matching what the server charges', () => {
    expect(cartTax(80, exclusive, senior)).toBe(0);
    expect(cartTotal(80, exclusive, senior)).toBe(80);
  });

  it('takes 20% off the price when prices exclude VAT', () => {
    expect(discountFor(twentyPercent, 100, exclusive, senior)).toEqual({ amount: 20, vatRemoved: 0 });
  });

  it('removes VAT first, then takes 20% off the VAT-exclusive price, when prices include VAT', () => {
    const { amount, vatRemoved } = discountFor(twentyPercent, 112, inclusive, senior);

    expect(vatRemoved).toBe(12);
    expect(amount).toBe(32);
    expect(cartTotal(112 - amount, inclusive, senior)).toBe(80);
  });

  it('ends at the same amount in both pricing modes', () => {
    const fromExclusive = 100 - discountFor(twentyPercent, 100, exclusive, senior).amount;
    const fromInclusive = 112 - discountFor(twentyPercent, 112, inclusive, senior).amount;

    expect(fromInclusive).toBe(fromExclusive);
  });

  it('leaves ordinary discounts on the full price', () => {
    expect(discountFor(twentyPercent, 112, inclusive, { category: 'promo' })).toEqual({ amount: 22.4, vatRemoved: 0 });
    expect(embeddedVat(112, inclusive, { category: 'promo' })).toBe(0);
  });

  it('removes nothing for a store with no VAT', () => {
    expect(embeddedVat(112, { pricesIncludeTax: true, taxEnabled: false, taxRate: 12 }, senior)).toBe(0);
  });
});

describe('discountFor', () => {
  it('honours the maximum on a percentage discount', () => {
    expect(discountFor({ type: 'percentage', value: 50, maxDiscountAmount: 30 }, 100).amount).toBe(30);
  });

  it('never takes more than the subtotal with a fixed discount', () => {
    expect(discountFor({ type: 'fixed', value: 500 }, 100).amount).toBe(100);
  });
});
