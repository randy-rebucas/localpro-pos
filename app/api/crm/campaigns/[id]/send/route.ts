import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Campaign from '@/models/Campaign';
import Customer from '@/models/Customer';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { sendEmail, sendSMS } from '@/lib/notifications';
import mongoose from 'mongoose';

const SEND_BATCH_SIZE = 25;

// Segment filter helpers (mirrors the /api/crm/segments logic)
const LAPSED_DAYS = 90;
const AT_RISK_DAYS = 30;
const VIP_SPEND = 5000;
const VIP_POINTS = 500;

function matchesSegment(
  segment: string,
  c: { lastPurchaseDate?: Date; loyaltyPointsBalance?: number; totalSpent?: number },
  orderCount: number
): boolean {
  if (segment === 'all') return true;
  const now = Date.now();
  const lastBuy = c.lastPurchaseDate ? new Date(c.lastPurchaseDate).getTime() : null;
  const daysSince = lastBuy ? Math.floor((now - lastBuy) / 86400000) : null;

  switch (segment) {
    case 'vip':
      return (c.totalSpent ?? 0) >= VIP_SPEND || (c.loyaltyPointsBalance ?? 0) >= VIP_POINTS || orderCount >= 20;
    case 'lapsed':
      return orderCount > 0 && daysSince !== null && daysSince > LAPSED_DAYS;
    case 'at_risk':
      return orderCount > 0 && daysSince !== null && daysSince > AT_RISK_DAYS && daysSince <= LAPSED_DAYS && orderCount < 5;
    case 'new':
      return orderCount > 0 && orderCount <= 2;
    case 'regular':
      return orderCount > 2 && (c.totalSpent ?? 0) < VIP_SPEND && (c.loyaltyPointsBalance ?? 0) < VIP_POINTS && orderCount < 20;
    default:
      return false;
  }
}

export async function POST(
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
      return NextResponse.json({ success: false, error: 'Invalid campaign ID' }, { status: 400 });
    }

    const campaign = await Campaign.findOne({ _id: id, tenantId });
    if (!campaign) return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    if (campaign.status === 'sent') {
      return NextResponse.json({ success: false, error: 'Campaign already sent' }, { status: 409 });
    }

    // Resolve recipients — fetch all active customers with contact info
    const contactField = campaign.channel === 'email' ? { email: { $exists: true, $ne: '' } } : { phone: { $exists: true, $ne: '' } };
    const candidates = await Customer.find(
      { tenantId, isActive: true, ...contactField },
      { _id: 1, email: 1, phone: 1, lastPurchaseDate: 1, loyaltyPointsBalance: 1, totalSpent: 1 }
    ).lean();

    // For order counts we'd normally join — use totalSpent proxy here to avoid heavy aggregation
    const recipients = candidates.filter((c) => {
      const orderCount = c.totalSpent && c.totalSpent > 0 ? Math.max(1, Math.round(c.totalSpent / 300)) : 0;
      return matchesSegment(campaign.segment, c, orderCount);
    });

    // Deliver via the existing multi-provider notification layer (lib/notifications.ts),
    // in small batches so we don't fire hundreds of provider calls at once.
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
      const batch = recipients.slice(i, i + SEND_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((recipient) =>
          campaign.channel === 'email'
            ? sendEmail({ to: recipient.email as string, subject: campaign.subject, message: campaign.body, type: 'email' })
            : sendSMS({ to: recipient.phone as string, message: campaign.body, type: 'sms' })
        )
      );
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          sentCount++;
        } else {
          failedCount++;
        }
      }
    }

    campaign.status = sentCount > 0 ? 'sent' : 'failed';
    campaign.sentCount = sentCount;
    campaign.sentAt = new Date();
    await campaign.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'campaign',
      entityId: String(campaign._id),
      changes: { action: 'send', sentCount, failedCount, channel: campaign.channel, segment: campaign.segment },
    });

    return NextResponse.json({
      success: true,
      data: { sentCount, failedCount, channel: campaign.channel, segment: campaign.segment },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to send campaign');
  }
}
