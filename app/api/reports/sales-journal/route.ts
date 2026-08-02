import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { arrayToCSV } from '@/lib/export';
import { logger } from '@/lib/logger';

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
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : new Date();
    startDate.setHours(0, 0, 0, 0);
    if (searchParams.get('endDate')) endDate.setHours(23, 59, 59, 999);
    const format = searchParams.get('format') || 'json'; // json, csv

    // Query transactions for the date range
    const transactions = await prisma.transaction.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: { items: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Map to sales journal format
    const journalEntries = transactions.map((txn) => ({
      receiptNumber: txn.receiptNumber || '',
      date: new Date(txn.createdAt).toISOString().split('T')[0],
      time: new Date(txn.createdAt).toLocaleTimeString('en-PH', { hour12: false }),
      items: txn.items.map((item) => item.name).join('; ') || '',
      itemCount: txn.items.length || 0,
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
          totalSales: journalEntries.reduce((sum, e) => sum + e.total, 0),
          totalTax: journalEntries.reduce((sum, e) => sum + e.taxAmount, 0),
          totalDiscounts: journalEntries.reduce((sum, e) => sum + e.discountAmount, 0),
          totalTaxExempt: journalEntries.reduce((sum, e) => sum + e.taxExemptAmount, 0),
        },
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching sales journal:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch sales journal';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
