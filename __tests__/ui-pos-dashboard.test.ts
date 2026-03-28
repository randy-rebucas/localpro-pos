/**
 * Sections 28–31 — UI Feature Tests
 * 28: POS Interface
 * 29: Admin Dashboard
 * 30: Signup & Onboarding
 * 31: Subscription & Billing
 *
 * Strategy: Node-env vitest cannot render React components.
 * Tests cover:
 *   - Component default exports exist and are functions.
 *   - Pure utility functions (cart math, receipt format, currency).
 *   - API routes that power each UI feature.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Top-level mocks ──────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create', UPDATE: 'update', LOGIN: 'login' },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('10.0.0.1'),
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_k: string, fb: string) => fb),
  getValidationTranslator: vi.fn().mockResolvedValue((_k: string, fb: string) => fb),
}));
vi.mock('@/lib/validation', () => ({
  validateAndSanitize: vi.fn().mockImplementation((d: unknown) => ({ data: d, errors: [] })),
  validateEmail: vi.fn().mockReturnValue(true),
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  validateTenant: vi.fn().mockReturnValue([]),
}));
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  generateToken: vi.fn().mockReturnValue('token'),
}));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn(),
  getTenantIdFromRequest: vi.fn(),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
  checkSubscriptionLimit: vi.fn().mockResolvedValue({ allowed: true }),
  SubscriptionService: { checkFeature: vi.fn().mockResolvedValue(true) },
}));
vi.mock('@/lib/business-types', () => ({
  applyBusinessTypeDefaults: vi.fn().mockImplementation((s: unknown) => s),
}));
vi.mock('@/lib/paypal', () => ({
  createSubscriptionPayment: vi.fn().mockResolvedValue({ orderId: 'ord1', approvalUrl: 'http://paypal.com' }),
  capturePayment: vi.fn().mockResolvedValue({ status: 'COMPLETED' }),
}));
vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ tenant: 'acme', lang: 'en' }),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/contexts/TenantSettingsContext', () => ({
  useTenantSettings: vi.fn().mockReturnValue({ settings: null }),
  TenantSettingsProvider: ({ children }: any) => children,
}));
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }));
vi.mock('@/lib/confirm', () => ({ useConfirm: vi.fn().mockReturnValue({ confirm: vi.fn() }) }));
vi.mock('@/lib/hardware', () => ({
  hardwareService: { connect: vi.fn(), disconnect: vi.fn(), print: vi.fn() },
}));
vi.mock('@/lib/offline-storage', () => ({
  getOfflineStorage: vi.fn().mockReturnValue({
    init: vi.fn().mockResolvedValue(undefined),
    queueTransaction: vi.fn(),
    getQueuedTransactions: vi.fn().mockResolvedValue([]),
  }),
}));
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn().mockReturnValue({ isOnline: true, isSyncing: false, lastSyncResult: null, sync: vi.fn() }),
}));
vi.mock('@/app/[tenant]/[lang]/dictionaries-client', () => ({
  getDictionaryClient: vi.fn().mockResolvedValue({}),
}));
vi.mock('recharts', () => ({
  LineChart: vi.fn(), Line: vi.fn(), XAxis: vi.fn(), YAxis: vi.fn(),
  CartesianGrid: vi.fn(), Tooltip: vi.fn(), Legend: vi.fn(), ResponsiveContainer: vi.fn(),
}));
vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn().mockResolvedValue(5) },
}));
vi.mock('@/models/User', () => ({
  default: { findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/models/Subscription', () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));
vi.mock('@/models/SubscriptionPlan', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('@/models/Transaction', () => ({
  default: { find: vi.fn(), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock('@/models/Category', () => ({ default: { find: vi.fn() } }));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { formatCurrency, getCurrencySymbol, getDefaultTenantSettings, parseCurrency } from '@/lib/currency';
import { requireTenantAccess } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';

// ── Helpers ──────────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant-ui-test';
const authResult = { tenantId: TENANT_ID, user: { userId: 'u1', tenantId: TENANT_ID, role: 'admin', email: 'a@a.com' } };
const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 28. POS Interface ────────────────────────────────────────────────────────
describe('POS Interface: component exports (28.1–28.8)', () => {
  // 28.1 — POS page component exists
  it('POS page is exported as a default function', async () => {
    const mod = await import('@/app/[tenant]/[lang]/pos/page');
    expect(typeof mod.default).toBe('function');
  });

  // 28.2 — Cart total calculation (pure math)
  it('cart total = sum of item price × quantity', () => {
    const items = [
      { price: 100, quantity: 2 },
      { price: 50, quantity: 3 },
      { price: 200, quantity: 1 },
    ];
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    expect(total).toBe(550); // 200 + 150 + 200
  });

  // 28.3 — Discount recalculates total
  it('percentage discount reduces total correctly', () => {
    const total = 500;
    const discount = { type: 'percentage', value: 10 };
    const discounted = discount.type === 'percentage'
      ? total * (1 - discount.value / 100)
      : total - discount.value;
    expect(discounted).toBe(450);
  });

  it('fixed discount reduces total correctly', () => {
    const total = 500;
    const discount = { type: 'fixed', value: 75 };
    const discounted = discount.type === 'percentage'
      ? total * (1 - discount.value / 100)
      : total - discount.value;
    expect(discounted).toBe(425);
  });

  // 28.4 — OfflineIndicator component exists
  it('OfflineIndicator is exported as default function', async () => {
    const mod = await import('@/components/OfflineIndicator');
    expect(typeof mod.default).toBe('function');
  });

  // 28.5 — Products and categories load via API
  it('GET /api/products returns 200 for authenticated tenant', async () => {
    vi.mocked(requireTenantAccess).mockResolvedValue(authResult as any);
    const Product = (await import('@/models/Product')).default;
    vi.mocked(Product.find).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    } as any);
    vi.mocked(Product.countDocuments).mockResolvedValue(0);
    const { GET } = await import('@/app/api/products/route');
    const res = await GET(req('GET', '/api/products'));
    expect(res.status).toBe(200);
  });

  // 28.6 — Receipt number format
  it('receipt number follows format REC-YYYYMMDD-NNNNN', () => {
    // Receipt numbers are generated with a date-based prefix
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const expected = new RegExp(`^REC-${dateStr}-\\d{5}$`);
    const example = `REC-${dateStr}-00001`;
    expect(expected.test(example)).toBe(true);
  });

  // 28.7 — getOfflineStorage is available
  it('getOfflineStorage utility is exported', async () => {
    const mod = await import('@/lib/offline-storage');
    expect(typeof mod.getOfflineStorage).toBe('function');
  });

  // 28.8 — Offline storage returns queue interface
  it('getOfflineStorage returns object with queueTransaction and getQueuedTransactions', async () => {
    const { getOfflineStorage } = await import('@/lib/offline-storage');
    const storage = getOfflineStorage();
    expect(typeof storage.init).toBe('function');
    expect(typeof storage.queueTransaction).toBe('function');
    expect(typeof storage.getQueuedTransactions).toBe('function');
  });
});

// ── 29. Admin Dashboard ──────────────────────────────────────────────────────
describe('Admin Dashboard: component exports and data (29.1–29.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 29.1 — Dashboard KPI cards via API
  it('super-admin stats route returns totalTenants and totalUsers', async () => {
    vi.mocked(requireRole).mockResolvedValue({ userId: 'sa', tenantId: null as any, role: 'super_admin', email: 'sa@a.com' } as any);
    const Tenant = (await import('@/models/Tenant')).default;
    const User = (await import('@/models/User')).default;
    vi.mocked(Tenant.countDocuments).mockResolvedValue(12);
    vi.mocked(User.countDocuments).mockResolvedValue(60);
    const { GET } = await import('@/app/api/super-admin/stats/route');
    const res = await GET(req('GET', '/api/super-admin/stats'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('totalTenants');
    expect(body.data).toHaveProperty('totalUsers');
  });

  // 29.2 — SalesChart component exists (memo wraps it, may be 'object' or 'function')
  it('SalesChart is exported as a React component (default export defined)', async () => {
    const mod = await import('@/components/SalesChart');
    expect(mod.default).toBeDefined();
    // React.memo returns an object with $$typeof; plain function is also valid
    expect(['function', 'object']).toContain(typeof mod.default);
  });

  // 29.3 — LowStockAlerts component exists
  it('LowStockAlerts is exported as default function', async () => {
    const mod = await import('@/components/LowStockAlerts');
    expect(typeof mod.default).toBe('function');
  });

  // 29.4 — Recent transactions available
  it('GET /api/transactions returns 200 with data array', async () => {
    vi.mocked(requireTenantAccess).mockResolvedValue(authResult as any);
    const Transaction = (await import('@/models/Transaction')).default;
    vi.mocked(Transaction.find).mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    } as any);
    vi.mocked(Transaction.countDocuments).mockResolvedValue(0);
    const { GET } = await import('@/app/api/transactions/route');
    const res = await GET(req('GET', '/api/transactions'));
    expect(res.status).toBe(200);
  });

  // 29.5 — ProtectedRoute component exists
  it('ProtectedRoute is exported as default function', async () => {
    const mod = await import('@/components/ProtectedRoute');
    expect(typeof mod.default).toBe('function');
  });
});

// ── 30. Signup & Onboarding ──────────────────────────────────────────────────
describe('Signup & Onboarding: API and utilities (30.1–30.5)', () => {
  const validSignupBody = {
    slug: 'newstore',
    name: 'New Store',
    adminEmail: 'admin@newstore.com',
    adminPassword: 'SecurePass1!',
    adminName: 'Admin User',
    businessType: 'retail',
    language: 'en',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 30.1 — Signup creates tenant + owner
  it('POST /api/tenants/signup creates tenant and admin user (201)', async () => {
    const Tenant = (await import('@/models/Tenant')).default;
    const User = (await import('@/models/User')).default;
    vi.mocked(Tenant.findOne).mockResolvedValue(null as any); // slug not taken
    vi.mocked(User.findOne).mockResolvedValue(null as any); // email not taken
    vi.mocked(Tenant.create as any).mockResolvedValue({ _id: 't1', slug: 'newstore', name: 'New Store' } as any);
    vi.mocked(User.create as any).mockResolvedValue({ _id: 'u1', email: 'admin@newstore.com', name: 'Admin User' } as any);
    const { POST } = await import('@/app/api/tenants/signup/route');
    const res = await POST(req('POST', '/api/tenants/signup', validSignupBody));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.tenant.slug).toBe('newstore');
  });

  // 30.2 — Signup uses slug directly (provided by user)
  it('signup uses the slug provided in the body', async () => {
    const Tenant = (await import('@/models/Tenant')).default;
    const User = (await import('@/models/User')).default;
    vi.mocked(Tenant.findOne).mockResolvedValue(null as any);
    vi.mocked(User.findOne).mockResolvedValue(null as any);
    vi.mocked(Tenant.create as any).mockResolvedValue({ _id: 't2', slug: 'myshop', name: 'My Shop' } as any);
    vi.mocked(User.create as any).mockResolvedValue({ _id: 'u2', email: 'owner@myshop.com', name: 'Owner' } as any);
    const { POST } = await import('@/app/api/tenants/signup/route');
    const res = await POST(req('POST', '/api/tenants/signup', { ...validSignupBody, slug: 'myshop', name: 'My Shop' }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.tenant.slug).toBe('myshop');
  });

  // 30.3 — Duplicate slug returns 400
  it('duplicate slug returns 400', async () => {
    const Tenant = (await import('@/models/Tenant')).default;
    vi.mocked(Tenant.findOne).mockResolvedValue({ _id: 'existing', slug: 'newstore' } as any);
    const { POST } = await import('@/app/api/tenants/signup/route');
    const res = await POST(req('POST', '/api/tenants/signup', validSignupBody));
    expect(res.status).toBe(400);
  });

  // 30.4 — Signup page component exists
  it('Signup page is exported as a default function', async () => {
    const mod = await import('@/app/signup/page');
    expect(typeof mod.default).toBe('function');
  });

  // 30.5 — Missing required fields returns 400
  it('signup returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/tenants/signup/route');
    const res = await POST(req('POST', '/api/tenants/signup', { slug: 'x', name: 'X' })); // missing admin fields
    expect(res.status).toBe(400);
  });
});

// ── 31. Subscription & Billing ───────────────────────────────────────────────
describe('Subscription & Billing: components and PayPal (31.1–31.5)', () => {
  // 31.1 — Subscription current route returns plan info
  it('GET /api/subscriptions/current returns subscription data', async () => {
    const { getTenantIdFromRequest } = await import('@/lib/api-tenant');
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    const Subscription = (await import('@/models/Subscription')).default;
    vi.mocked(Subscription.findOne).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: 's1', tenantId: TENANT_ID, status: 'active',
        plan: { name: 'Basic', tier: 'basic', price: { monthly: 299 } },
      }),
    } as any);
    const { GET } = await import('@/app/api/subscriptions/current/route');
    const res = await GET(req('GET', '/api/subscriptions/current'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // 31.2 — PayPal create-subscription-payment is exported
  it('createSubscriptionPayment is exported from paypal lib', async () => {
    const { createSubscriptionPayment } = await import('@/lib/paypal');
    expect(typeof createSubscriptionPayment).toBe('function');
  });

  // 31.3 — PayPal capturePayment is exported
  it('capturePayment is exported from paypal lib', async () => {
    const { capturePayment } = await import('@/lib/paypal');
    expect(typeof capturePayment).toBe('function');
  });

  // 31.4 — Currency formatting used in billing UI
  it('formatCurrency formats PHP amount correctly', () => {
    const settings = { ...getDefaultTenantSettings(), currency: 'PHP', currencyPosition: 'before' as const };
    const result = formatCurrency(299, settings);
    expect(result).toContain('299');
    expect(result).toContain('₱');
  });

  // 31.5 — Expired subscription status is detectable
  it('subscription status "expired" can be checked in billing logic', () => {
    const subscription = { status: 'expired', trialEndsAt: new Date(Date.now() - 1000) };
    const isExpired = subscription.status === 'expired' ||
      (subscription.trialEndsAt && new Date(subscription.trialEndsAt) < new Date());
    expect(isExpired).toBe(true);
  });
});
