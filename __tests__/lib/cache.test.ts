import { describe, it, expect, vi, afterEach } from 'vitest';
import { cacheGet, cacheSet, cacheDel, cacheDelPrefix, cacheWrap, cacheClear } from '@/lib/cache';

describe('lib/cache', () => {
  afterEach(() => {
    vi.useRealTimers();
    cacheClear();
  });

  it('returns a value until its TTL elapses', () => {
    vi.useFakeTimers();
    cacheSet('k', 1, 1000);
    expect(cacheGet('k')).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(cacheGet('k')).toBeUndefined();
  });

  it('cacheWrap calls the loader once and caches null results', async () => {
    const loader = vi.fn().mockResolvedValue(null);
    expect(await cacheWrap('miss', 1000, loader)).toBeNull();
    expect(await cacheWrap('miss', 1000, loader)).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('cacheWrap shares one in-flight load between concurrent callers', async () => {
    const loader = vi.fn().mockResolvedValue('v');
    const [a, b] = await Promise.all([cacheWrap('k', 1000, loader), cacheWrap('k', 1000, loader)]);
    expect(a).toBe('v');
    expect(b).toBe('v');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('cacheWrap does not cache a rejected load', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce('ok');
    await expect(cacheWrap('k', 1000, loader)).rejects.toThrow('db down');
    expect(await cacheWrap('k', 1000, loader)).toBe('ok');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('cacheDel and cacheDelPrefix invalidate entries', () => {
    cacheSet('tenant:slug:a', 1, 1000);
    cacheSet('tenant:id:a', 2, 1000);
    cacheSet('user:auth:u', 3, 1000);
    cacheDel('user:auth:u');
    expect(cacheGet('user:auth:u')).toBeUndefined();
    cacheDelPrefix('tenant:');
    expect(cacheGet('tenant:slug:a')).toBeUndefined();
    expect(cacheGet('tenant:id:a')).toBeUndefined();
  });
});
