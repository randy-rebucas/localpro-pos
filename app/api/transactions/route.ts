import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Product from '@/models/Product';
import { getTenantIdFromRequest } from '@/lib/api-tenant';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('items.product', 'name');

    const total = await Transaction.countDocuments({ tenantId });

    return NextResponse.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const body = await request.json();
    const { items, paymentMethod, cashReceived } = body;

    // Validate and process items
    const transactionItems = [];
    let total = 0;

    for (const item of items) {
      const product = await Product.findOne({ _id: item.productId, tenantId });
      if (!product) {
        return NextResponse.json({ success: false, error: `Product ${item.productId} not found` }, { status: 404 });
      }

      if (product.stock < item.quantity) {
        return NextResponse.json(
          { success: false, error: `Insufficient stock for ${product.name}. Available: ${product.stock}` },
          { status: 400 }
        );
      }

      const subtotal = product.price * item.quantity;
      total += subtotal;

      transactionItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal,
      });

      // Update product stock
      product.stock -= item.quantity;
      await product.save();
    }

    // Calculate change for cash payments
    let change = 0;
    if (paymentMethod === 'cash' && cashReceived) {
      change = cashReceived - total;
      if (change < 0) {
        return NextResponse.json({ success: false, error: 'Insufficient cash received' }, { status: 400 });
      }
    }

    const transaction = await Transaction.create({
      tenantId,
      items: transactionItems,
      total,
      paymentMethod,
      cashReceived: paymentMethod === 'cash' ? cashReceived : undefined,
      change: paymentMethod === 'cash' ? change : undefined,
      status: 'completed',
    });

    return NextResponse.json({ success: true, data: transaction }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

