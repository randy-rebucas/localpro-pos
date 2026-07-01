import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifyValidateGiftCard, shopifyDebitGiftCard } from '@/lib/ecommerce/shopify-gift-card';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(`shopify-gift-debit:${user.tenantId}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const { code, amount } = await request.json() as { code: string; amount: number };
    if (!code || !amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'code and positive amount required' }, { status: 400 });
    }

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

    // Validate first to ensure sufficient balance
    const card = await shopifyValidateGiftCard(integration.shopDomain, accessToken, code);
    if (card.balance < amount) {
      return NextResponse.json(
        { success: false, error: `Insufficient balance. Available: ${card.currency} ${card.balance.toFixed(2)}` },
        { status: 400 }
      );
    }

    const { newBalance } = await shopifyDebitGiftCard(integration.shopDomain, accessToken, card.id, amount);

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'shopify_gift_card',
      entityId: card.id,
      changes: { debitAmount: amount, newBalance },
    });

    logger.info('shopifyDebitGiftCard', { giftCardId: card.id, amount, newBalance });

    return NextResponse.json({ success: true, data: { giftCardId: card.id, newBalance, currency: card.currency } });
  } catch (error: unknown) {
    return handleApiError(error, 'Gift card debit failed');
  }
}
