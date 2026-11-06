import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRefund } from '@/hooks/useRefund';

const sale = {
  _id: 'tx-1',
  subtotal: 350,
  total: 350,
  items: [
    { product: 'prod-a', name: 'Item A', price: 100, quantity: 3 },
    { product: 'prod-b', name: 'Item B', price: 50, quantity: 1 },
  ],
};

const okResponse = () =>
  ({ ok: true, status: 201, json: vi.fn().mockResolvedValue({ success: true, data: {} }) }) as unknown as Response;

describe('useRefund', () => {
  function selectItems() {
    const { result } = renderHook(() => useRefund());
    act(() => {
      result.current.addRefundItem('prod-a', 3);
      result.current.addRefundItem('prod-b', 1);
    });
    act(() => {
      result.current.updateRefundQty('prod-a', 2, 3);
      result.current.updateRefundQty('prod-b', 0, 1);
    });
    return result;
  }

  it('posts to the transaction refund route, leaving out lines set to 0', async () => {
    const result = selectItems();
    const fetcher = vi.fn().mockResolvedValue(okResponse());

    let outcome: Awaited<ReturnType<typeof result.current.processRefund>> | undefined;
    await act(async () => {
      outcome = await result.current.processRefund(sale, fetcher);
    });

    expect(outcome?.success).toBe(true);
    expect(fetcher.mock.calls[0][0]).toBe('/api/transactions/tx-1/refund');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      items: [{ productId: 'prod-a', quantity: 2 }],
    });
  });

  it('calculates the amount from stored product ids', () => {
    const result = selectItems();

    expect(result.current.calculateRefundAmount(sale)).toBe(200);
  });

  it('includes tax in the amount, matching the server', () => {
    const result = selectItems();

    expect(result.current.calculateRefundAmount({ ...sale, total: 392 })).toBe(224);
  });

  it('works with the populated product objects the API returns', async () => {
    const populated = {
      ...sale,
      items: sale.items.map((item) => ({ ...item, product: { _id: item.product, name: item.name, sku: 'SKU' } })),
    };
    const result = selectItems();
    const fetcher = vi.fn().mockResolvedValue(okResponse());

    expect(result.current.calculateRefundAmount(populated)).toBe(200);
    await act(async () => {
      await result.current.processRefund(populated, fetcher);
    });

    expect(JSON.parse(fetcher.mock.calls[0][1].body).items).toEqual([{ productId: 'prod-a', quantity: 2 }]);
  });

  it('sends the line id for a manual line', async () => {
    const manual = { _id: 'tx-2', subtotal: 50, total: 50, items: [{ _id: 'line-1', name: 'Custom', price: 50, quantity: 1 }] };
    const { result } = renderHook(() => useRefund());
    act(() => result.current.addRefundItem('line-1', 1));
    const fetcher = vi.fn().mockResolvedValue(okResponse());

    expect(result.current.calculateRefundAmount(manual)).toBe(50);
    await act(async () => {
      await result.current.processRefund(manual, fetcher);
    });

    expect(JSON.parse(fetcher.mock.calls[0][1].body).items).toEqual([{ productId: 'line-1', quantity: 1 }]);
  });

  it('refuses when every line is set to 0', async () => {
    const { result } = renderHook(() => useRefund());
    act(() => result.current.addRefundItem('prod-a', 3));
    act(() => result.current.updateRefundQty('prod-a', 0, 3));
    const fetcher = vi.fn();

    let outcome: Awaited<ReturnType<typeof result.current.processRefund>> | undefined;
    await act(async () => {
      outcome = await result.current.processRefund(sale, fetcher);
    });

    expect(outcome?.errors).toContain('No items selected for refund');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('shows the server error when a refund is rejected', async () => {
    const result = selectItems();
    const rejected = {
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ success: false, error: 'Cannot refund more than purchased' }),
    } as unknown as Response;

    let outcome: Awaited<ReturnType<typeof result.current.processRefund>> | undefined;
    await act(async () => {
      outcome = await result.current.processRefund(sale, vi.fn().mockResolvedValue(rejected));
    });

    expect(outcome).toMatchObject({ success: false, error: 'Cannot refund more than purchased' });
  });
});
