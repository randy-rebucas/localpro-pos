/**
 * Offline-first POS: idempotency-key wiring between the IndexedDB queue
 * (lib/offline-storage.ts) and the sync engine (lib/sync-service.ts) that
 * flushes queued sales to /api/transactions once connectivity returns.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Minimal in-memory fake of the small slice of IndexedDB that
// lib/offline-storage.ts actually uses (open/upgrade, one object store with
// an 'add', and a 'tenant' index whose getAll() returns matching records).
// Avoids pulling in a fake-indexeddb dependency for three simple stores.
function installFakeIndexedDB() {
  const stores: Record<string, Map<string, any>> = {
    transactions: new Map(),
    products: new Map(),
    discounts: new Map(),
  };

  class FakeRequest {
    onsuccess: ((ev: any) => void) | null = null;
    onerror: ((ev: any) => void) | null = null;
    result: any;
    private _resolve(result: any) {
      this.result = result;
      queueMicrotask(() => this.onsuccess?.({ target: this }));
    }
    static succeed(result: any) {
      const req = new FakeRequest();
      queueMicrotask(() => req._resolve(result));
      return req;
    }
  }

  function makeStore(name: string) {
    const map = stores[name];
    return {
      add: (record: any) => {
        map.set(record.id ?? record._id, record);
        return FakeRequest.succeed(record.id ?? record._id);
      },
      put: (record: any) => {
        map.set(record.id ?? record._id, record);
        return FakeRequest.succeed(record.id ?? record._id);
      },
      get: (key: string) => FakeRequest.succeed(map.get(key) ?? undefined),
      delete: (key: string) => {
        map.delete(key);
        return FakeRequest.succeed(undefined);
      },
      index: (_indexName: string) => ({
        getAll: (value: string) => {
          const all = Array.from(map.values()).filter((r) => r.tenant === value);
          return FakeRequest.succeed(all);
        },
        openKeyCursor: () => FakeRequest.succeed(null),
      }),
    };
  }

  const fakeDb = {
    objectStoreNames: { contains: (name: string) => name in stores },
    createObjectStore: (name: string) => ({
      createIndex: () => {},
    }),
    transaction: (_names: string[], _mode: string) => ({
      objectStore: (name: string) => makeStore(name),
    }),
  };

  (global as any).indexedDB = {
    open: () => {
      const req: any = new FakeRequest();
      queueMicrotask(() => {
        req.onupgradeneeded?.({ target: { result: fakeDb } });
        req.result = fakeDb;
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };

  return stores;
}

describe('offline sale queueing → sync idempotency', () => {
  let stores: Record<string, Map<string, any>>;

  beforeEach(() => {
    vi.resetModules();
    stores = installFakeIndexedDB();
  });

  afterEach(() => {
    delete (global as any).indexedDB;
  });

  it('generates a unique idempotencyKey per queued offline sale', async () => {
    const { getOfflineStorage } = await import('@/lib/offline-storage');
    const storage = await getOfflineStorage();

    const id1 = await storage.saveTransaction({
      tenant: 'acme',
      items: [{ productId: 'p1', quantity: 2 }],
      paymentMethod: 'cash',
      cashReceived: 100,
    });
    const id2 = await storage.saveTransaction({
      tenant: 'acme',
      items: [{ productId: 'p2', quantity: 1 }],
      paymentMethod: 'cash',
      cashReceived: 50,
    });

    const saved1 = stores.transactions.get(id1);
    const saved2 = stores.transactions.get(id2);

    expect(saved1.idempotencyKey).toBeTruthy();
    expect(saved2.idempotencyKey).toBeTruthy();
    expect(saved1.idempotencyKey).not.toBe(saved2.idempotencyKey);
    expect(saved1.synced).toBe(false);
  });

  it('sends the queued idempotencyKey when syncing to the server', async () => {
    const { getOfflineStorage } = await import('@/lib/offline-storage');
    const { syncService } = await import('@/lib/sync-service');

    const storage = await getOfflineStorage();
    const id = await storage.saveTransaction({
      tenant: 'acme',
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'cash',
      cashReceived: 20,
      customerId: 'cust_1',
      deviceId: 'device_1',
    });
    const queued = stores.transactions.get(id);

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ success: true, data: { id: 'txn_1' } }),
    });
    global.fetch = fetchMock as any;

    const result = await syncService.sync('acme');

    expect(result.synced).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body);

    expect(body.idempotencyKey).toBe(queued.idempotencyKey);
    expect(body.customerId).toBe('cust_1');
    expect(body.deviceId).toBe('device_1');

    // Marked synced in the local queue so it isn't replayed.
    expect(stores.transactions.get(id).synced).toBe(true);
  });

  it('does not send a duplicate idempotencyKey on a retried sync after a dropped response', async () => {
    const { getOfflineStorage } = await import('@/lib/offline-storage');
    const { syncService } = await import('@/lib/sync-service');

    const storage = await getOfflineStorage();
    await storage.saveTransaction({
      tenant: 'acme',
      items: [{ productId: 'p1', quantity: 1 }],
      paymentMethod: 'cash',
      cashReceived: 20,
    });

    // First attempt: network drops before a response is received.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      // Third attempt (within syncWithRetry's own backoff) succeeds — the
      // server's own idempotency pre-check (app/api/transactions/route.ts)
      // is what actually prevents a duplicate Transaction row server-side;
      // here we just assert the client replays the SAME key each attempt.
      .mockResolvedValueOnce({ status: 200, json: async () => ({ success: true, data: { id: 'txn_1' } }) });
    global.fetch = fetchMock as any;

    vi.useFakeTimers();
    try {
      const syncPromise = syncService.sync('acme');
      await vi.runAllTimersAsync();
      await syncPromise;
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const keysSent = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).idempotencyKey);
    expect(new Set(keysSent).size).toBe(1);
  });
});
