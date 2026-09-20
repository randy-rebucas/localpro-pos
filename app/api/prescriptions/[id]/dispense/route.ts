import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { updateStock } from '@/lib/stock';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'prescriptions.dispense'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`dispense:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;

    const prescription = await prisma.prescription.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: true },
    });
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
      await prisma.prescription.update({ where: { id }, data: { status: 'expired' } });
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

    // Load tenant settings to check PDEA license for dangerous drugs
    const tenantSettings = await prisma.tenantSettings.findUnique({
      where: { tenantId: user.tenantId },
      select: { pdeaLicense: true },
    });

    // Validate per-item requirements
    for (const idx of itemIndexes) {
      const item = prescription.items[idx];
      if (item.productId) {
        const product = await prisma.product.findFirst({
          where: { id: item.productId, tenantId: user.tenantId },
          include: { pharmacyDetails: true },
        });
        if (!product) {
          return NextResponse.json(
            { success: false, error: `Product not found for item: ${item.drugName}` },
            { status: 404 }
          );
        }
        if (product.pharmacyDetails?.drugSchedule === 'dangerous') {
          if (!tenantSettings?.pdeaLicense) {
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

    // Atomic stock deduction using a Prisma transaction
    const now = new Date();
    const updatedPrescription = await dbTransaction(async (tx) => {
      for (const idx of itemIndexes) {
        const item = prescription.items[idx];
        if (item.productId) {
          await updateStock(
            item.productId,
            user.tenantId,
            -item.quantity,
            'sale',
            {
              userId: user.userId,
              reason: 'Prescription dispense',
              notes: `Prescription ${id}, item: ${item.drugName}`,
            },
            tx
          );
        }
        await tx.prescriptionItem.update({
          where: { id: item.id },
          data: { dispensed: true, dispensedAt: now, dispensedById: user.userId },
        });
      }

      const allDispensed = prescription.items.every((i, idx) =>
        itemIndexes.includes(idx) ? true : i.dispensed
      );

      return tx.prescription.update({
        where: { id },
        data: { status: allDispensed ? 'dispensed' : 'partially_dispensed' },
        include: { items: true },
      });
    });

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_DISPENSE,
      entityType: 'prescription',
      entityId: id,
      changes: { itemIndexes, dispensedBy: user.userId, status: updatedPrescription.status },
    });

    return NextResponse.json({ success: true, data: updatedPrescription });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to dispense prescription');
  }
}
