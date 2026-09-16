import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { generateReceiptNumber } from '@/lib/receipt';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

interface ManualItem {
  name: string;
  price: number;
  quantity: number;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);

    let tenantId: string;
    try {
      tenantId = (await getTenantIdFromRequest(request)) as string;
      if (!tenantId) throw new Error('Tenant not found');
      const user = await requireAuth(request);
      if (!(await hasTenantPermission(user.role, tenantId, 'transactions.create_manual'))) {
        throw new Error('Forbidden: Insufficient permissions');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Unauthorized')) {
        return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
      }
      if (msg.includes('Forbidden')) {
        return NextResponse.json({ success: false, error: t('validation.forbidden', msg) }, { status: 403 });
      }
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 400 });
    }

    const rl = checkRateLimit(`transactions:manual:${tenantId}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const { items, paymentMethod, cashReceived, notes, idempotencyKey }: {
      items: ManualItem[];
      paymentMethod: string;
      cashReceived?: number;
      notes?: string;
      idempotencyKey?: string;
    } = body;

    // Dedupe a client retry/double-submit of the same manual entry — the
    // "Add" button is disabled while the first request is in flight, but a
    // network retry after a dropped response could otherwise create a
    // second identical transaction.
    if (idempotencyKey) {
      const existing = await Transaction.findOne({ tenantId, idempotencyKey }).lean();
      if (existing) {
        return NextResponse.json({ success: true, data: existing }, { status: 200 });
      }
    }

    // Validate
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: t('validation.atLeastOneItemRequired', 'At least one item is required') }, { status: 400 });
    }
    for (const item of items) {
      if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
        return NextResponse.json({ success: false, error: t('validation.itemNameRequired', 'Each item must have a name') }, { status: 400 });
      }
      if (typeof item.price !== 'number' || item.price < 0) {
        return NextResponse.json({ success: false, error: t('validation.invalidItemPrice', `Invalid price for item: ${item.name}`) }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1 || !Number.isInteger(item.quantity)) {
        return NextResponse.json({ success: false, error: t('validation.invalidItemQuantity', `Invalid quantity for item: ${item.name}`) }, { status: 400 });
      }
    }

    const validPaymentMethods = ['cash', 'card', 'digital'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json({ success: false, error: t('validation.invalidPaymentMethod', 'Invalid payment method') }, { status: 400 });
    }

    // Build transaction items (no product ref for manual)
    const transactionItems = items.map((item) => ({
      name: item.name.trim(),
      price: item.price,
      quantity: item.quantity,
      subtotal: parseFloat((item.price * item.quantity).toFixed(2)),
    }));

    const subtotal = transactionItems.reduce((sum, i) => sum + i.subtotal, 0);
    const total = parseFloat(subtotal.toFixed(2));

    let change = 0;
    if (paymentMethod === 'cash' && cashReceived != null) {
      change = parseFloat(Math.max(0, cashReceived - total).toFixed(2));
    }

    let receiptNumber: string | undefined;
    try {
      receiptNumber = await generateReceiptNumber(tenantId);
    } catch {
      // non-fatal
    }

    let transaction;
    try {
      transaction = await Transaction.create({
        tenantId,
        items: transactionItems,
        subtotal: total,
        total,
        paymentMethod,
        ...(paymentMethod === 'cash' && cashReceived != null ? { cashReceived, change } : {}),
        status: 'completed',
        notes: notes?.trim() || undefined,
        ...(receiptNumber ? { receiptNumber } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
    } catch (createErr: unknown) {
      // A concurrent duplicate request raced us and created it first — return
      // that one instead of surfacing a spurious failure.
      if (idempotencyKey && createErr instanceof Error && 'code' in createErr && (createErr as { code?: number }).code === 11000) {
        const existing = await Transaction.findOne({ tenantId, idempotencyKey }).lean();
        if (existing) {
          return NextResponse.json({ success: true, data: existing }, { status: 200 });
        }
      }
      throw createErr;
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.TRANSACTION_CREATE,
      entityType: 'transaction',
      entityId: transaction._id.toString(),
      changes: { receiptNumber: transaction.receiptNumber, total, itemsCount: transactionItems.length },
    });

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error) {
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : undefined;
    return NextResponse.json({ success: false, error: message || t('validation.internalServerError', 'Internal server error') }, { status: 500 });
  }
}
