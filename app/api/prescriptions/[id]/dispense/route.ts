import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!['owner', 'admin', 'manager', 'cashier'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`dispense:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;
    await connectDB();

    const prescription = await Prescription.findOne({ _id: id, tenantId: user.tenantId });
    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    if (['dispensed', 'cancelled'].includes(prescription.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot dispense: prescription is ${prescription.status}` },
        { status: 409 }
      );
    }

    // Auto-expire check
    if (prescription.validUntil < new Date()) {
      prescription.status = 'expired';
      await prescription.save();
      return NextResponse.json(
        { success: false, error: 'Prescription has expired' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const itemIndexes: number[] = body.itemIndexes;

    if (!Array.isArray(itemIndexes) || itemIndexes.length === 0) {
      return NextResponse.json({ success: false, error: 'itemIndexes is required' }, { status: 400 });
    }

    // Validate indexes
    for (const idx of itemIndexes) {
      if (idx < 0 || idx >= prescription.items.length) {
        return NextResponse.json({ success: false, error: `Invalid item index: ${idx}` }, { status: 400 });
      }
      if (prescription.items[idx].dispensed) {
        return NextResponse.json(
          { success: false, error: `Item at index ${idx} is already dispensed` },
          { status: 409 }
        );
      }
    }

    // Load tenant to check PDEA license for dangerous drugs
    const tenant = await Tenant.findOne({ _id: user.tenantId }).lean();

    // Validate per-item requirements
    for (const idx of itemIndexes) {
      const item = prescription.items[idx];
      if (item.productId) {
        const product = await Product.findOne({ _id: item.productId, tenantId: user.tenantId }).lean();
        if (!product) {
          return NextResponse.json(
            { success: false, error: `Product not found for item: ${item.drugName}` },
            { status: 404 }
          );
        }
        if (product.drugSchedule === 'dangerous') {
          const pdeaLicense = tenant?.settings?.pharmacyCompliance?.pdeaLicense;
          if (!pdeaLicense) {
            return NextResponse.json(
              { success: false, error: `PDEA license is required to dispense dangerous drugs (${item.drugName})` },
              { status: 403 }
            );
          }
        }
        if (product.trackInventory && !product.allowOutOfStockSales && product.stock < item.quantity) {
          return NextResponse.json(
            { success: false, error: `Insufficient stock for ${item.drugName}` },
            { status: 409 }
          );
        }
      }
    }

    // Atomic stock deduction using MongoDB session
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const now = new Date();
      for (const idx of itemIndexes) {
        const item = prescription.items[idx];
        if (item.productId) {
          await Product.findOneAndUpdate(
            { _id: item.productId, tenantId: user.tenantId },
            { $inc: { stock: -item.quantity } },
            { session }
          );
        }
        prescription.items[idx].dispensed = true;
        prescription.items[idx].dispensedAt = now;
        prescription.items[idx].dispensedBy = new mongoose.Types.ObjectId(user.userId);
      }

      const allDispensed = prescription.items.every(i => i.dispensed);
      prescription.status = allDispensed ? 'dispensed' : 'partially_dispensed';
      await prescription.save({ session });
    });
    session.endSession();

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_DISPENSE,
      entityType: 'prescription',
      entityId: id,
      changes: { itemIndexes, dispensedBy: user.userId, status: prescription.status },
    });

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to dispense prescription');
  }
}
