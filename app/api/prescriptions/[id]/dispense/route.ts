import { NextRequest, NextResponse } from 'next/server';
import { getRepos, runInTransaction, type Prescription } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { updateStock, insertStockMovements, STOCK_SNAPSHOT_FIELDS, StockMovementInput, StockProductSnapshot } from '@/lib/stock';

const DISPENSE_CONFLICT = 'DISPENSE_CONFLICT';

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

    const { prescriptions, tenants, products } = getRepos();
    const prescription = await prescriptions.findById(user.tenantId, id);
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
      await prescriptions.update(user.tenantId, id, { status: 'expired' });
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
    const tenant = await tenants.findById(user.tenantId, { select: 'settings.pharmacyCompliance.pdeaLicense' });

    // One batched product read — reused for validation and as updateStock snapshots
    const dispenseProductIds = itemIndexes
      .map((idx) => prescription.items[idx].productId)
      .filter(Boolean)
      .map(String);
    const dispenseProducts = new Map(
      (await products.list(user.tenantId, { ids: dispenseProductIds }, { select: `drugSchedule ${STOCK_SNAPSHOT_FIELDS}` }))
        .map((p) => [p._id, p])
    );

    // Validate per-item requirements
    for (const idx of itemIndexes) {
      const item = prescription.items[idx];
      if (item.productId) {
        const product = dispenseProducts.get(String(item.productId));
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
        if (product.trackInventory && !product.allowOutOfStockSales && (product.stock ?? 0) < item.quantity) {
          return NextResponse.json(
            { success: false, error: `Insufficient stock for ${item.drugName}` },
            { status: 409 }
          );
        }
      }
    }

    // Atomic with the stock deduction. dispenseItems claims the items first, so
    // a concurrent dispense stops here before any stock moves.
    let dispensed: Prescription;
    try {
      dispensed = await runInTransaction(async (tx) => {
        const claimed = await prescriptions.dispenseItems(
          user.tenantId,
          id,
          itemIndexes,
          { by: user.userId, at: new Date() },
          { tx }
        );
        if (!claimed) throw new Error(DISPENSE_CONFLICT);

        const movements: StockMovementInput[] = [];
        for (const idx of itemIndexes) {
          const item = claimed.items[idx];
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
                product: dispenseProducts.get(item.productId) as StockProductSnapshot | undefined,
                movements,
              },
              tx
            );
          }
        }

        await insertStockMovements(movements, tx);
        return claimed;
      });
    } catch (error) {
      if (error instanceof Error && error.message === DISPENSE_CONFLICT) {
        return NextResponse.json({ success: false, error: 'Prescription was already dispensed' }, { status: 409 });
      }
      throw error;
    }

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.PRESCRIPTION_DISPENSE,
      entityType: 'prescription',
      entityId: id,
      changes: { itemIndexes, dispensedBy: user.userId, status: dispensed.status },
    });

    return NextResponse.json({ success: true, data: dispensed });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to dispense prescription');
  }
}
