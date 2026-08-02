import prisma from '@/lib/prisma';
import type { DiscountCategory } from '@prisma/client';

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
    category: 'senior' as DiscountCategory,
    requiresIdVerification: true,
    validFrom: new Date('2024-01-01'),
    validUntil: new Date('2030-12-31'),
    isActive: true,
    usageCount: 0,
  },
  {
    code: 'PWD20',
    name: 'PWD Discount (RA 10754)',
    description: '20% discount for Persons with Disability per Republic Act 10754',
    type: 'percentage' as const,
    value: 20,
    category: 'pwd' as DiscountCategory,
    requiresIdVerification: true,
    validFrom: new Date('2024-01-01'),
    validUntil: new Date('2030-12-31'),
    isActive: true,
    usageCount: 0,
  },
];

export const LEGAL_DISCOUNT_CODES = LEGAL_DISCOUNTS.map(d => d.code);

/**
 * Auto-seed legal discounts (SC20, PWD20) for a tenant if they don't exist yet.
 * Uses $setOnInsert so existing discounts are never overwritten.
 */
export async function ensureLegalDiscounts(tenantId: string) {
  for (const def of LEGAL_DISCOUNTS) {
    await prisma.discount.upsert({
      where: { tenantId_code: { tenantId, code: def.code } },
      create: { ...def, tenantId },
      update: {},
    });
  }
}
