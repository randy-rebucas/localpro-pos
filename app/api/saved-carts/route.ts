import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SavedCart from '@/models/SavedCart';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    
    const savedCarts = await SavedCart.find({
      tenantId: tenantObjectId,
      userId: user.userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: savedCarts });
  } catch (error: any) {
    console.error('Error fetching saved carts:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, items, subtotal, discountCode, discountAmount, total } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Cart name is required' },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cart must contain at least one item' },
        { status: 400 }
      );
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !item.name || item.price === undefined || !item.quantity || item.stock === undefined) {
        return NextResponse.json(
          { success: false, error: 'Invalid cart item data' },
          { status: 400 }
        );
      }
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const savedCart = await SavedCart.create({
      tenantId: tenantObjectId,
      name: name.trim(),
      items: items.map((item: any) => ({
        productId: new mongoose.Types.ObjectId(item.productId),
        name: item.name,
        price: parseFloat(item.price),
        quantity: parseInt(item.quantity),
        stock: parseInt(item.stock),
      })),
      subtotal: parseFloat(subtotal) || 0,
      discountCode: discountCode?.trim().toUpperCase() || undefined,
      discountAmount: discountAmount ? parseFloat(discountAmount) : undefined,
      total: parseFloat(total) || 0,
      userId: user.userId,
    });

    return NextResponse.json({ success: true, data: savedCart }, { status: 201 });
  } catch (error: any) {
    console.error('Error saving cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

