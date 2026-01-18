/**
 * API Route for Automation Status
 * Returns the status of all automations
 */

import { NextRequest, NextResponse } from 'next/server';
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

    // Optional: Add authentication
    // Allow if: no secret configured, or secret matches, or Vercel cron header
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = request.nextUrl.searchParams.get('secret');
    const authHeader = request.headers.get('authorization');
    const isVercelCron = authHeader === `Bearer ${cronSecret}`;

    // Only require secret if it's configured AND not from Vercel cron
    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Provide ?secret=your-secret or set CRON_SECRET in environment.' },
        { status: 401 }
      );
    }

    const now = new Date();
    const stats = {
      tenants: {
        total: 0,
        active: 0,
      },
      bookings: {
        pendingReminders: 0,
        upcoming24h: 0,
      },
      inventory: {
        lowStockProducts: 0,
      },
      discounts: {
        active: 0,
        expiringSoon: 0,
        needsActivation: 0,
        needsDeactivation: 0,
      },
      attendance: {
        openSessions: 0,
        forgottenSessions: 0,
      },
      cashDrawer: {
        openSessions: 0,
      },
      transactions: {
        pendingReceipts: 0,
      },
      automations: {
        enabled: process.env.ENABLE_CRON_JOBS === 'true',
        cronSecretConfigured: !!process.env.CRON_SECRET,
        emailProvider: process.env.EMAIL_PROVIDER || 'console',
        smsProvider: process.env.SMS_PROVIDER || 'console',
      },
    };

    // Get tenant stats
    const tenants = await Tenant.find({ status: 'active' }).lean();
    stats.tenants.total = await Tenant.countDocuments();
    stats.tenants.active = tenants.length;

    // Get booking stats
    const reminderWindowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reminderWindowEnd = new Date(reminderWindowStart.getTime() + 60 * 60 * 1000);
    
    stats.bookings.pendingReminders = await Booking.countDocuments({
      startTime: {
        $gte: reminderWindowStart,
        $lte: reminderWindowEnd,
      },
      status: { $in: ['pending', 'confirmed'] },
      reminderSent: { $ne: true },
    });

    stats.bookings.upcoming24h = await Booking.countDocuments({
      startTime: {
        $gte: now,
        $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
      status: { $in: ['pending', 'confirmed'] },
    });

    // Get inventory stats (sample first tenant)
    if (tenants.length > 0) {
      try {
        const lowStock = await getLowStockProducts(tenants[0]._id.toString());
        stats.inventory.lowStockProducts = lowStock.length;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_error) {
        // Ignore errors
      }
    }

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
  } catch (error: unknown) {
    console.error('Automation status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
