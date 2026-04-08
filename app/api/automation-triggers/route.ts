import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AutomationTrigger from '@/models/AutomationTrigger';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const triggers = await AutomationTrigger.find({ tenantId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: triggers });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list triggers');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    const userId = user.userId;
    const body = await request.json();
    const { name, event, conditions, action } = body;

    if (!name?.trim() || !event || !action?.channel || !action?.message) {
      return NextResponse.json(
        { success: false, error: 'name, event, action.channel, and action.message are required' },
        { status: 400 }
      );
    }

    const trigger = await AutomationTrigger.create({
      tenantId,
      name: name.trim(),
      event,
      conditions: conditions || {},
      action,
      createdBy: userId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'automation_trigger',
      entityId: trigger._id.toString(),
      metadata: { name, event },
    });

    return NextResponse.json({ success: true, data: trigger }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to create trigger');
  }
}
