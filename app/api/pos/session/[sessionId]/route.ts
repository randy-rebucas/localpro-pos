import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Postgres stores lastUpdate as a real DateTime column, but the response
// shape (and the frontend that reads it) expects an epoch-ms number. Convert
// at the API boundary so that contract doesn't change.
function serialize(session: {
  cart: unknown;
  subtotal: Prisma.Decimal;
  discount: unknown;
  taxAmount: Prisma.Decimal | null;
  taxRate: Prisma.Decimal | null;
  taxLabel: string | null;
  tip: Prisma.Decimal;
  total: Prisma.Decimal;
  paymentMethod: string | null;
  paymentStatus: string;
  lastUpdate: Date;
}, sessionId: string) {
  return {
    sessionId,
    cart: session.cart,
    subtotal: Number(session.subtotal),
    discount: session.discount,
    taxAmount: session.taxAmount !== null ? Number(session.taxAmount) : undefined,
    taxRate: session.taxRate !== null ? Number(session.taxRate) : undefined,
    taxLabel: session.taxLabel ?? undefined,
    tip: Number(session.tip),
    total: Number(session.total),
    paymentMethod: session.paymentMethod,
    paymentStatus: session.paymentStatus,
    lastUpdate: session.lastUpdate.getTime(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await prisma.posSession.findUnique({ where: { sessionId } });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: serialize(session, sessionId),
    }, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
      }
    });
  } catch (error) {
    logger.error('GET /api/pos/session/[sessionId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    let body: { tenant?: string; action?: string; data?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      // Body can arrive empty/truncated when a sync request is aborted mid-flight; not a server error.
      return NextResponse.json(
        { success: false, error: 'Empty or invalid request body' },
        { status: 400 }
      );
    }
    const { tenant, action, data } = body;

    if (!tenant || !sessionId) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant or sessionId' },
        { status: 400 }
      );
    }

    let session = await prisma.posSession.findUnique({ where: { sessionId } });

    if (action === 'init') {
      // Upsert: create or reset session
      session = await prisma.posSession.upsert({
        where: { sessionId },
        create: {
          sessionId,
          tenant,
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number) || 0,
          discount: (data?.discount ?? null) as Prisma.InputJsonValue | undefined,
          taxAmount: data?.taxAmount as number | undefined,
          taxRate: data?.taxRate as number | undefined,
          taxLabel: data?.taxLabel as string | undefined,
          tip: (data?.tip as number) || 0,
          total: (data?.total as number) || 0,
          paymentMethod: (data?.paymentMethod as string) || null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
        },
        update: {
          tenant,
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number) || 0,
          discount: (data?.discount ?? null) as Prisma.InputJsonValue | undefined,
          taxAmount: data?.taxAmount as number | undefined,
          taxRate: data?.taxRate as number | undefined,
          taxLabel: data?.taxLabel as string | undefined,
          tip: (data?.tip as number) || 0,
          total: (data?.total as number) || 0,
          paymentMethod: (data?.paymentMethod as string) || null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
        },
      });
    } else if (action === 'update-cart' && !session) {
      // Auto-create session if it doesn't exist (handles race condition where cart syncs before init completes)
      session = await prisma.posSession.upsert({
        where: { sessionId },
        create: {
          sessionId,
          tenant,
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number) || 0,
          discount: Prisma.JsonNull,
          taxAmount: (data?.taxAmount as number) || 0,
          taxRate: (data?.taxRate as number) || 0,
          taxLabel: (data?.taxLabel as string) || 'Tax',
          tip: 0,
          total: (data?.total as number) || 0,
          paymentMethod: null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
        },
        update: {
          tenant,
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number) || 0,
          discount: Prisma.JsonNull,
          taxAmount: (data?.taxAmount as number) || 0,
          taxRate: (data?.taxRate as number) || 0,
          taxLabel: (data?.taxLabel as string) || 'Tax',
          tip: 0,
          total: (data?.total as number) || 0,
          paymentMethod: null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
        },
      });
    } else if (session) {
      const updates: Prisma.PosSessionUpdateInput = { lastUpdate: new Date() };

      if (action === 'update-cart' && data) {
        if (data.cart) updates.cart = data.cart as Prisma.InputJsonValue;
        if (data.subtotal != null) updates.subtotal = data.subtotal as number;
        if (data.taxAmount != null) updates.taxAmount = data.taxAmount as number;
        if (data.taxRate != null) updates.taxRate = data.taxRate as number;
        if (data.taxLabel != null) updates.taxLabel = data.taxLabel as string;
        if (data.total != null) updates.total = data.total as number;
      } else if (action === 'update-discount' && data) {
        updates.discount = (data.discount ?? Prisma.JsonNull) as Prisma.InputJsonValue;
        if (data.taxAmount != null) updates.taxAmount = data.taxAmount as number;
        if (data.total != null) updates.total = data.total as number;
      } else if (action === 'update-tip' && data) {
        updates.tip = (data.tip as number) ?? 0;
        if (data.total != null) updates.total = data.total as number;
      } else if (action === 'update-payment-method' && data) {
        updates.paymentMethod = (data.paymentMethod as string) || null;
      } else if (action === 'update-payment-status' && data) {
        updates.paymentStatus = ((data.status as string) || 'pending') as never;
      } else if (action === 'clear') {
        updates.cart = [];
        updates.subtotal = 0;
        updates.discount = Prisma.JsonNull;
        updates.taxAmount = null;
        updates.taxRate = null;
        updates.taxLabel = null;
        updates.tip = 0;
        updates.total = 0;
        updates.paymentMethod = null;
        updates.paymentStatus = 'pending';
      }

      session = await prisma.posSession.update({ where: { sessionId }, data: updates });
    } else {
      return NextResponse.json(
        { success: false, error: 'Session not found. Please reinitialize.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: serialize(session, sessionId),
    });
  } catch (error) {
    logger.error('POST /api/pos/session/[sessionId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
