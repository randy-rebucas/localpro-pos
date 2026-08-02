import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { sendEmail, sendSMS } from '@/lib/notifications';

const SEND_BATCH_SIZE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Segment filter helpers (mirrors the /api/crm/segments logic)
const LAPSED_DAYS = 90;
const AT_RISK_DAYS = 30;
const VIP_SPEND = 5000;
const VIP_POINTS = 500;

function matchesSegment(
  segment: string,
  c: { lastPurchaseDate?: Date | null; loyaltyPointsBalance?: number; totalSpent?: number },
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
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'crm.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid campaign ID' }, { status: 400 });
    }

    const campaign = await prisma.campaign.findFirst({ where: { id, tenantId } });
    if (!campaign) return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    if (campaign.status === 'sent') {
      return NextResponse.json({ success: false, error: 'Campaign already sent' }, { status: 409 });
    }

    // Resolve recipients — fetch all active customers with contact info
    const candidates = await prisma.customer.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(campaign.channel === 'email'
          ? { email: { not: null, notIn: [''] } }
          : { phone: { not: null, notIn: [''] } }),
      },
      select: { id: true, email: true, phone: true, lastPurchaseDate: true, loyaltyPointsBalance: true, totalSpent: true },
    });

    // Real order counts per customer — must match the same logic /api/crm/segments
    // uses, so who actually receives a segment's campaign matches who the admin
    // saw in that segment when composing it.
    const orderStats = await prisma.transaction.groupBy({
      by: ['customerId'],
      where: { tenantId, status: 'completed' },
      _count: { _all: true },
    });
    const orderCountMap = new Map<string, number>(
      orderStats.filter((s) => s.customerId != null).map((s) => [s.customerId as string, s._count._all])
    );

    const recipients = candidates.filter((c) => {
      const orderCount = orderCountMap.get(c.id) ?? 0;
      return matchesSegment(campaign.segment, { ...c, totalSpent: Number(c.totalSpent) }, orderCount);
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
            ? sendEmail({ to: recipient.email as string, subject: campaign.subject ?? undefined, message: campaign.body, type: 'email' })
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

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: sentCount > 0 ? 'sent' : 'failed',
        sentCount,
        sentAt: new Date(),
      },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'campaign',
      entityId: campaign.id,
      changes: { action: 'send', sentCount, failedCount, channel: updatedCampaign.channel, segment: updatedCampaign.segment },
    });

    return NextResponse.json({
      success: true,
      data: { sentCount, failedCount, channel: updatedCampaign.channel, segment: updatedCampaign.segment },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to send campaign');
  }
}
