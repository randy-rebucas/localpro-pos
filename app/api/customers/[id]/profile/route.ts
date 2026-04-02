import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import Transaction from '@/models/Transaction';
import LoyaltyTransaction from '@/models/LoyaltyTransaction';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid customer ID' }, { status: 400 });
    }

    const customer = await Customer.findOne({ _id: id, tenantId }).lean();
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    // Last 10 transactions
    const recentTransactions = await Transaction.find(
      { tenantId, customerId: id, status: 'completed' },
      { _id: 1, receiptNumber: 1, total: 1, paymentMethod: 1, items: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Total order count + lifetime value
    const [stats] = await Transaction.aggregate([
      { $match: { tenantId, customerId: new mongoose.Types.ObjectId(id), status: 'completed' } },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$total' },
          avgOrderValue: { $avg: '$total' },
        },
      },
    ]);

    // Top 5 products by quantity bought
    const topProducts = await Transaction.aggregate([
      { $match: { tenantId, customerId: new mongoose.Types.ObjectId(id), status: 'completed' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          totalQty: { $sum: '$items.quantity' },
          totalSpent: { $sum: '$items.subtotal' },
        },
      },
      { $sort: { totalQty: -1 } },
      { $limit: 5 },
    ]);

    // Loyalty history
    const loyaltyHistory = await LoyaltyTransaction.find(
      { tenantId, customerId: id },
      { type: 1, points: 1, description: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // RFM — compute segment
    const now = new Date();
    const daysSinceLastPurchase = customer.lastPurchaseDate
      ? Math.floor((now.getTime() - new Date(customer.lastPurchaseDate).getTime()) / 86400000)
      : null;
    const orderCount: number = stats?.orderCount ?? 0;
    const lifetimeValue: number = stats?.totalSpent ?? 0;

    let segment: 'new' | 'regular' | 'vip' | 'at_risk' | 'lapsed' | 'prospect';
    if (orderCount === 0) {
      segment = 'prospect';
    } else if (daysSinceLastPurchase !== null && daysSinceLastPurchase > 90) {
      segment = 'lapsed';
    } else if (daysSinceLastPurchase !== null && daysSinceLastPurchase > 30 && orderCount < 5) {
      segment = 'at_risk';
    } else if (lifetimeValue >= 5000 || (customer.loyaltyPointsBalance ?? 0) >= 500 || orderCount >= 20) {
      segment = 'vip';
    } else if (orderCount <= 2) {
      segment = 'new';
    } else {
      segment = 'regular';
    }

    return NextResponse.json({
      success: true,
      data: {
        customer,
        recentTransactions,
        topProducts,
        loyaltyHistory,
        stats: {
          orderCount,
          lifetimeValue,
          avgOrderValue: stats?.avgOrderValue ?? 0,
          daysSinceLastPurchase,
          segment,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer profile');
  }
}
