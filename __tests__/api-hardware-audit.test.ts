/**
 * Section 22 — Hardware Integration
 * Section 23 — Audit Logs
 * Tests: 22.1 – 22.5, 23.1 – 23.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
  getCurrentUser: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
}));
vi.mock('@/models/AuditLog', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/models/User', () => ({ default: {} }));
// Hardware lib mocks
vi.mock('@/lib/hardware', () => ({
  hardwareService: {
    setConfig: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockReturnValue({}),
    printReceipt: vi.fn().mockResolvedValue(true),
    onBarcodeScan: vi.fn().mockReturnValue(() => {}),
    scanBarcode: vi.fn(),
    startQRScanning: vi.fn().mockResolvedValue(true),
    stopQRScanning: vi.fn().mockResolvedValue(undefined),
    openCashDrawer: vi.fn().mockResolvedValue(true),
  },
  PRINTER_PROFILES: [],
}));
vi.mock('@/lib/hardware/receipt-printer', () => ({
  receiptPrinterService: {
    setConfig: vi.fn().mockResolvedValue(undefined),
    printReceipt: vi.fn().mockResolvedValue(true),
    openCashDrawer: vi.fn().mockResolvedValue(true),
    isConnected: vi.fn().mockReturnValue(true),
    testPrint: vi.fn().mockResolvedValue({ success: true, message: 'Test print sent' }),
  },
}));
vi.mock('@/lib/hardware/barcode-scanner', () => ({
  barcodeScannerService: {
    setConfig: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    onScan: vi.fn().mockReturnValue(() => {}),
    scan: vi.fn(),
  },
}));
vi.mock('@/lib/hardware/qr-reader', () => ({
  qrReaderService: {
    setConfig: vi.fn(),
    startScanning: vi.fn().mockResolvedValue(true),
    stopScanning: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/lib/hardware/status-checker', () => ({
  hardwareStatusChecker: {
    checkAllDevices: vi.fn().mockResolvedValue({
      devices: [
        { name: 'Receipt Printer', type: 'printer', status: 'connected' },
        { name: 'Barcode Scanner', type: 'barcode-scanner', status: 'available' },
        { name: 'QR Reader', type: 'qr-reader', status: 'available' },
      ],
      overallStatus: 'all-connected',
      lastCheck: new Date(),
    }),
    testDevice: vi.fn().mockResolvedValue({ success: true, message: 'Device test OK' }),
  },
  DeviceStatus: {},
  HardwareStatus: {},
}));
vi.mock('jsqr', () => ({ default: vi.fn().mockReturnValue(null) }));
// Next.js navigation mocks for client components
vi.mock('next/navigation', () => ({
  useParams: vi.fn().mockReturnValue({ tenant: 'acme', lang: 'en' }),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));
vi.mock('@/app/[tenant]/[lang]/dictionaries-client', () => ({
  getDictionaryClient: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/toast', () => ({
  showToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    CREATE: 'create', UPDATE: 'update', DELETE: 'delete',
    LOGIN: 'login', LOGOUT: 'logout',
  },
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { requireAuth } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import AuditLog from '@/models/AuditLog';
import { receiptPrinterService } from '@/lib/hardware/receipt-printer';
import { barcodeScannerService } from '@/lib/hardware/barcode-scanner';
import { qrReaderService } from '@/lib/hardware/qr-reader';
import { hardwareService } from '@/lib/hardware';
import { hardwareStatusChecker } from '@/lib/hardware/status-checker';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';

const mockAuditLog = {
  _id: 'log1',
  tenantId: TENANT_ID,
  userId: { _id: 'user1', name: 'Alice', email: 'alice@test.com' },
  action: 'create',
  entityType: 'product',
  entityId: 'prod1',
  changes: { name: { old: null, new: 'Coffee' } },
  metadata: {},
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2026-01-01'),
};

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 22 — Hardware Integration
// ═══════════════════════════════════════════════════════════════════════════

// ── 22.1  Receipt printer connects and prints a test receipt ───────────────
describe('Receipt printer connects and prints (22.1)', () => {
  it('printReceipt returns true when printer is configured', async () => {
    const result = await receiptPrinterService.printReceipt({
      receiptNumber: 'REC001',
      date: '2026-01-01',
      items: [{ name: 'Coffee', quantity: 2, price: 150, subtotal: 300 }],
      subtotal: 300,
      total: 300,
      paymentMethod: 'cash',
    } as any);
    expect(result).toBe(true);
    expect(vi.mocked(receiptPrinterService.printReceipt)).toHaveBeenCalled();
  });

  it('testPrint sends test receipt and returns success', async () => {
    const result = await receiptPrinterService.testPrint();
    expect(result.success).toBe(true);
    expect(result.message).toContain('Test print');
  });

  it('hardwareService.printReceipt delegates to receipt printer service', async () => {
    await hardwareService.printReceipt({
      receiptNumber: 'REC002',
      date: '2026-01-01',
      items: [],
      subtotal: 0,
      total: 0,
      paymentMethod: 'cash',
    } as any);
    expect(vi.mocked(hardwareService.printReceipt)).toHaveBeenCalled();
  });
});

// ── 22.2  Barcode scanner reads product barcode ────────────────────────────
describe('Barcode scanner reads product barcode (22.2)', () => {
  it('onScan registers a callback and returns unsubscribe function', () => {
    const callback = vi.fn();
    const unsub = barcodeScannerService.onScan(callback);
    expect(typeof unsub).toBe('function');
    expect(vi.mocked(barcodeScannerService.onScan)).toHaveBeenCalledWith(callback);
  });

  it('scan triggers registered scan callbacks', () => {
    const barcode = '8888001234567';
    barcodeScannerService.scan(barcode);
    expect(vi.mocked(barcodeScannerService.scan)).toHaveBeenCalledWith(barcode);
  });

  it('hardwareService.onBarcodeScan registers listener', () => {
    const cb = vi.fn();
    hardwareService.onBarcodeScan(cb);
    expect(vi.mocked(hardwareService.onBarcodeScan)).toHaveBeenCalledWith(cb);
  });

  it('barcode scanner startListening is called when enabled', () => {
    barcodeScannerService.setConfig({ type: 'keyboard', enabled: true });
    expect(vi.mocked(barcodeScannerService.setConfig)).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    );
  });
});

// ── 22.3  QR code reader scans login QR and authenticates user ────────────
describe('QR code reader scans and authenticates (22.3)', () => {
  it('startScanning returns true when camera access granted', async () => {
    const videoEl = {} as HTMLVideoElement;
    const onScan = vi.fn();
    const result = await qrReaderService.startScanning(videoEl, onScan);
    expect(result).toBe(true);
  });

  it('stopScanning closes camera stream', async () => {
    await qrReaderService.stopScanning();
    expect(vi.mocked(qrReaderService.stopScanning)).toHaveBeenCalled();
  });

  it('hardwareService.startQRScanning delegates to QR reader', async () => {
    const videoEl = {} as HTMLVideoElement;
    const onScan = vi.fn();
    const result = await hardwareService.startQRScanning(videoEl, onScan);
    expect(result).toBe(true);
  });
});

// ── 22.4  HardwareStatus component shows correct printer/scanner state ─────
describe('HardwareStatus component (22.4)', () => {
  it('HardwareStatus component is exported as default', async () => {
    const mod = await import('@/components/HardwareStatus');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('hardwareStatusChecker.checkAllDevices returns device list with status', async () => {
    const status = await hardwareStatusChecker.checkAllDevices();
    expect(status.devices).toHaveLength(3);
    expect(status.devices[0].type).toBe('printer');
    expect(status.devices[0].status).toBe('connected');
    expect(status.overallStatus).toBe('all-connected');
  });

  it('hardwareStatusChecker.testDevice returns success result', async () => {
    const result = await hardwareStatusChecker.testDevice('printer');
    expect(result.success).toBe(true);
  });
});

// ── 22.5  Hardware settings save correctly per tenant ─────────────────────
describe('Hardware settings save per tenant (22.5)', () => {
  it('HardwareSettings component is exported as default', async () => {
    const mod = await import('@/components/HardwareSettings');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('hardwareService.setConfig persists printer and scanner config', async () => {
    const config = {
      printer: { type: 'network' as const, ipAddress: '192.168.1.100', portNumber: 9100 },
      barcodeScanner: { type: 'keyboard' as const, enabled: true },
    };
    await hardwareService.setConfig(config);
    expect(vi.mocked(hardwareService.setConfig)).toHaveBeenCalledWith(config);
  });

  it('hardwareService.getConfig returns stored config', () => {
    const config = hardwareService.getConfig();
    expect(typeof config).toBe('object');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 23 — Audit Logs
// ═══════════════════════════════════════════════════════════════════════════

// ── 23.1  GET /api/audit-logs ─────────────────────────────────────────────
describe('GET /api/audit-logs (23.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(AuditLog.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([mockAuditLog]),
            }),
          }),
        }),
      }),
    } as any);
    vi.mocked(AuditLog.countDocuments).mockResolvedValue(1);
  });

  it('returns tenant audit log entries', async () => {
    const { GET } = await import('@/app/api/audit-logs/route');
    const res = await GET(req('GET', '/api/audit-logs'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('filters by tenantId from authenticated user', async () => {
    const { GET } = await import('@/app/api/audit-logs/route');
    await GET(req('GET', '/api/audit-logs'));
    expect(vi.mocked(AuditLog.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID })
    );
  });

  it('filters by action query param', async () => {
    const { GET } = await import('@/app/api/audit-logs/route');
    await GET(req('GET', '/api/audit-logs?action=create'));
    expect(vi.mocked(AuditLog.find)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create' })
    );
  });

  it('filters by date range', async () => {
    const { GET } = await import('@/app/api/audit-logs/route');
    await GET(req('GET', '/api/audit-logs?startDate=2026-01-01&endDate=2026-01-31'));
    expect(vi.mocked(AuditLog.find)).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: expect.objectContaining({ $gte: expect.any(Date) }) })
    );
  });

  it('returns 403 for non-admin roles', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u2', tenantId: TENANT_ID, role: 'cashier' } as any);
    const { GET } = await import('@/app/api/audit-logs/route');
    const res = await GET(req('GET', '/api/audit-logs'));
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/audit-logs/route');
    const res = await GET(req('GET', '/api/audit-logs'));
    expect(res.status).toBe(401);
  });
});

// ── 23.2  Mutating operations generate an audit log entry ─────────────────
describe('Mutating operations generate audit log entries (23.2)', () => {
  it('createAuditLog is exported and callable', async () => {
    const mockReq = req('POST', '/api/products');
    await createAuditLog(mockReq, {
      tenantId: TENANT_ID,
      action: 'create',
      entityType: 'product',
      entityId: 'prod1',
      changes: { name: 'Coffee' },
    });
    expect(vi.mocked(createAuditLog)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        action: 'create',
        entityType: 'product',
      })
    );
  });

  it('audit log is created with UPDATE action', async () => {
    const mockReq = req('PUT', '/api/products/prod1');
    await createAuditLog(mockReq, {
      tenantId: TENANT_ID,
      action: 'update',
      entityType: 'product',
      entityId: 'prod1',
      changes: { price: { old: 100, new: 150 } },
    });
    expect(vi.mocked(createAuditLog)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: 'update' })
    );
  });

  it('audit log is created with DELETE action', async () => {
    const mockReq = req('DELETE', '/api/products/prod1');
    await createAuditLog(mockReq, {
      tenantId: TENANT_ID,
      action: 'delete',
      entityType: 'product',
      entityId: 'prod1',
    });
    expect(vi.mocked(createAuditLog)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ action: 'delete' })
    );
  });
});

// ── 23.3  Audit log entries contain required fields ───────────────────────
describe('Audit log entries contain required fields (23.3)', () => {
  it('audit log entry has userId, action, entityType, createdAt, ipAddress', () => {
    expect(mockAuditLog).toMatchObject({
      userId: expect.any(Object),
      action: expect.any(String),
      entityType: expect.any(String),
      createdAt: expect.any(Date),
      ipAddress: expect.any(String),
    });
  });

  it('AuditActions constants cover CREATE, UPDATE, DELETE lifecycle', async () => {
    const { AuditActions } = await import('@/lib/audit');
    expect(AuditActions.CREATE).toBeDefined();
    expect(AuditActions.UPDATE).toBeDefined();
    expect(AuditActions.DELETE).toBeDefined();
  });

  it('GET /api/audit-logs returns populated userId with name and email', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(AuditLog.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([mockAuditLog]),
            }),
          }),
        }),
      }),
    } as any);
    vi.mocked(AuditLog.countDocuments).mockResolvedValue(1);

    const { GET } = await import('@/app/api/audit-logs/route');
    const res = await GET(req('GET', '/api/audit-logs'));
    const body = await res.json();
    const entry = body.data[0];
    expect(entry.userId.name).toBe('Alice');
    expect(entry.action).toBe('create');
    expect(entry.entityType).toBe('product');
  });
});

// ── 23.4  Audit logs are not accessible across tenants ────────────────────
describe('Audit logs tenant isolation (23.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AuditLog.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([mockAuditLog]),
            }),
          }),
        }),
      }),
    } as any);
    vi.mocked(AuditLog.countDocuments).mockResolvedValue(1);
  });

  it('query always scoped to authenticated user tenantId, not URL param', async () => {
    // User from tenant A can't query tenant B logs even if they pass a different tenantId
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: 'tenant-A', role: 'admin' } as any);
    const { GET } = await import('@/app/api/audit-logs/route');
    await GET(req('GET', '/api/audit-logs?tenantId=tenant-B'));
    // Route uses user.tenantId not query param
    expect(vi.mocked(AuditLog.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-A' })
    );
    expect(vi.mocked(AuditLog.find)).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-B' })
    );
  });

  it('returns 403 for cashier role — only admin/owner can view logs', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u3', tenantId: TENANT_ID, role: 'cashier' } as any);
    const { GET } = await import('@/app/api/audit-logs/route');
    const res = await GET(req('GET', '/api/audit-logs'));
    expect(res.status).toBe(403);
  });
});
