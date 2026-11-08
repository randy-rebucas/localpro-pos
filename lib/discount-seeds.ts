import Discount from '@/models/Discount';
import { LEGAL_DISCOUNT_CODES, LOCKED_LEGAL_DISCOUNT_FIELDS, isLegalDiscountCode } from '@/lib/legal-discounts';

/** The statutory discounts don't lapse; a far date keeps the schema's required window. */
const LEGAL_DISCOUNT_VALID_UNTIL = new Date('2099-12-31T23:59:59.999Z');

/**
 * Legal discount definitions — Philippine law requires these discounts.
 * They are auto-seeded for every tenant on first access.
 */
const LEGAL_DISCOUNTS = [
  {
    code: 'SC20',
    name: 'Senior Citizen Discount (RA 9994)',
    description: '20% discount for Senior Citizens per Republic Act 9994',
    type: 'percentage' as const,
    value: 20,
    category: 'senior',
    requiresIdVerification: true,
    validFrom: new Date('2024-01-01'),
    validUntil: LEGAL_DISCOUNT_VALID_UNTIL,
    isActive: true,
    usageCount: 0,
  },
  {
    code: 'PWD20',
    name: 'PWD Discount (RA 10754)',
    description: '20% discount for Persons with Disability per Republic Act 10754',
    type: 'percentage' as const,
    value: 20,
    category: 'pwd',
    requiresIdVerification: true,
    validFrom: new Date('2024-01-01'),
    validUntil: LEGAL_DISCOUNT_VALID_UNTIL,
    isActive: true,
    usageCount: 0,
  },
];

// Codes and locked fields are shared with the browser (lib/legal-discounts.ts)
export { LEGAL_DISCOUNT_CODES, LOCKED_LEGAL_DISCOUNT_FIELDS, isLegalDiscountCode };

/**
 * Auto-seed legal discounts (SC20, PWD20) for a tenant if they don't exist yet.
 * Uses $setOnInsert so existing discounts are never overwritten.
 */
export async function ensureLegalDiscounts(tenantId: string) {
  for (const def of LEGAL_DISCOUNTS) {
    await Discount.findOneAndUpdate(
      { tenantId, code: def.code },
      { $setOnInsert: { ...def, tenantId } },
      { upsert: true }
    );
  }
  // Older seeds ended on 2030-12-31; move them out so they never quietly stop
  // applying. Matches nothing (a cheap no-op) once done.
  await Discount.updateMany(
    { tenantId, code: { $in: LEGAL_DISCOUNT_CODES }, validUntil: { $lt: LEGAL_DISCOUNT_VALID_UNTIL } },
    { $set: { validUntil: LEGAL_DISCOUNT_VALID_UNTIL } }
  );
}
