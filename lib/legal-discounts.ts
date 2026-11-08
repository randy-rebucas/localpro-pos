/**
 * The statutory discounts (Philippine law): Senior Citizen (RA 9994) and PWD
 * (RA 10754), both 20%. Free of database code so the admin form can use it.
 * The seed definitions live in lib/discount-seeds.ts.
 */

export const LEGAL_DISCOUNT_CODES = ['SC20', 'PWD20'];

/**
 * Fields of a statutory discount the store may not change: the rate is set by
 * law, and it can't be capped, conditioned on a minimum purchase, limited in
 * uses, scheduled or switched off.
 */
export const LOCKED_LEGAL_DISCOUNT_FIELDS = [
  'type', 'value', 'category', 'requiresIdVerification', 'minPurchaseAmount', 'maxDiscountAmount',
  'usageLimit', 'validFrom', 'validUntil', 'isActive',
] as const;

export function isLegalDiscountCode(code: string | undefined | null): boolean {
  return !!code && LEGAL_DISCOUNT_CODES.includes(code.toUpperCase());
}
