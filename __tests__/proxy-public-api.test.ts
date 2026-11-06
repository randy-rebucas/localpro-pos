process.env.JWT_SECRET = 'test-secret-for-proxy-public-api-32chars!!';

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

const get = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));

describe('proxy public API allowlist', () => {
  it('lets anonymous visitors reach /api/public routes', async () => {
    const response = await get('/api/public/platform-stats');
    expect(response.status).not.toBe(401);
  });

  it('does not treat lookalike paths as public', async () => {
    const response = await get('/api/publicity');
    expect(response.status).toBe(401);
  });

  it('still requires a token for private routes', async () => {
    const response = await get('/api/products');
    expect(response.status).toBe(401);
  });
});

describe('proxy public pages', () => {
  it.each(['/pricing', '/about', '/contact'])('serves %s without a tenant redirect', (path) => {
    expect(get(path).headers.get('location')).toBeNull();
  });
});
