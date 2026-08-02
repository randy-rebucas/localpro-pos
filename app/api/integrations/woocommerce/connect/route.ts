import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { encryptCredentialsPayload } from '@/lib/ecommerce/crypto';
import { wooFetchJson, normalizeWooCommerceSiteUrl } from '@/lib/ecommerce/woocommerce-api';
import { registerWooCommerceWebhooks } from '@/lib/ecommerce/register-woo-webhooks';
import { getPublicAppUrl } from '@/lib/ecommerce/public-url';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { requireEcommerceProviderConnectAllowed } from '@/lib/ecommerce/tenant-integration-policy';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    if (!(await hasTenantPermission(user.role, tenantId, 'integrations.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    await requireEcommerceIntegrationFeature(tenantId);
    await requireEcommerceProviderConnectAllowed(tenantId, 'woocommerce');

    const rl = checkRateLimit(`woo-connect:${tenantId}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const siteUrl = typeof body.siteUrl === 'string' ? body.siteUrl : '';
    const consumerKey = typeof body.consumerKey === 'string' ? body.consumerKey : '';
    const consumerSecret = typeof body.consumerSecret === 'string' ? body.consumerSecret : '';
    if (!siteUrl || !consumerKey || !consumerSecret) {
      return NextResponse.json({ success: false, error: 'siteUrl, consumerKey, and consumerSecret are required' }, { status: 400 });
    }

    let normalized: string;
    try {
      normalized = normalizeWooCommerceSiteUrl(siteUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid site URL';
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    await wooFetchJson<unknown[]>(normalized, consumerKey, consumerSecret, '/products?per_page=1');

    const signingSecret = crypto.randomBytes(24).toString('hex');
    const credEnc = encryptCredentialsPayload({ consumerKey, consumerSecret });
    const whEnc = encryptCredentialsPayload({ secret: signingSecret });

    const integration = await prisma.tenantEcommerceIntegration.upsert({
      where: { tenantId_provider: { tenantId, provider: 'woocommerce' } },
      create: {
        tenantId,
        provider: 'woocommerce',
        siteUrl: normalized,
        credentialsEncrypted: credEnc,
        webhookSecretEncrypted: whEnc,
        isActive: true,
      },
      update: {
        siteUrl: normalized,
        credentialsEncrypted: credEnc,
        webhookSecretEncrypted: whEnc,
        isActive: true,
        lastError: null,
      },
    });

    try {
      await registerWooCommerceWebhooks(integration, signingSecret, {
        publicAppBaseUrl: getPublicAppUrl(request),
      });
    } catch {
      await prisma.tenantEcommerceIntegration.update({
        where: { id: integration.id },
        data: { lastError: 'webhook_registration_failed' },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Connection failed';
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : msg.includes('feature') ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
