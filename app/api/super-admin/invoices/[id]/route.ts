import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

// GET /api/super-admin/invoices/[id] — read-only invoice lookup, unscoped by
// tenant (super_admin only). Used by the billing-events invoice drawer,
// which otherwise has no tenant session to satisfy the tenant-scoped
// /api/invoices/[id] route's requireTenantAccess check.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        tenant: { select: { slug: true, name: true } },
        transaction: { select: { receiptNumber: true, total: true } },
        customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        items: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    const data = {
      ...invoice,
      subtotal: Number(invoice.subtotal),
      discountAmount: invoice.discountAmount != null ? Number(invoice.discountAmount) : null,
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
      paidAmount: invoice.paidAmount != null ? Number(invoice.paidAmount) : null,
      items: invoice.items.map((it) => ({
        ...it,
        price: Number(it.price),
        subtotal: Number(it.subtotal),
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
