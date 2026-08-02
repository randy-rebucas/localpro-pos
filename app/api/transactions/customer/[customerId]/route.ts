import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireCustomerAuth } from '@/lib/auth-customer';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - Get all transactions/orders for a customer
 * Query params:
 * - status: transaction status (optional)
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 * - page: page number (default: 1)
 * - limit: items per page (default: 20)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const t = await getValidationTranslatorFromRequest(request);

    // Verify customer authentication
    const customer = await requireCustomerAuth(request);
    const { customerId } = await params;

    // Ensure customer can only access their own orders
    if (customer.customerId !== customerId) {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    // Build query
    const where: Prisma.TransactionWhereInput = {
      tenantId: customer.tenantId,
      customerId: customer.customerId,
    };

    if (status) {
      where.status = status as never;
    }

    if (startDate || endDate) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (startDate) {
        const d = new Date(startDate);
        if (isNaN(d.getTime())) return NextResponse.json({ success: false, error: 'Invalid startDate' }, { status: 400 });
        dateFilter.gte = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        if (isNaN(d.getTime())) return NextResponse.json({ success: false, error: 'Invalid endDate' }, { status: 400 });
        dateFilter.lte = d;
      }
      where.createdAt = dateFilter;
    }

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true },
      }),
    ]);

    const data = transactions.map((tx) => {
      const { id, items, ...rest } = tx;
      return {
        _id: id,
        ...rest,
        subtotal: Number(rest.subtotal),
        discountAmount: rest.discountAmount !== null ? Number(rest.discountAmount) : null,
        taxExemptAmount: Number(rest.taxExemptAmount),
        zeroRatedAmount: Number(rest.zeroRatedAmount),
        taxAmount: Number(rest.taxAmount),
        total: Number(rest.total),
        cashReceived: rest.cashReceived !== null ? Number(rest.cashReceived) : null,
        change: rest.change !== null ? Number(rest.change) : null,
        items: items.map((item) => ({
          ...item,
          _id: item.id,
          product: item.productId,
          price: Number(item.price),
          subtotal: Number(item.subtotal),
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    logger.error('Get customer transactions error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch transactions';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
