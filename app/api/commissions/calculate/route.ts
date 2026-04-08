import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Commission from '@/models/Commission';
import CommissionRule from '@/models/CommissionRule';
import Transaction from '@/models/Transaction';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import mongoose from 'mongoose';

/**
 * POST /api/commissions/calculate
 * Calculates and creates commission records for a date range.
 * Body: { startDate, endDate }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const body = await request.json();

    const now = new Date();
    const startDate = body.startDate ? new Date(body.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = body.endDate ? new Date(body.endDate) : now;

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 });
    }

    const period = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    const tenantObjId = new mongoose.Types.ObjectId(tenantId);

    const [rules, transactions] = await Promise.all([
      CommissionRule.find({ tenantId, isActive: true }).lean(),
      Transaction.find({
        tenantId: tenantObjId,
        status: 'completed',
        createdAt: { $gte: startDate, $lte: endDate },
        userId: { $exists: true },
      }).lean(),
    ]);

    if (rules.length === 0 || transactions.length === 0) {
      return NextResponse.json({ success: true, data: { created: 0, message: 'No rules or transactions found' } });
    }

    // Batch-fetch existing commissions for this period to avoid O(n*m) DB queries in the loop
    const txIds = transactions.map(tx => tx._id);
    const ruleIds = rules.map(r => r._id);
    const existingCommissions = await Commission.find({
      transactionId: { $in: txIds },
      ruleId: { $in: ruleIds },
    }).select('transactionId ruleId').lean();

    // Build a Set of "txId:ruleId" pairs that already exist
    const existingSet = new Set(
      existingCommissions.map((c: any) => `${c.transactionId}:${c.ruleId}`) // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    const commissionsToCreate: object[] = [];

    for (const tx of transactions) {
      const staffIdStr = (tx as any).userId?.toString(); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!staffIdStr) continue;

      for (const rule of rules) {
        // Check if this rule applies to this staff member
        if (rule.staffIds.length > 0 && !rule.staffIds.some((id: mongoose.Types.ObjectId) => id.toString() === staffIdStr)) {
          continue;
        }

        // Check minimum sale
        if (tx.total < rule.minimumSale) continue;

        // Skip if commission already exists for this transaction + rule
        if (existingSet.has(`${tx._id}:${rule._id}`)) continue;

        let amount = 0;
        let rate = 0;

        if (rule.type === 'percentage') {
          rate = rule.rate || 0;
          amount = (tx.total * rate) / 100;
        } else if (rule.type === 'flat') {
          rate = rule.rate || 0;
          amount = rate;
        } else if (rule.type === 'tiered' && rule.tiers?.length) {
          const sortedTiers = [...rule.tiers].sort((a, b) => b.minSale - a.minSale);
          const matchingTier = sortedTiers.find(t => tx.total >= t.minSale);
          if (matchingTier) {
            rate = matchingTier.rate;
            amount = (tx.total * rate) / 100;
          }
        }

        if (amount > 0) {
          commissionsToCreate.push({
            tenantId,
            staffId: (tx as any).userId, // eslint-disable-line @typescript-eslint/no-explicit-any
            transactionId: tx._id,
            ruleId: rule._id,
            amount,
            rate,
            saleAmount: tx.total,
            status: 'pending',
            period,
          });
        }
      }
    }

    if (commissionsToCreate.length > 0) {
      await Commission.insertMany(commissionsToCreate, { ordered: false });
    }

    return NextResponse.json({
      success: true,
      data: { created: commissionsToCreate.length, period, transactions: transactions.length },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to calculate commissions');
  }
}
