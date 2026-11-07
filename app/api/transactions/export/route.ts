import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { REPORT_MAX_TIME_MS } from '@/lib/query-utils';
import { parseFeedType, toFeedExportRow } from '@/lib/transactions-feed';
import { loadFeedEntries, queryFeedRefs, resolveFeedFilters } from '@/lib/transactions-feed-query';

const MAX_ROWS = 5_000;

/** The current Transactions view as flat rows, for the page to save as CSV, Excel or PDF. */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:transactions-export:${ip}`, 10, 60_000);

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

    if (!(await hasTenantPermission(role, tenantId, 'reports.view'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = parseFeedType(searchParams.get('type'));
    const filters = await resolveFeedFilters(searchParams, tenantId);
    const { refs, total } = await queryFeedRefs({ tenantId, type, filters, skip: 0, limit: MAX_ROWS, maxTimeMS: REPORT_MAX_TIME_MS });
    const entries = await loadFeedEntries(refs, tenantId);

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.TRANSACTION_EXPORT,
      entityType: 'transaction',
      changes: { type, rows: entries.length, total },
    });

    return NextResponse.json({
      success: true,
      data: entries.map(toFeedExportRow),
      total,
      truncated: total > entries.length,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to export transactions');
  }
}
