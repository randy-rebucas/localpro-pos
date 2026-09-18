import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifyUpsertCustomer } from '@/lib/ecommerce/shopify-customer';
import type { ICustomer } from '@/models/Customer';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!(await hasTenantPermission(user.role, user.tenantId, 'integrations.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`shopify-customer-push:${user.tenantId}`, 30, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    await requireEcommerceIntegrationFeature(user.tenantId);

    const { customerId } = await request.json() as { customerId: string };
    if (!customerId) return NextResponse.json({ success: false, error: 'customerId required' }, { status: 400 });

    const [customer, integration] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, tenantId: user.tenantId } }),
      prisma.tenantEcommerceIntegration.findFirst({ where: { tenantId: user.tenantId, provider: 'shopify', isActive: true } }),
    ]);

    if (!customer) return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    if (!integration?.shopDomain) {
      return NextResponse.json({ success: false, error: 'No active Shopify integration' }, { status: 400 });
    }

    // NOTE: shopify-customer.ts is still Mongoose-based (out of scope for this
    // migration pass) and expects a Mongoose document. Bridge the Prisma customer
    // row into that shape until that lib is migrated to Prisma.
    // lib/ecommerce/shopify-token.ts is already Prisma-based — pass the row directly.
    const customerDoc = { ...customer, _id: customer.id } as unknown as ICustomer;

    const accessToken = await getShopifyAccessTokenForIntegration(integration);
    const { shopifyCustomerId } = await shopifyUpsertCustomer(integration.shopDomain, accessToken, customerDoc);

    if (!customer.shopifyCustomerId) {
      await prisma.customer.update({ where: { id: customer.id }, data: { shopifyCustomerId } });
    }

    return NextResponse.json({ success: true, data: { shopifyCustomerId } });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to push customer to Shopify');
  }
}
