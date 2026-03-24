/**
 * CAS Report API
 * Exports transactions in BIR Computerized Accounting System (CAS) format as CSV.
 * Gated by birCompliance.casReporting subscription feature.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, requireRole } from '@/lib/auth';
import Transaction from '@/models/Transaction';
import { checkBirFeatureAccess } from '@/lib/subscription';
import { arrayToCSV } from '@/lib/export';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    await requireRole(request, ['admin', 'manager', 'owner']);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Gate on CAS reporting BIR feature
    try {
      await checkBirFeatureAccess(tenantId.toString(), 'casReporting');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const isValidDate = (s: string) => !isNaN(Date.parse(s));

    if (startDateParam && !isValidDate(startDateParam)) {
      return NextResponse.json({ success: false, error: 'Invalid startDate format' }, { status: 400 });
    }
    if (endDateParam && !isValidDate(endDateParam)) {
      return NextResponse.json({ success: false, error: 'Invalid endDate format' }, { status: 400 });
    }

    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = endDateParam ? new Date(endDateParam) : new Date();

    const transactions = await Transaction.find({
      tenantId,
      status: 'completed',
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ createdAt: 1 })
      .lean();

    type TransactionDoc = {
      createdAt: Date;
      receiptNumber?: string;
      paymentMethod?: string;
      subtotal?: number;
      total?: number;
      taxAmount?: number;
      taxExemptAmount?: number;
    };

    // CAS format: BIR-compatible accounting ledger entries
    const casEntries = (transactions as TransactionDoc[]).map((txn) => {
      const subtotal = txn.subtotal ?? txn.total ?? 0;
      const taxAmount = txn.taxAmount ?? 0;
      const taxExemptAmount = txn.taxExemptAmount ?? 0;
      const vatableSales = subtotal - taxExemptAmount - taxAmount > 0
        ? subtotal - taxExemptAmount - taxAmount
        : 0;

      return {
        date: new Date(txn.createdAt).toISOString().split('T')[0],
        receiptNumber: txn.receiptNumber || '',
        description: `Sales - ${txn.paymentMethod || 'unknown'}`,
        debit: txn.total ?? 0,
        credit: 0,
        vatableSales,
        vatAmount: taxAmount,
        vatExemptSales: taxExemptAmount,
        total: txn.total ?? 0,
      };
    });

    const headers = [
      'date', 'receiptNumber', 'description',
      'debit', 'credit',
      'vatableSales', 'vatAmount', 'vatExemptSales', 'total',
    ];
    const csv = arrayToCSV(casEntries, headers);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cas-report-${startStr}-to-${endStr}.csv"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate CAS report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
