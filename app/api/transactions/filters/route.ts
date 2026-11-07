import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Branch from '@/models/Branch';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

const MAX_OPTIONS = 200;

/** Names for the Transactions filters. /api/users needs users.manage, which most viewers of this page lack. */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:transactions-filters:${ip}`, 60, 60_000);

    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    let tenantId: string;
    let role: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      role = tenantAccess.user.role;
    } catch (authError: unknown) {
      const msg = authError instanceof Error ? authError.message : '';
      return NextResponse.json(
        { success: false, error: msg.includes('Forbidden') ? t('validation.forbidden', 'Forbidden') : t('validation.unauthorized', 'Unauthorized') },
        { status: msg.includes('Forbidden') ? 403 : 401 }
      );
    }

    if (!(await hasTenantPermission(role, tenantId, 'transactions.view'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const active = { tenantId, isActive: { $ne: false } };
    const [cashiers, branches] = await Promise.all([
      User.find(active).select('name').sort({ name: 1 }).limit(MAX_OPTIONS).lean(),
      Branch.find(active).select('name').sort({ name: 1 }).limit(MAX_OPTIONS).lean(),
    ]);

    return NextResponse.json({ success: true, data: { cashiers, branches } });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch filter options');
  }
}
