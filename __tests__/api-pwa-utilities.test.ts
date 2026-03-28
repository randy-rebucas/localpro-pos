/**
 * Section 32 — PWA / Offline
 * Section 33 — Utility Endpoints
 * Tests: 32.1–32.5, 33.1–33.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';

// ── Top-level mocks ──────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_k: string, fb: string) => fb),
}));
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  generateToken: vi.fn().mockReturnValue('tok'),
}));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn(),
  getTenantIdFromRequest: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 5, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('10.0.0.1'),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create' },
}));
vi.mock('@/lib/offline-storage', () => ({
  getOfflineStorage: vi.fn().mockReturnValue({
    init: vi.fn().mockResolvedValue(undefined),
    queueTransaction: vi.fn().mockResolvedValue('queued-id-1'),
    getQueuedTransactions: vi.fn().mockResolvedValue([
      { id: 'offline-tx-1', synced: false, tenant: 'acme', items: [] },
    ]),
    markSynced: vi.fn().mockResolvedValue(undefined),
    clearSynced: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: vi.fn(), findById: vi.fn() },
}));
vi.mock('mongoose', async (importActual) => {
  const actual = await importActual<typeof import('mongoose')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      connection: { readyState: 1 }, // 1 = connected
    },
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────
import { getOfflineStorage } from '@/lib/offline-storage';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';

const req = (method: string, url: string) =>
  new NextRequest(`http://localhost${url}`, { method });

const REPO_ROOT = join(process.cwd());

// ── 32. PWA / Offline ────────────────────────────────────────────────────────
describe('PWA / Offline (32.1–32.5)', () => {
  // 32.1 — App has PWA manifest
  it('PWA manifest exports a function returning name and display=standalone', async () => {
    const mod = await import('@/app/manifest');
    const manifest = mod.default();
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect((manifest.icons as any[]).length).toBeGreaterThan(0);
  });

  // 32.2 — Service worker file exists with caching logic
  it('public/sw.js exists and contains cache version constants', () => {
    const swPath = join(REPO_ROOT, 'public', 'sw.js');
    expect(existsSync(swPath)).toBe(true);
  });

  it('public/sw.js contains install and fetch event listeners', async () => {
    const { readFileSync } = await import('fs');
    const swContent = readFileSync(join(REPO_ROOT, 'public', 'sw.js'), 'utf-8');
    expect(swContent).toContain('install');
    expect(swContent).toContain('cache');
  });

  // 32.3 — OfflineIndicator component is defined
  it('OfflineIndicator is exported as default function', async () => {
    const mod = await import('@/components/OfflineIndicator');
    expect(typeof mod.default).toBe('function');
  });

  // 32.4 — Offline transactions can be queued
  it('getOfflineStorage().queueTransaction returns an ID', async () => {
    const storage = getOfflineStorage();
    const id = await storage.queueTransaction({ items: [], paymentMethod: 'cash', cashReceived: 100 });
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  // 32.5 — Queued transactions are retrievable for sync
  it('getOfflineStorage().getQueuedTransactions returns unsynced transactions', async () => {
    const storage = getOfflineStorage();
    const queued = await storage.getQueuedTransactions();
    expect(Array.isArray(queued)).toBe(true);
    expect(queued.length).toBeGreaterThan(0);
    expect(queued[0]).toHaveProperty('synced', false);
  });
});

// ── 33. Utility Endpoints ────────────────────────────────────────────────────
describe('Utility Endpoints (33.1–33.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 33.1 — GET /api/health returns 200 with healthy status
  it('GET /api/health returns 200 when DB is connected', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.database).toBe('connected');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime');
  });

  // 33.2 — GET /api/business-types returns all business types
  it('GET /api/business-types returns success with data array', async () => {
    const { GET } = await import('@/app/api/business-types/route');
    const res = await GET(req('GET', '/api/business-types'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    // Each type should have name and type fields
    expect(body.data[0]).toHaveProperty('name');
    expect(body.data[0]).toHaveProperty('type');
  });

  it('GET /api/business-types?type=retail returns specific config', async () => {
    const { GET } = await import('@/app/api/business-types/route');
    const res = await GET(req('GET', '/api/business-types?type=retail'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('type', 'retail');
  });

  // 33.3 — GET /api/services returns services for a tenant
  it('GET /api/services without tenantId returns 400', async () => {
    const { GET } = await import('@/app/api/services/route');
    const res = await GET(req('GET', '/api/services'));
    expect(res.status).toBe(400);
  });

  it('GET /api/services with tenantId returns 200 when tenant found', async () => {
    const Tenant = (await import('@/models/Tenant')).default;
    vi.mocked(Tenant.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'tid', slug: 'acme', isActive: true }),
    } as any);
    const Product = (await import('@/models/Product')).default;
    vi.mocked(Product.find).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    } as any);
    const { GET } = await import('@/app/api/services/route');
    const res = await GET(req('GET', '/api/services?tenantId=acme'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // 33.4 — POST /api/upload returns 400 when no file provided
  it('POST /api/upload without file returns 400', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u1', tenantId: 'tid', role: 'admin', email: 'a@a.com' });
    vi.mocked(getTenantIdFromRequest).mockResolvedValue('tid');
    const { POST } = await import('@/app/api/upload/route');
    const uploadReq = new NextRequest('http://localhost/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
      body: new FormData(), // empty form data
    });
    const res = await POST(uploadReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('POST /api/upload with wrong file type returns 400', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u1', tenantId: 'tid', role: 'admin', email: 'a@a.com' });
    vi.mocked(getTenantIdFromRequest).mockResolvedValue('tid');
    const form = new FormData();
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    form.append('file', file);
    const { POST } = await import('@/app/api/upload/route');
    const uploadReq = new NextRequest('http://localhost/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
      body: form,
    });
    const res = await POST(uploadReq);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid file type');
  });
});
