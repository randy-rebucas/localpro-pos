import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant, { SubscriptionPlan } from '@/models/Tenant';
// If SUBSCRIPTION_PLANS is defined elsewhere, import it from the correct module.
// Otherwise, define it here or import the correct member (e.g., SubscriptionPlan).
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'; // Update this path as needed
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

// GET available plans
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  return NextResponse.json({ success: true, plans: SUBSCRIPTION_PLANS });
}

// PUT to change subscription plan
export async function PUT(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const { slug } = params;
    const body = await request.json();
    const { planKey } = body;
    const plan = SUBSCRIPTION_PLANS.find((p: any) => p.key === planKey);
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Invalid plan' }, { status: 400 });
    }
    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    // Update subscription fields
    tenant.subscription.plan = plan.key as SubscriptionPlan;
    tenant.subscription.price = plan.price;
    tenant.subscription.currency = plan.currency;
    tenant.subscription.features = plan.features;
    tenant.subscription.notes = plan.description;
    // Optionally update renewal/expiry
    await tenant.save();
    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes: { subscription: { new: plan.key } },
    });
    return NextResponse.json({ success: true, subscription: tenant.subscription });
  } catch (error: any) {
    return handleApiError(error);
  }
}
