import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Campaign from '@/models/Campaign';
import Customer from '@/models/Customer';
import Transaction from '@/models/Transaction';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { sendEmail, sendSMS } from '@/lib/notifications';
import mongoose from 'mongoose';
import { cacheWrap, TTL } from '@/lib/cache';
import { isInSegment } from '@/lib/crm-segments';
import { checkRateLimit } from '@/lib/rate-limit';

const SEND_BATCH_SIZE = 25;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'crm.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    // A send emails/texts every customer in the segment; a few per hour per store is plenty
    const { allowed } = checkRateLimit(`crm:send:${tenantId}`, 5, 60 * 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many campaigns sent recently. Try again later.' }, { status: 429 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid campaign ID' }, { status: 400 });
    }

    // Atomically claim the campaign before sending anything: a plain find()
    // followed by a later status check is a race — two concurrent clicks (or
    // two admins) could both read 'draft' and each blast the full segment.
    // Claiming via findOneAndUpdate makes only one request win the send.
    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, tenantId, status: { $in: ['draft', 'failed'] } },
      { $set: { status: 'sent' } },
      { new: true }
    );
    if (!campaign) {
      const exists = await Campaign.exists({ _id: id, tenantId });
      return NextResponse.json(
        { success: false, error: exists ? 'Campaign already sent' : 'Campaign not found' },
        { status: exists ? 409 : 404 }
      );
    }

    // Resolve recipients — fetch all active customers with contact info
    const contactField = campaign.channel === 'email' ? { email: { $exists: true, $ne: '' } } : { phone: { $exists: true, $ne: '' } };
    const candidates = await Customer.find(
      { tenantId, isActive: true, ...contactField },
      { _id: 1, firstName: 1, email: 1, phone: 1, lastPurchaseDate: 1, loyaltyPointsBalance: 1, totalSpent: 1 }
    ).lean();

    // Real order counts per customer — must match the same logic /api/crm/segments
    // uses, so who actually receives a segment's campaign matches who the admin
    // saw in that segment when composing it. (aggregate() requires an explicit
    // ObjectId cast — tenantId here is a string, unlike the auto-cast .find() above.)
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    // Same cached per-tenant stats as /api/crm/segments (customer sales only)
    const orderStats = await cacheWrap(`crm:orderstats:${tenantId}`, TTL.LONG, () =>
      Transaction.aggregate<{ _id: mongoose.Types.ObjectId | null; orderCount: number; totalSpent: number }>([
        { $match: { tenantId: tenantObjectId, customerId: { $ne: null }, status: 'completed' } },
        { $group: { _id: '$customerId', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
      ])
    );
    const statsMap = new Map(
      orderStats.filter((s) => s._id != null).map((s) => [String(s._id), { orderCount: s.orderCount, totalSpent: s.totalSpent }])
    );

    const now = new Date();
    const recipients = candidates.filter((c) => isInSegment(campaign.segment, c, statsMap.get(String(c._id)), now));

    // Deliver via the existing multi-provider notification layer (lib/notifications.ts),
    // in small batches so we don't fire hundreds of provider calls at once.
    let sentCount = 0;
    let failedCount = 0;

    // The compose form offers {firstName} as a personalization token; fill it per recipient.
    const personalize = (text: string | undefined, firstName: unknown) =>
      text?.replace(/\{firstName\}/g, typeof firstName === 'string' ? firstName.trim() : '');

    for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
      const batch = recipients.slice(i, i + SEND_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((recipient) =>
          campaign.channel === 'email'
            ? sendEmail({ to: recipient.email as string, subject: personalize(campaign.subject, recipient.firstName), message: personalize(campaign.body, recipient.firstName) as string, type: 'email' })
            : sendSMS({ to: recipient.phone as string, message: personalize(campaign.body, recipient.firstName) as string, type: 'sms' })
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
