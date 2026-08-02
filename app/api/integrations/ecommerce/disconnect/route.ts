import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { checkRateLimit } from '@/lib/rate-limit';
import type { EcommerceProvider } from '@/lib/ecommerce/constants';

export async function POST(request: NextRequest) {
  try {
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

    await prisma.productChannelListing.deleteMany({ where: { tenantId, provider } });
    await prisma.tenantEcommerceIntegration.deleteMany({ where: { tenantId, provider } });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
