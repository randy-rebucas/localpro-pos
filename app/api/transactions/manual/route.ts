import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { generateReceiptNumber } from '@/lib/receipt';

interface ManualItem {
  name: string;
  price: number;
  quantity: number;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    let tenantId: string;
    try {
      tenantId = (await getTenantIdFromRequest(request)) as string;
      if (!tenantId) throw new Error('Tenant not found');
      await requireAuth(request);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : 400;
      return NextResponse.json({ success: false, error: msg || 'Unauthorized' }, { status });
    }

    const body = await request.json();
    const { items, paymentMethod, cashReceived, notes }: {
      items: ManualItem[];
      paymentMethod: string;
      cashReceived?: number;
      notes?: string;
    } = body;

    // Validate
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one item is required' }, { status: 400 });
    }
    for (const item of items) {
      if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
        return NextResponse.json({ success: false, error: 'Each item must have a name' }, { status: 400 });
      }
      if (typeof item.price !== 'number' || item.price < 0) {
        return NextResponse.json({ success: false, error: `Invalid price for item: ${item.name}` }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity < 1 || !Number.isInteger(item.quantity)) {
        return NextResponse.json({ success: false, error: `Invalid quantity for item: ${item.name}` }, { status: 400 });
      }
    }

    const validPaymentMethods = ['cash', 'card', 'digital'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json({ success: false, error: 'Invalid payment method' }, { status: 400 });
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

    const transaction = await Transaction.create({
      tenantId,
      items: transactionItems,
      subtotal: total,
      total,
      paymentMethod,
      ...(paymentMethod === 'cash' && cashReceived != null ? { cashReceived, change } : {}),
      status: 'completed',
      notes: notes?.trim() || undefined,
      ...(receiptNumber ? { receiptNumber } : {}),
    });

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
