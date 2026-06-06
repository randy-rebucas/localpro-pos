import type { Discount } from '@/hooks/useDiscount';

export async function applyPresetDiscountCode(
  code: 'SC20' | 'PWD20',
  tenant: string,
  subtotal: number,
  fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>
): Promise<{ success: true; discount: Discount } | { success: false; error: string }> {
  let res = await fetchWithTimeout(`/api/discounts/validate?tenant=${tenant}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotal }),
  });
  let data = await res.json();

  if (!data.success && res.status === 404) {
    await fetchWithTimeout('/api/discounts/seed-defaults', { method: 'POST', credentials: 'include' });
    res = await fetchWithTimeout(`/api/discounts/validate?tenant=${tenant}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal }),
    });
    data = await res.json();
  }

  if (data.success) {
    return {
      success: true,
      discount: { code: data.data.code, amount: data.data.discountAmount, name: data.data.name },
    };
  }
  return { success: false, error: data.error || 'Failed to apply discount' };
}

export function syncDiscountToCustomerDisplay(
  sessionId: string | null,
  tenant: string,
  discount: Discount,
  subtotal: number,
  settings?: { taxEnabled?: boolean; taxRate?: number }
): void {
  if (!sessionId) return;
  const afterDiscount = subtotal - discount.amount;
  const taxableBase = Math.max(0, afterDiscount);
  const taxAmount =
    settings?.taxEnabled && settings?.taxRate
      ? Math.round(taxableBase * (settings.taxRate / 100) * 100) / 100
      : 0;
  const total = afterDiscount + taxAmount;
  fetch(`/api/pos/session/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant,
      action: 'update-discount',
      data: { discount, taxAmount, total },
    }),
  }).catch((err) => console.error('Failed to sync discount:', err));
}
