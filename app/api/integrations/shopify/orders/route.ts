import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifyAdminFetch } from '@/lib/ecommerce/shopify-api';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'admin', 'manager'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`shopify-orders:${user.tenantId}`, 30, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    await requireEcommerceIntegrationFeature(user.tenantId);
    await connectDB();

    const integration = await TenantEcommerceIntegration.findOne({
      tenantId: user.tenantId,
      provider: 'shopify',
      isActive: true,
    });
    if (!integration?.shopDomain) {
      return NextResponse.json({ success: false, error: 'No active Shopify integration' }, { status: 400 });
    }

    const sp = request.nextUrl.searchParams;
    const status = sp.get('status') || 'unfulfilled';
    const limit = Math.min(parseInt(sp.get('limit') || '20'), 50);
    const pageInfo = sp.get('page_info') || undefined;

    const accessToken = await getShopifyAccessTokenForIntegration(integration);

    const query: Record<string, string> = {
      financial_status: 'paid',
      fulfillment_status: status === 'all' ? 'any' : status,
      limit: String(limit),
      status: 'open',
    };
    if (pageInfo) query.page_info = pageInfo;

    const data = await shopifyAdminFetch<{ orders: unknown[] }>(
      integration.shopDomain,
      accessToken,
      '/orders.json',
      { query }
    );

    return NextResponse.json({ success: true, data: data.orders });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch Shopify orders');
  }
}
