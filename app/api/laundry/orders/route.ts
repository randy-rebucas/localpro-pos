import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LaundryOrder from '@/models/LaundryOrder';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';

function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `LAU-${date}-${rand}`;
}

// GET /api/laundry/orders?tenant=xxx&status=inbasket&page=1&limit=50
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));

    const query: Record<string, unknown> = { tenantId, isActive: true };
    if (status) query.status = status;

    const [orders, total] = await Promise.all([
      LaundryOrder.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LaundryOrder.countDocuments(query),
    ]);

    // Status counts for tab badges
    const counts = await LaundryOrder.aggregate([
      { $match: { tenantId: { $exists: true }, isActive: true } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).catch(() => []);

    const statusCounts: Record<string, number> = {};
    for (const c of counts) statusCounts[c._id] = c.count;

    return NextResponse.json({ success: true, data: orders, total, statusCounts });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch laundry orders');
  }
}

// POST /api/laundry/orders
export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`laundry-order-${request.headers.get('x-forwarded-for') || 'anon'}`, 30, 60000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { tenantId } = await requireTenantAccess(request);
    await connectDB();

    const body = await request.json();
    const { customerName, customerPhone, items, readyBy, notes, paymentMethod, paymentStatus } = body;

    if (!customerName?.trim()) {
      return NextResponse.json({ success: false, error: 'Customer name is required' }, { status: 400 });
    }
    if (!items?.length) {
      return NextResponse.json({ success: false, error: 'At least one item is required' }, { status: 400 });
    }
    if (!readyBy) {
      return NextResponse.json({ success: false, error: 'Ready-by date is required' }, { status: 400 });
    }

    const subtotal: number = items.reduce((sum: number, item: { subtotal: number }) => sum + item.subtotal, 0);

    // Generate unique order number (retry on collision)
    let orderNumber = generateOrderNumber();
    let attempts = 0;
    while (await LaundryOrder.exists({ orderNumber }) && attempts++ < 5) {
      orderNumber = generateOrderNumber();
    }

    const order = await LaundryOrder.create({
      tenantId,
      orderNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() || undefined,
      items,
      subtotal,
      total: subtotal,
      status: 'inbasket',
      readyBy: new Date(readyBy),
      paymentMethod: paymentMethod || undefined,
      paymentStatus: paymentStatus || 'pending',
      notes: notes?.trim() || undefined,
    });

    await createAuditLog(request, {
      tenantId,
      action: 'CREATE',
      entityType: 'LaundryOrder',
      entityId: order._id.toString(),
      changes: { orderNumber: order.orderNumber, customerName: order.customerName },
    });

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create laundry order');
  }
}
