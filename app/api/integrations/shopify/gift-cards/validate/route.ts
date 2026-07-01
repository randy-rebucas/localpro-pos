import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifyValidateGiftCard } from '@/lib/ecommerce/shopify-gift-card';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(`shopify-gift-validate:${user.tenantId}`, 30, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const code = request.nextUrl.searchParams.get('code');
    if (!code) return NextResponse.json({ success: false, error: 'code required' }, { status: 400 });

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

    const accessToken = await getShopifyAccessTokenForIntegration(integration);
    const card = await shopifyValidateGiftCard(integration.shopDomain, accessToken, code);

    return NextResponse.json({ success: true, data: card });
  } catch (error: unknown) {
    return handleApiError(error, 'Gift card validation failed');
  }
}
