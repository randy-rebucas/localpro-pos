import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { createShopifyFulfillment } from '@/lib/ecommerce/shopify-fulfillment';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'admin', 'manager'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`shopify-fulfill:${user.tenantId}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    await requireEcommerceIntegrationFeature(user.tenantId);

    const { orderId } = await params;
    const body = await request.json().catch(() => ({}));
    const { trackingNumber, trackingCompany } = body as { trackingNumber?: string; trackingCompany?: string };

    await connectDB();

    const integration = await TenantEcommerceIntegration.findOne({
      tenantId: user.tenantId,
      provider: 'shopify',
      isActive: true,
    });
    if (!integration?.shopDomain) {
      return NextResponse.json({ success: false, error: 'No active Shopify integration' }, { status: 400 });
    }

    const accessToken = await getShopifyAccessTokenForIntegration(integration);
    const { fulfillmentId } = await createShopifyFulfillment(
      integration.shopDomain,
      accessToken,
      orderId,
      trackingNumber,
      trackingCompany
    );

    // Record fulfillment on local transaction if it exists
    await Transaction.updateOne(
      { tenantId: user.tenantId, externalOrderId: orderId, salesChannel: 'shopify' },
      { $set: { shopifyFulfilledAt: new Date(), shopifyFulfillmentId: fulfillmentId } }
    );

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'shopify_order',
      entityId: orderId,
      changes: { fulfillmentId, trackingNumber, trackingCompany },
    });

    return NextResponse.json({ success: true, data: { fulfillmentId } });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fulfill Shopify order');
  }
}
