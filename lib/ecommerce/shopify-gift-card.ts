import { shopifyAdminFetch } from '@/lib/ecommerce/shopify-api';

interface ShopifyGiftCard {
  id: number;
  balance: string;
  currency: string;
  disabled_at: string | null;
}

export interface GiftCardInfo {
  id: string;
  balance: number;
  currency: string;
}

export async function shopifyValidateGiftCard(
  shopDomain: string,
  accessToken: string,
  code: string
): Promise<GiftCardInfo> {
  const data = await shopifyAdminFetch<{ gift_cards: ShopifyGiftCard[] }>(
    shopDomain,
    accessToken,
    '/gift_cards.json',
    { query: { code } }
  );

  const card = data.gift_cards?.[0];
  if (!card) throw new Error('Gift card not found');
  if (card.disabled_at) throw new Error('Gift card is disabled');

  return {
    id: String(card.id),
    balance: parseFloat(card.balance),
    currency: card.currency,
  };
}

export async function shopifyDebitGiftCard(
  shopDomain: string,
  accessToken: string,
  giftCardId: string,
  amount: number
): Promise<{ newBalance: number }> {
  const data = await shopifyAdminFetch<{ adjustment: { new_balance: string } }>(
    shopDomain,
    accessToken,
    `/gift_cards/${giftCardId}/adjustments.json`,
    {
      method: 'POST',
      body: JSON.stringify({
        adjustment: {
          amount: -Math.abs(amount),
          note: 'POS debit',
        },
      }),
    }
  );

  return { newBalance: parseFloat(data.adjustment.new_balance) };
}
