import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, requireRole } from '@/lib/auth';
import Transaction from '@/models/Transaction';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { arrayToCSV } from '@/lib/export';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    await requireRole(request, ['admin', 'manager', 'owner']);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
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
    const transactions = await Transaction.find({
      tenantId,
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Map to sales journal format
    const journalEntries = transactions.map((txn: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      receiptNumber: txn.receiptNumber || '',
      date: new Date(txn.createdAt).toISOString().split('T')[0],
      time: new Date(txn.createdAt).toLocaleTimeString('en-PH', { hour12: false }),
      items: txn.items?.map((item: any) => item.name).join('; ') || '', // eslint-disable-line @typescript-eslint/no-explicit-any
      itemCount: txn.items?.length || 0,
      subtotal: txn.subtotal || 0,
      discountCategory: txn.discountCategory || '',
      discountAmount: txn.discountAmount || 0,
      taxExemptAmount: txn.taxExemptAmount || 0,
      taxAmount: txn.taxAmount || 0,
      total: txn.total || 0,
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
