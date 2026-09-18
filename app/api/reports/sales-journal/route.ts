import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { arrayToCSV } from '@/lib/export';
import { logger } from '@/lib/logger';
import { resolveTenantDateRange, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  try {
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

    const tenantSettings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { timezone: true, timeFormat: true },
    });
    const tenantTz = tenantSettings?.timezone || DEFAULT_TENANT_TIMEZONE;
    const tenantTimeFormat = tenantSettings?.timeFormat || '12h';

    const searchParams = request.nextUrl.searchParams;
    const { startDate, endDate } = resolveTenantDateRange(
      searchParams.get('startDate'),
      searchParams.get('endDate'),
      tenantTz
    );
    const format = searchParams.get('format') || 'json'; // json, csv

    // Query transactions for the date range
    const transactions = await prisma.transaction.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { select: { name: true } },
      },
    });

    // Map to sales journal format
    const journalEntries = transactions.map((txn) => ({
      receiptNumber: txn.receiptNumber || '',
      date: new Date(txn.createdAt).toLocaleDateString('en-CA', { timeZone: tenantTz }),
      time: new Date(txn.createdAt).toLocaleTimeString('en-US', { timeZone: tenantTz, hour12: tenantTimeFormat === '12h' }),
      items: txn.items?.map((item) => item.name).join('; ') || '',
      itemCount: txn.items?.length || 0,
      subtotal: Number(txn.subtotal ?? 0),
      discountCategory: txn.discountCategory || '',
      discountAmount: Number(txn.discountAmount ?? 0),
      taxExemptAmount: Number(txn.taxExemptAmount ?? 0),
      taxAmount: Number(txn.taxAmount ?? 0),
      total: Number(txn.total ?? 0),
      paymentMethod: txn.paymentMethod || '',
      status: txn.status || '',
    }));

    if (format === 'csv') {
      const headers = [
        'receiptNumber', 'date', 'time', 'items', 'itemCount',
        'subtotal', 'discountCategory', 'discountAmount',
        'taxExemptAmount', 'taxAmount', 'total', 'paymentMethod', 'status',
      ];
      const csv = arrayToCSV(journalEntries, headers);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="sales-journal-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        entries: journalEntries,
        summary: {
          totalTransactions: journalEntries.length,
          totalSales: journalEntries.reduce((sum: number, e: any) => sum + e.total, 0), // eslint-disable-line @typescript-eslint/no-explicit-any
          totalTax: journalEntries.reduce((sum: number, e: any) => sum + e.taxAmount, 0), // eslint-disable-line @typescript-eslint/no-explicit-any
          totalDiscounts: journalEntries.reduce((sum: number, e: any) => sum + e.discountAmount, 0), // eslint-disable-line @typescript-eslint/no-explicit-any
          totalTaxExempt: journalEntries.reduce((sum: number, e: any) => sum + e.taxExemptAmount, 0), // eslint-disable-line @typescript-eslint/no-explicit-any
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
