import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Campaign from '@/models/Campaign';
import { requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const campaigns = await Campaign.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch campaigns');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    const userId = user.userId;

    const rl = checkRateLimit(`crm-campaign-${String(tenantId)}`, 20, 60000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body = await request.json();
    const { name, channel, segment, subject, body: messageBody } = body as Record<string, string>;

    if (!name?.trim()) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    if (!['email', 'sms'].includes(channel)) return NextResponse.json({ success: false, error: 'Invalid channel' }, { status: 400 });
    if (!['all', 'new', 'regular', 'vip', 'at_risk', 'lapsed'].includes(segment)) {
      return NextResponse.json({ success: false, error: 'Invalid segment' }, { status: 400 });
    }
    if (!messageBody?.trim()) return NextResponse.json({ success: false, error: 'Body is required' }, { status: 400 });
    if (channel === 'email' && !subject?.trim()) {
      return NextResponse.json({ success: false, error: 'Subject is required for email campaigns' }, { status: 400 });
    }

    const campaign = await Campaign.create({
      tenantId,
      name: name.trim(),
      channel,
      segment,
      subject: subject?.trim(),
      body: messageBody.trim(),
      status: 'draft',
      createdBy: userId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'campaign',
      entityId: String(campaign._id),
      changes: { name, channel, segment },
    });

    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create campaign');
  }
}
