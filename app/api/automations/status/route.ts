/**
 * API Route for Automation Status
 * Returns the status of all automations
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Booking from '@/models/Booking';
import Discount from '@/models/Discount';
import Attendance from '@/models/Attendance';
import CashDrawerSession from '@/models/CashDrawerSession';
import Transaction from '@/models/Transaction';
import { getLowStockProducts } from '@/lib/stock';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

        const authError = verifyCronAuth(request, null);
    if (authError) return authError;

    // Get discount stats
    stats.discounts.active = await Discount.countDocuments({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
    });

    const expiringSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    stats.discounts.expiringSoon = await Discount.countDocuments({
      isActive: true,
      validUntil: { $gte: now, $lte: expiringSoon },
    });

    stats.discounts.needsActivation = await Discount.countDocuments({
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      isActive: false,
    });

    stats.discounts.needsDeactivation = await Discount.countDocuments({
      $or: [
        { validUntil: { $lt: now } },
      ],
      isActive: true,
    });

    // Get attendance stats
    stats.attendance.openSessions = await Attendance.countDocuments({
      clockOut: null,
    });

    // Count forgotten sessions (open for more than 12 hours)
    const forgottenThreshold = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    stats.attendance.forgottenSessions = await Attendance.countDocuments({
      clockOut: null,
      clockIn: { $lt: forgottenThreshold },
    });

    // Get cash drawer stats
    stats.cashDrawer.openSessions = await CashDrawerSession.countDocuments({
      status: 'open',
    });

    // Get transaction stats (transactions with email in notes from last 24h)
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentTransactions = await Transaction.find({
      createdAt: { $gte: last24h },
      status: 'completed',
      notes: { $regex: /email/i },
    }).limit(100).lean();

    stats.transactions.pendingReceipts = recentTransactions.filter(t => {
      const emailMatch = t.notes?.match(/email[:\s]+([^\s]+)/i);
      return !!emailMatch;
    }).length;

    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: now.toISOString(),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Automation status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
