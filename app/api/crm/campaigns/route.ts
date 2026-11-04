import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type Campaign, type CampaignSegment } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const campaigns = await getRepos().campaigns.list(tenantId, { limit: 50 });

    return NextResponse.json({ success: true, data: campaigns });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch campaigns');
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'crm.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
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

    // Created as a draft (the schema default)
    const campaign = await getRepos().campaigns.create(tenantId, {
      name: name.trim(),
      channel: channel as Campaign['channel'],
      segment: segment as CampaignSegment,
      subject: subject?.trim(),
      body: messageBody.trim(),
      createdBy: userId,
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
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
