import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { runCatalogSync } from '@/lib/ecommerce/sync-catalog';
import mongoose from 'mongoose';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { checkRateLimit } from '@/lib/rate-limit';
import type { EcommerceProvider } from '@/lib/ecommerce/constants';

export async function POST(request: NextRequest) {
  let syncTenantId: string | null = null;
  let syncProvider: EcommerceProvider | null = null;

  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    syncTenantId = tenantId;
    await requireRole(request, ['admin', 'manager', 'owner', 'super_admin']);
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

    const integration = await TenantEcommerceIntegration.findOne({
      tenantId,
      provider,
      isActive: true,
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
        await connectDB();
        await TenantEcommerceIntegration.updateOne(
          { tenantId: new mongoose.Types.ObjectId(syncTenantId), provider: syncProvider },
          { $set: { lastError: msg.slice(0, 500) } }
        );
      } catch {
        /* ignore */
      }
    }
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : msg.includes('feature') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
