import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import AccountsReceivable from '@/models/AccountsReceivable';
import PaymentRecord from '@/models/PaymentRecord';

// GET /api/customers/:id/receivables - Get customer's receivables and payment history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId || !user) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`read:customer-receivables:${tenantId}:${ip}`, 100, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    if (!['admin', 'manager', 'owner'].includes(user.role || '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { id: customerId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 200);
    const skip = parseInt(searchParams.get('skip') || '0');
    const status = searchParams.get('status');

    // Get open/recent receivables
    const receivableQuery: Record<string, unknown> = { tenantId, customerId, isActive: true };
    if (status && ['pending', 'partial', 'paid', 'overdue', 'cancelled'].includes(status)) {
      receivableQuery.paymentStatus = status;
    }

    const receivables = await AccountsReceivable.find(receivableQuery)
      .sort({ dueDate: -1 })
      .limit(limit)
      .skip(skip)
      .select('originalAmount paidAmount outstandingAmount dueDate paymentStatus invoiceNumber createdAt')
      .lean();

    const totalReceivables = await AccountsReceivable.countDocuments(receivableQuery);

    // Get recent payment history
    const paymentHistory = await PaymentRecord.find({ tenantId, customerId })
      .sort({ processedAt: -1 })
      .limit(10)
      .select('amount paymentMethod reference processedAt')
      .lean();

    // Calculate summary
    const summary = await AccountsReceivable.aggregate([
      {
        $match: {
          tenantId,
          customerId,
          isActive: true,
          paymentStatus: { $in: ['pending', 'partial', 'overdue'] },
        },
      },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$outstandingAmount' },
          totalInvoiced: { $sum: '$originalAmount' },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] },
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, 1, 0] },
          },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      data: {
        receivables,
        paymentHistory,
        summary: summary[0] || {
          totalOutstanding: 0,
          totalInvoiced: 0,
          pendingCount: 0,
          overdueCount: 0,
        },
        pagination: { skip, limit, total: totalReceivables },
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer receivables');
  }
}
