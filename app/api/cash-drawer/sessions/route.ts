import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import CashDrawerSession from '@/models/CashDrawerSession';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    const query: any = { tenantId };
    if (status) {
      query.status = status;
    }

    const sessions = await CashDrawerSession.find(query)
      .populate('userId', 'name email')
      .sort({ openingTime: -1 })
      .lean();

    return NextResponse.json({ success: true, data: sessions });
  } catch (error: any) {
    console.error('Error fetching cash drawer sessions:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { action, openingAmount, closingAmount, notes } = body;

    if (action === 'open') {
      // Check if there's an open session
      const openSession = await CashDrawerSession.findOne({
        tenantId,
        status: 'open',
      });

      if (openSession) {
        return NextResponse.json(
          { success: false, error: t('validation.cashDrawerAlreadyOpen', 'There is already an open cash drawer session') },
          { status: 400 }
        );
      }

      const session = await CashDrawerSession.create({
        tenantId,
        userId: user.userId,
        openingAmount: parseFloat(openingAmount || 0),
        openingTime: new Date(),
        status: 'open',
        notes,
      });

      await createAuditLog(request, {
        tenantId,
        action: AuditActions.CREATE,
        entityType: 'cashDrawerSession',
        entityId: session._id.toString(),
        changes: { action: 'open', openingAmount },
      });

      return NextResponse.json({ success: true, data: session }, { status: 201 });
    } else if (action === 'close') {
      const openSession = await CashDrawerSession.findOne({
        tenantId,
        status: 'open',
      });

      if (!openSession) {
        return NextResponse.json(
          { success: false, error: t('validation.noOpenCashDrawerSession', 'No open cash drawer session found') },
          { status: 404 }
        );
      }

      // Calculate expected amount
      const sessionEnd = new Date();
      const cashTransactions = await Transaction.find({
        tenantId,
        paymentMethod: 'cash',
        createdAt: { $gte: openSession.openingTime, $lte: sessionEnd },
        status: 'completed',
      }).lean();

      const cashSales = cashTransactions.reduce((sum, t) => sum + t.total, 0);

      const cashExpenses = await Expense.find({
        tenantId,
        paymentMethod: 'cash',
        date: { $gte: openSession.openingTime, $lte: sessionEnd },
      }).lean();

      const cashExpensesTotal = cashExpenses.reduce((sum, e) => sum + e.amount, 0);

      const expectedAmount = openSession.openingAmount + cashSales - cashExpensesTotal;
      const actualClosingAmount = parseFloat(closingAmount || 0);
      const difference = actualClosingAmount - expectedAmount;

      const shortage = difference < 0 ? Math.abs(difference) : undefined;
      const overage = difference > 0 ? difference : undefined;

      openSession.closingAmount = actualClosingAmount;
      openSession.expectedAmount = expectedAmount;
      openSession.shortage = shortage;
      openSession.overage = overage;
      openSession.closingTime = sessionEnd;
      openSession.status = 'closed';
      if (notes) {
        openSession.notes = notes;
      }

      await openSession.save();

      await createAuditLog(request, {
        tenantId,
        action: AuditActions.UPDATE,
        entityType: 'cashDrawerSession',
        entityId: openSession._id.toString(),
        changes: {
          action: 'close',
          closingAmount: actualClosingAmount,
          expectedAmount,
          shortage,
          overage,
        },
      });

      return NextResponse.json({ success: true, data: openSession });
    } else {
      return NextResponse.json(
        { success: false, error: t('validation.invalidCashDrawerAction', 'Invalid action. Use "open" or "close"') },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error managing cash drawer session:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

