import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import { requireTenantAccess } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

const DEFAULT_DISCOUNTS = [
  {
    code: 'SC20',
    name: 'Senior Citizen Discount (RA 9994)',
    description: '20% discount for Senior Citizens per Republic Act 9994',
    type: 'percentage' as const,
    value: 20,
    category: 'senior',
    requiresIdVerification: true,
    validFrom: new Date('2024-01-01'),
    validUntil: new Date('2030-12-31'),
    isActive: true,
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
    validUntil: new Date('2030-12-31'),
    isActive: true,
  },
];

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['cashier', 'manager', 'admin', 'owner']);
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    const created: string[] = [];
    const skipped: string[] = [];

    for (const discount of DEFAULT_DISCOUNTS) {
      const exists = await Discount.findOne({ tenantId, code: discount.code });
      if (exists) {
        skipped.push(discount.code);
        continue;
      }
      await Discount.create({ ...discount, tenantId, usageCount: 0 });
      created.push(discount.code);
    }

    return NextResponse.json({
      success: true,
      data: { created, skipped },
      message: created.length > 0
        ? `Created: ${created.join(', ')}. ${skipped.length > 0 ? `Already existed: ${skipped.join(', ')}` : ''}`
        : `All default discounts already exist: ${skipped.join(', ')}`,
    });
  } catch (error: unknown) {
    logger.error('Error seeding default discounts:', error);
    return NextResponse.json({ success: false, error: 'Failed to seed discounts' }, { status: 500 });
  }
}
