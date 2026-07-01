import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifyUpsertCustomer } from '@/lib/ecommerce/shopify-customer';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'admin', 'manager'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`shopify-customer-push:${user.tenantId}`, 30, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    await requireEcommerceIntegrationFeature(user.tenantId);

    const { customerId } = await request.json() as { customerId: string };
    if (!customerId) return NextResponse.json({ success: false, error: 'customerId required' }, { status: 400 });

    await connectDB();

    const [customer, integration] = await Promise.all([
      Customer.findOne({ _id: customerId, tenantId: user.tenantId }),
      TenantEcommerceIntegration.findOne({ tenantId: user.tenantId, provider: 'shopify', isActive: true }),
    ]);

    if (!customer) return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    if (!integration?.shopDomain) {
      return NextResponse.json({ success: false, error: 'No active Shopify integration' }, { status: 400 });
    }

    const accessToken = await getShopifyAccessTokenForIntegration(integration);
    const { shopifyCustomerId } = await shopifyUpsertCustomer(integration.shopDomain, accessToken, customer);

    if (!customer.shopifyCustomerId) {
      customer.shopifyCustomerId = shopifyCustomerId;
      await customer.save();
    }

    return NextResponse.json({ success: true, data: { shopifyCustomerId } });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to push customer to Shopify');
  }
}
