import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import ProductChannelListing from '@/models/ProductChannelListing';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { checkRateLimit } from '@/lib/rate-limit';
import type { EcommerceProvider } from '@/lib/ecommerce/constants';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    await requireRole(request, ['admin', 'owner', 'super_admin']);
    await requireEcommerceIntegrationFeature(tenantId);

    const rl = checkRateLimit(`ecom-disconnect:${tenantId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const provider = body.provider as EcommerceProvider | undefined;
    if (provider !== 'shopify' && provider !== 'woocommerce') {
      return NextResponse.json({ success: false, error: 'Invalid provider' }, { status: 400 });
    }

    await ProductChannelListing.deleteMany({ tenantId, provider });
    await TenantEcommerceIntegration.deleteMany({ tenantId, provider });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
