/**
 * CAS Report API
 * Exports transactions in BIR Computerized Accounting System (CAS) format as CSV.
 * Gated by birCompliance.casReporting subscription feature.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import Transaction from '@/models/Transaction';
import { checkBirFeatureAccess } from '@/lib/subscription';
import { arrayToCSV } from '@/lib/export';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'reports.view'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
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
    // A bare "YYYY-MM-DD" endDate parses to UTC midnight (start of that day),
    // which would make createdAt $lte exclude nearly the entire end day's
    // transactions from what should be an inclusive BIR filing period —
    // extend to end-of-day, matching the other /api/reports/* routes.
    if (endDateParam) endDate.setHours(23, 59, 59, 999);

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
