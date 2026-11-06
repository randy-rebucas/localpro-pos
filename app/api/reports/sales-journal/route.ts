import { NextRequest, NextResponse } from 'next/server';
import { REPORT_MAX_TIME_MS } from '@/lib/query-utils';
import { isRefundRecord } from '@/lib/refund-plan';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { arrayToCSV } from '@/lib/export';
import { logger } from '@/lib/logger';
import { resolveTenantDateRange, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';

type JournalEntryType = 'sale' | 'refund' | 'void';

/** Sales stay as recorded, refunds reverse them on the refund's date, voids count for nothing. */
const JOURNAL_SIGN: Record<JournalEntryType, number> = { sale: 1, refund: -1, void: 0 };

function journalEntryType(txn: { status?: string; receiptNumber?: string }): JournalEntryType {
  if (txn.status === 'cancelled') return 'void';
  return isRefundRecord(txn) ? 'refund' : 'sale';
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'reports.view'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    // Check if reports feature is enabled in subscription
    try {
      await checkFeatureAccess(tenantId.toString(), 'enableReports');
    } catch (featureError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: featureError.message },
        { status: 403 }
      );
    }

    const tenantDoc = await Tenant.findById(tenantId).select('settings.timezone settings.timeFormat').lean();
    const tenantTz = tenantDoc?.settings?.timezone || DEFAULT_TENANT_TIMEZONE;
    const tenantTimeFormat = tenantDoc?.settings?.timeFormat || '12h';

    const searchParams = request.nextUrl.searchParams;
    const { startDate, endDate } = resolveTenantDateRange(
      searchParams.get('startDate'),
      searchParams.get('endDate'),
      tenantTz
    );
    const format = searchParams.get('format') || 'json'; // json, csv

    // Query transactions for the date range
    const transactions = await Transaction.find({
      tenantId,
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .select('createdAt receiptNumber paymentMethod status subtotal total taxAmount taxExemptAmount discountAmount discountCategory items.name')
      .sort({ createdAt: -1 })
      .maxTimeMS(REPORT_MAX_TIME_MS)
      .lean();

    // Map to sales journal format
    const journalEntries = transactions.map((txn: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const entryType = journalEntryType(txn);
      const sign = JOURNAL_SIGN[entryType];
      return {
        receiptNumber: txn.receiptNumber || '',
        date: new Date(txn.createdAt).toLocaleDateString('en-CA', { timeZone: tenantTz }),
        time: new Date(txn.createdAt).toLocaleTimeString('en-US', { timeZone: tenantTz, hour12: tenantTimeFormat === '12h' }),
        items: txn.items?.map((item: any) => item.name).join('; ') || '', // eslint-disable-line @typescript-eslint/no-explicit-any
        itemCount: txn.items?.length || 0,
        subtotal: sign * (txn.subtotal || 0),
        discountCategory: txn.discountCategory || '',
        discountAmount: sign * (txn.discountAmount || 0),
        taxExemptAmount: sign * (txn.taxExemptAmount || 0),
        taxAmount: sign * (txn.taxAmount || 0),
        total: sign * (txn.total || 0),
        paymentMethod: txn.paymentMethod || '',
        status: txn.status || '',
        entryType,
      };
    });

    if (format === 'csv') {
      const headers = [
        'receiptNumber', 'date', 'time', 'items', 'itemCount',
        'subtotal', 'discountCategory', 'discountAmount',
        'taxExemptAmount', 'taxAmount', 'total', 'paymentMethod', 'status', 'entryType',
      ];
      const csv = arrayToCSV(journalEntries, headers);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="sales-journal-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    const netOf = (field: 'total' | 'taxAmount' | 'discountAmount' | 'taxExemptAmount') =>
      Math.round(journalEntries.reduce((sum, entry) => sum + entry[field], 0) * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        entries: journalEntries,
        summary: {
          totalTransactions: journalEntries.filter((entry) => entry.entryType === 'sale').length,
          totalSales: netOf('total'),
          totalTax: netOf('taxAmount'),
          totalDiscounts: netOf('discountAmount'),
          totalTaxExempt: netOf('taxExemptAmount'),
        },
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching sales journal:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
