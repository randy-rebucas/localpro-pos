import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SavedCart from '@/models/SavedCart';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import mongoose from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const savedCart = await SavedCart.findOne({
      _id: id,
      tenantId: tenantObjectId,
      userId: user.userId,
    }).lean();

    if (!savedCart) {
      return NextResponse.json({ success: false, error: 'Saved cart not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: savedCart });
  } catch (error: any) {
    console.error('Error fetching saved cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const savedCart = await SavedCart.findOneAndDelete({
      _id: id,
      tenantId: tenantObjectId,
      userId: user.userId,
    });

    if (!savedCart) {
      return NextResponse.json({ success: false, error: 'Saved cart not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Saved cart deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting saved cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

