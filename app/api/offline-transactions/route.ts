import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function toOfflineTransactionJSON(o: {
  id: string;
  subtotal: Prisma.Decimal;
  taxExemptAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  discountAmount: Prisma.Decimal | null;
  cashReceived: Prisma.Decimal | null;
  change: Prisma.Decimal | null;
  [key: string]: unknown;
}) {
  return {
    ...o,
    _id: o.id,
    subtotal: Number(o.subtotal),
    taxExemptAmount: Number(o.taxExemptAmount),
    taxAmount: Number(o.taxAmount),
    total: Number(o.total),
    discountAmount: o.discountAmount != null ? Number(o.discountAmount) : undefined,
    cashReceived: o.cashReceived != null ? Number(o.cashReceived) : undefined,
    change: o.change != null ? Number(o.change) : undefined,
  };
}

// GET: list queued offline transactions, optionally filtered by sync status
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:offline-transactions:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const syncStatus = searchParams.get('syncStatus');
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;

    const where: Prisma.OfflineTransactionWhereInput = { tenantId, isActive: true };
    if (syncStatus && ['pending', 'processing', 'synced', 'failed'].includes(syncStatus)) {
      where.syncStatus = syncStatus as Prisma.EnumOfflineSyncStatusFilter['equals'];
    }

    const [transactions, total] = await Promise.all([
      prisma.offlineTransaction.findMany({
        where,
        orderBy: { offlineCreatedAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.offlineTransaction.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: transactions.map(toOfflineTransactionJSON),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch offline transactions');
  }
}

// POST: queue a transaction that was captured while a device was offline.
// A background automation (lib/automations/offline-sync.ts) later converts
// pending rows into real Transaction records.
export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    if (!(await hasTenantPermission(user.role, tenantId, 'transactions.create_manual'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:offline-transactions:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();
    const {
      deviceId,
      branchId,
      items,
      subtotal,
      discountCode,
      discountCategory,
      discountAmount,
      taxExemptAmount = 0,
      taxAmount = 0,
      total,
      paymentMethod,
      cashReceived,
      change,
      customerId,
      offlineCreatedAt,
      notes,
    } = body;

    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json({ success: false, error: 'deviceId is required' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.itemsRequired', 'At least one item is required') },
        { status: 400 }
      );
    }
    if (subtotal === undefined || total === undefined || !paymentMethod) {
      return NextResponse.json(
        { success: false, error: t('validation.missingRequiredFields', 'Missing required fields') },
        { status: 400 }
      );
    }

    const offlineTransaction = await prisma.offlineTransaction.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: branchId || undefined,
        deviceId,
        subtotal,
        discountCode: discountCode || undefined,
        discountCategory: discountCategory || undefined,
        discountAmount: discountAmount ?? undefined,
        taxExemptAmount,
        taxAmount,
        total,
        paymentMethod,
        cashReceived: cashReceived ?? undefined,
        change: change ?? undefined,
        customerId: customerId || undefined,
        userId: user.userId,
        notes: notes || undefined,
        offlineCreatedAt: offlineCreatedAt ? new Date(offlineCreatedAt) : new Date(),
        syncStatus: 'pending',
        isActive: true,
        items: {
          create: items.map((item: { productId?: string; name: string; price: number; quantity: number; subtotal: number }) => ({
            id: randomUUID(),
            productId: item.productId || undefined,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.subtotal,
          })),
        },
      },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'offline_transaction',
      entityId: offlineTransaction.id,
      changes: { deviceId, total },
    });

    return NextResponse.json({ success: true, data: toOfflineTransactionJSON(offlineTransaction) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to queue offline transaction');
  }
}
