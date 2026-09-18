import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

// Postgres has no native TTL; sessions are created/refreshed with a 1hr
// expiresAt and must be purged by a scheduled cleanup job (see the
// PosSession model comment in prisma/schema.prisma). This route no longer
// relies on the database to auto-delete expired rows, so expired sessions
// are also treated as "not found" here.
const SESSION_TTL_MS = 60 * 60 * 1000;

function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const tenant = request.nextUrl.searchParams.get('tenant');

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant' },
        { status: 400 }
      );
    }

    const session = await prisma.posSession.findUnique({ where: { sessionId } });

    if (!session || session.tenant !== tenant || isExpired(session.expiresAt)) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        cart: session.cart,
        subtotal: Number(session.subtotal),
        discount: session.discount,
        taxAmount: session.taxAmount != null ? Number(session.taxAmount) : session.taxAmount,
        taxRate: session.taxRate != null ? Number(session.taxRate) : session.taxRate,
        taxLabel: session.taxLabel,
        tip: Number(session.tip),
        total: Number(session.total),
        paymentMethod: session.paymentMethod,
        paymentStatus: session.paymentStatus,
        lastUpdate: session.lastUpdate.getTime(),
      },
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
    if (session && isExpired(session.expiresAt)) {
      session = null;
    }

    // Once a session belongs to a tenant, no caller may reassign it to a different
    // tenant — the client-supplied `tenant` field is otherwise unauthenticated and
    // sessionId alone must not be enough to hijack or reset another tenant's session.
    if (session && session.tenant !== tenant) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    if (action === 'init' && !session) {
      // Create a brand-new session. Uses upsert (not create) because two
      // concurrent init calls for the same sessionId (React double-invoking
      // effects, a double-submit) can both observe `!session` above and race
      // to create — the loser would otherwise hit a unique-constraint error
      // on sessionId instead of just converging on the same session.
      session = await prisma.posSession.upsert({
        where: { sessionId },
        create: {
          id: randomUUID(),
          sessionId,
          tenant,
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number | undefined) ?? 0,
          discount: (data?.discount ?? null) as Prisma.InputJsonValue | undefined,
          taxAmount: data?.taxAmount as number | undefined,
          taxRate: data?.taxRate as number | undefined,
          taxLabel: data?.taxLabel as string | undefined,
          tip: (data?.tip as number | undefined) ?? 0,
          total: (data?.total as number | undefined) ?? 0,
          paymentMethod: (data?.paymentMethod as string | undefined) ?? null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
          expiresAt,
        },
        update: {
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number | undefined) ?? 0,
          discount: (data?.discount ?? null) as Prisma.InputJsonValue | undefined,
          taxAmount: data?.taxAmount as number | undefined,
          taxRate: data?.taxRate as number | undefined,
          taxLabel: data?.taxLabel as string | undefined,
          tip: (data?.tip as number | undefined) ?? 0,
          total: (data?.total as number | undefined) ?? 0,
          paymentMethod: (data?.paymentMethod as string | undefined) ?? null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
          expiresAt,
        },
      });
    } else if (action === 'init' && session) {
      // Reset an existing session owned by the same tenant
      session = await prisma.posSession.update({
        where: { sessionId },
        data: {
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number | undefined) ?? 0,
          discount: (data?.discount ?? null) as Prisma.InputJsonValue | undefined,
          taxAmount: data?.taxAmount as number | undefined,
          taxRate: data?.taxRate as number | undefined,
          taxLabel: data?.taxLabel as string | undefined,
          tip: (data?.tip as number | undefined) ?? 0,
          total: (data?.total as number | undefined) ?? 0,
          paymentMethod: (data?.paymentMethod as string | undefined) ?? null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
          expiresAt,
        },
      });
    } else if (action === 'update-cart' && !session) {
      // Auto-create session if it doesn't exist (handles race condition where cart syncs before init completes)
      session = await prisma.posSession.upsert({
        where: { sessionId },
        create: {
          id: randomUUID(),
          sessionId,
          tenant,
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number | undefined) ?? 0,
          discount: Prisma.JsonNull,
          taxAmount: (data?.taxAmount as number | undefined) ?? 0,
          taxRate: (data?.taxRate as number | undefined) ?? 0,
          taxLabel: (data?.taxLabel as string | undefined) ?? 'Tax',
          tip: 0,
          total: (data?.total as number | undefined) ?? 0,
          paymentMethod: null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
          expiresAt,
        },
        update: {
          sessionId,
          tenant,
          cart: (data?.cart ?? []) as Prisma.InputJsonValue,
          subtotal: (data?.subtotal as number | undefined) ?? 0,
          discount: Prisma.JsonNull,
          taxAmount: (data?.taxAmount as number | undefined) ?? 0,
          taxRate: (data?.taxRate as number | undefined) ?? 0,
          taxLabel: (data?.taxLabel as string | undefined) ?? 'Tax',
          tip: 0,
          total: (data?.total as number | undefined) ?? 0,
          paymentMethod: null,
          paymentStatus: 'pending',
          lastUpdate: new Date(),
          expiresAt,
        },
      });
    } else if (session) {
      const updates: Prisma.PosSessionUpdateInput = { lastUpdate: new Date(), expiresAt };

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
        updates.tip = (data.tip as number | undefined) ?? 0;
        if (data.total != null) updates.total = data.total as number;
      } else if (action === 'update-payment-method' && data) {
        updates.paymentMethod = (data.paymentMethod as string | undefined) ?? null;
      } else if (action === 'update-payment-status' && data) {
        updates.paymentStatus = (data.status as string | undefined) ?? 'pending';
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

      session = await prisma.posSession.update({
        where: { sessionId },
        data: updates,
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Session not found. Please reinitialize.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        cart: session.cart,
        subtotal: Number(session.subtotal),
        discount: session.discount,
        taxAmount: session.taxAmount != null ? Number(session.taxAmount) : session.taxAmount,
        taxRate: session.taxRate != null ? Number(session.taxRate) : session.taxRate,
        taxLabel: session.taxLabel,
        tip: Number(session.tip),
        total: Number(session.total),
        paymentMethod: session.paymentMethod,
        paymentStatus: session.paymentStatus,
      },
    });
  } catch (error) {
    logger.error('POST /api/pos/session/[sessionId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
