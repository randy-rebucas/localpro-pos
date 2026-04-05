import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import AccountsReceivable from '@/models/AccountsReceivable';

// GET /api/reports/receivables - Accounts receivable aging analysis
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`read:reports-receivables:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Restrict to admins/managers
    if (!['admin', 'manager', 'owner'].includes(user?.role || '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // Calculate aging buckets (0-30, 30-60, 60-90, 90+ days overdue)
    const now = new Date();

    const agingBuckets = await AccountsReceivable.aggregate([
      {
        $match: {
          tenantId,
          isActive: true,
          paymentStatus: { $in: ['pending', 'partial', 'overdue'] },
        },
      },
      {
        $project: {
          outstandingAmount: 1,
          dueDate: 1,
          customerId: 1,
          transactionId: 1,
          daysPastDue: {
            $divide: [
              { $subtract: [now, '$dueDate'] },
              1000 * 60 * 60 * 24, // Convert ms to days
            ],
          },
        },
      },
      {
        $bucket: {
          groupBy: '$daysPastDue',
          boundaries: [0, 30, 60, 90, Number.MAX_SAFE_INTEGER],
          default: '90+',
          output: {
            count: { $sum: 1 },
            total: { $sum: '$outstandingAmount' },
            invoices: {
              $push: {
                customerId: '$customerId',
                transactionId: '$transactionId',
                outstanding: '$outstandingAmount',
                daysPastDue: '$daysPastDue',
              },
            },
          },
        },
      },
    ]);

    // Calculate total outstanding
    const totalOutstanding = await AccountsReceivable.aggregate([
      {
        $match: {
          tenantId,
          isActive: true,
          paymentStatus: { $in: ['pending', 'partial', 'overdue'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$outstandingAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Status breakdown
    const statusBreakdown = await AccountsReceivable.aggregate([
      {
        $match: {
          tenantId,
          isActive: true,
        },
      },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          total: { $sum: '$outstandingAmount' },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      data: {
        agingAnalysis: agingBuckets,
        summary: {
          totalOutstanding: totalOutstanding[0]?.total || 0,
          totalInvoices: totalOutstanding[0]?.count || 0,
        },
        statusBreakdown,
        generatedAt: now.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to generate receivables report');
  }
}
