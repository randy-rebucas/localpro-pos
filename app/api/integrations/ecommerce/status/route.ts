import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { checkRateLimit } from '@/lib/rate-limit';
import { SubscriptionService } from '@/lib/subscription';
import { getTenantEcommerceIntegrationPolicy } from '@/lib/ecommerce/tenant-integration-policy';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    await requireRole(request, ['admin', 'manager', 'owner', 'super_admin']);

    const rl = checkRateLimit(`ecom-status:${tenantId}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const ecommerceFeatureUnlocked =
      process.env.NODE_ENV !== 'production' ||
      (await SubscriptionService.checkFeature(tenantId, 'customIntegrations'));

    const rows = await TenantEcommerceIntegration.find({ tenantId, isActive: true }).lean();
    const data = rows.map((r) => ({
      provider: r.provider,
      shopDomain: r.shopDomain || null,
      siteUrl: r.siteUrl || null,
      lastSyncAt: r.lastSyncAt || null,
      lastError: r.lastError || null,
      hasLocation: Boolean(r.shopifyLocationId),
    }));

    const ecommercePolicy = await getTenantEcommerceIntegrationPolicy(tenantId);

    return NextResponse.json({ success: true, data, ecommerceFeatureUnlocked, ecommercePolicy });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
