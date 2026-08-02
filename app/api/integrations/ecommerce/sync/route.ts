import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { runCatalogSync } from '@/lib/ecommerce/sync-catalog';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { checkRateLimit } from '@/lib/rate-limit';
import type { EcommerceProvider } from '@/lib/ecommerce/constants';

export async function POST(request: NextRequest) {
  let syncTenantId: string | null = null;
  let syncProvider: EcommerceProvider | null = null;

  try {
    const { tenantId, user } = await requireTenantAccess(request);
    syncTenantId = tenantId;
    if (!(await hasTenantPermission(user.role, tenantId, 'integrations.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    await requireEcommerceIntegrationFeature(tenantId);

    const rl = checkRateLimit(`ecom-sync:${tenantId}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const provider = body.provider as EcommerceProvider | undefined;
    const autoCreateProducts = Boolean(body.autoCreateProducts);

    if (provider !== 'shopify' && provider !== 'woocommerce') {
      return NextResponse.json({ success: false, error: 'Invalid provider' }, { status: 400 });
    }
    syncProvider = provider;

    const integration = await prisma.tenantEcommerceIntegration.findFirst({
      where: { tenantId, provider, isActive: true },
    });
    if (!integration) {
      return NextResponse.json({ success: false, error: 'Integration not connected' }, { status: 404 });
    }

    const result = await runCatalogSync({ integration, autoCreateProducts });
    return NextResponse.json({ success: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Sync failed';
    if (syncTenantId && syncProvider) {
      try {
        await prisma.tenantEcommerceIntegration.updateMany({
          where: { tenantId: syncTenantId, provider: syncProvider },
          data: { lastError: msg.slice(0, 500) },
        });
      } catch {
        /* ignore */
      }
    }
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : msg.includes('feature') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
