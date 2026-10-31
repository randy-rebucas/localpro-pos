import { describe, it, expect, vi, afterEach } from 'vitest';
import { TtlCache } from '@/lib/db-cache';

describe('TtlCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads once and serves cached values within the TTL', async () => {
    const cache = new TtlCache<number>(1_000);
    const loader = vi.fn().mockResolvedValue(42);

    expect(await cache.getOrLoad('k', loader)).toBe(42);
    expect(await cache.getOrLoad('k', loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('caches null/false results (negative caching)', async () => {
    const cache = new TtlCache<boolean | null>(1_000);
    const loader = vi.fn().mockResolvedValue(null);

    await cache.getOrLoad('k', loader);
    await cache.getOrLoad('k', loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads after the TTL expires', async () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>(1_000);
    const loader = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.getOrLoad('k', loader)).toBe(1);
    vi.advanceTimersByTime(1_001);
    expect(await cache.getOrLoad('k', loader)).toBe(2);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const cache = new TtlCache<number>(1_000);
    const loader = vi.fn().mockResolvedValue(7);

    const results = await Promise.all([cache.getOrLoad('k', loader), cache.getOrLoad('k', loader)]);
    expect(results).toEqual([7, 7]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not cache rejected loads', async () => {
    const cache = new TtlCache<number>(1_000);
    const loader = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(5);

    await expect(cache.getOrLoad('k', loader)).rejects.toThrow('db down');
    expect(await cache.getOrLoad('k', loader)).toBe(5);
  });

  it('does not cache a load that was invalidated while in flight', async () => {
    const cache = new TtlCache<number>(1_000);
    let resolveFirst!: (v: number) => void;
    const first = new Promise<number>((r) => { resolveFirst = r; });
    const loader = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(2);

    const pending = cache.getOrLoad('k', loader);
    cache.delete('k');
    resolveFirst(1);
    expect(await pending).toBe(1);
    expect(await cache.getOrLoad('k', loader)).toBe(2);
  });

  it('bypasses caching entirely when TTL is 0', async () => {
    const cache = new TtlCache<number>(0);
    const loader = vi.fn().mockResolvedValue(1);

    await cache.getOrLoad('k', loader);
    await cache.getOrLoad('k', loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry when full', () => {
    const cache = new TtlCache<number>(1_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });
});
