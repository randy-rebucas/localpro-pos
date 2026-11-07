import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { INTERACTIVE_MAX_TIME_MS } from '@/lib/query-utils';
import { parseFeedType } from '@/lib/transactions-feed';
import { loadFeedEntries, queryFeedRefs, resolveFeedFilters } from '@/lib/transactions-feed-query';

const MAX_LIMIT = 50;

/** Sales and expenses as one list, newest first, filtered and paged on the server. */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:transactions-feed:${ip}`, 120, 60_000);

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

    const searchParams = request.nextUrl.searchParams;
    const type = parseFeedType(searchParams.get('type'));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '10') || 10), MAX_LIMIT);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const skip = (page - 1) * limit;

    const filters = await resolveFeedFilters(searchParams, tenantId);
    const { refs, total } = await queryFeedRefs({ tenantId, type, filters, skip, limit, maxTimeMS: INTERACTIVE_MAX_TIME_MS });
    const data = await loadFeedEntries(refs, tenantId);

    return NextResponse.json({
      success: true,
      data,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch transactions');
  }
}
