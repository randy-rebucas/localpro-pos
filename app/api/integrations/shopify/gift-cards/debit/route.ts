import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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

    const { code, amount, idempotencyKey } = await request.json() as { code: string; amount: number; idempotencyKey?: string };
    if (!code || !amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'code and positive amount required' }, { status: 400 });
    }

    // Idempotency: a caller-supplied key (preferred, e.g. the POS transaction id)
    // is blocked from re-debiting for 24h. Without one, fall back to a
    // code+amount dedupe within a short window to blunt accidental retries.
    const dedupeKey = idempotencyKey
      ? `shopify-gift-debit-key:${user.tenantId}:${idempotencyKey}`
      : `shopify-gift-debit-code:${user.tenantId}:${code}:${amount}`;
    const dedupeWindowMs = idempotencyKey ? 24 * 60 * 60 * 1000 : 15_000;
    const dedupe = checkRateLimit(dedupeKey, 1, dedupeWindowMs);
    if (!dedupe.allowed) {
      return NextResponse.json(
        { success: false, error: 'A debit for this gift card was already processed. Please check the card balance before retrying.' },
        { status: 409 }
      );
    }

    await requireEcommerceIntegrationFeature(user.tenantId);

    const integration = await prisma.tenantEcommerceIntegration.findFirst({
      where: { tenantId: user.tenantId, provider: 'shopify', isActive: true },
    });
    if (!integration?.shopDomain) {
      return NextResponse.json({ success: false, error: 'No active Shopify integration' }, { status: 400 });
    }

    // NOTE: lib/ecommerce/shopify-token.ts is still Mongoose-based (out of scope for this
    // migration pass) and expects a Mongoose document. Bridge the Prisma row into that
    // shape until that lib is migrated to Prisma.
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
