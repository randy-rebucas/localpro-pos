/**
 * How a price relates to tax, shared by the register and the server so the
 * amount shown in the cart is the amount charged. No server-only imports.
 *
 * `pricesIncludeTax` off: tax is added on top, so ₱100 at 12% charges ₱112.
 * `pricesIncludeTax` on:  tax is already inside the price, so ₱112 charges ₱112.
 */

export interface TaxPricingSettings {
  taxEnabled?: boolean;
  taxRate?: number;
  pricesIncludeTax?: boolean;
}

export interface DiscountRule {
  type: 'percentage' | 'fixed' | string;
  value: number;
  maxDiscountAmount?: number;
}

const VAT_EXEMPT_CATEGORIES = ['senior', 'pwd'];
const VAT_EXEMPT_CODES = ['SC20', 'PWD20'];

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Senior Citizen and PWD sales carry no VAT (RA 9994 / RA 10754). */
export function isVatExemptDiscount(discount?: { category?: string; code?: string } | null): boolean {
  if (!discount) return false;
  return VAT_EXEMPT_CATEGORIES.includes(discount.category ?? '') || VAT_EXEMPT_CODES.includes((discount.code ?? '').toUpperCase());
}

/** The tax on `base` at `rate` percent, whether it sits inside `base` or on top of it. */
export function taxOn(base: number, rate: number, pricesIncludeTax?: boolean): number {
  return pricesIncludeTax ? (base * rate) / (100 + rate) : (base * rate) / 100;
}

/** What the customer pays for `base` once `tax` is accounted for. */
export function totalWithTax(base: number, tax: number, pricesIncludeTax?: boolean): number {
  return roundMoney(pricesIncludeTax ? base : base + tax);
}

/** The tax shown in the cart for an amount after discount. */
export function cartTax(
  base: number,
  settings?: TaxPricingSettings | null,
  discount?: { category?: string; code?: string } | null
): number {
  if (!settings?.taxEnabled || !settings.taxRate || isVatExemptDiscount(discount)) return 0;
  return roundMoney(taxOn(base, settings.taxRate, settings.pricesIncludeTax));
}

/** The total shown in the cart for an amount after discount. */
export function cartTotal(
  base: number,
  settings?: TaxPricingSettings | null,
  discount?: { category?: string; code?: string } | null
): number {
  return totalWithTax(base, cartTax(base, settings, discount), settings?.pricesIncludeTax);
}

/**
 * The VAT to take out of a price before a Senior/PWD discount. The discount is
 * due on the VAT-exclusive price, so VAT-inclusive prices have to shed it first.
 * Prices that exclude VAT have nothing to remove.
 */
export function embeddedVat(
  subtotal: number,
  settings?: TaxPricingSettings | null,
  discount?: { category?: string; code?: string } | null
): number {
  if (!settings?.pricesIncludeTax || !settings.taxEnabled || !settings.taxRate || !isVatExemptDiscount(discount)) return 0;
  return roundMoney(taxOn(subtotal, settings.taxRate, true));
}

/**
 * What a discount takes off a subtotal. `amount` is everything removed, so
 * subtotal − amount is the new base; `vatRemoved` is the part of it that is VAT
 * rather than discount.
 */
export function discountFor(
  rule: DiscountRule,
  subtotal: number,
  settings?: TaxPricingSettings | null,
  discount?: { category?: string; code?: string } | null
): { amount: number; vatRemoved: number } {
  const vatRemoved = embeddedVat(subtotal, settings, discount);
  const base = subtotal - vatRemoved;
  let value: number;
  if (rule.type === 'percentage') {
    value = roundMoney((base * rule.value) / 100);
    if (rule.maxDiscountAmount) value = Math.min(value, rule.maxDiscountAmount);
  } else {
    value = Math.min(rule.value, base);
  }
  return { amount: roundMoney(value + vatRemoved), vatRemoved };
}
