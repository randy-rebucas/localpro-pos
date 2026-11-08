import { NextRequest, NextResponse } from 'next/server';
import { publicEcommerceError } from '@/lib/ecommerce/public-error';
import connectDB from '@/lib/mongodb';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import ProductChannelListing from '@/models/ProductChannelListing';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { checkRateLimit } from '@/lib/rate-limit';
import type { EcommerceProvider } from '@/lib/ecommerce/constants';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    if (!(await hasTenantPermission(user.role, tenantId, 'integrations.disconnect'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
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

    const listings = await ProductChannelListing.deleteMany({ tenantId, provider });
    const integrations = await TenantEcommerceIntegration.deleteMany({ tenantId, provider });

    // Destructive (drops every product-channel link for the provider) — record who did it.
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'ecommerce_integration',
      entityId: provider,
      changes: {
        provider,
        integrationsDeleted: integrations.deletedCount ?? 0,
        channelListingsDeleted: listings.deletedCount ?? 0,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: publicEcommerceError(msg, status, 'Disconnect failed') }, { status });
  }
}
