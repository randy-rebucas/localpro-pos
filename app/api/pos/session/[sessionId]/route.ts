import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import PosSession from '@/models/PosSession';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await connectDB();
    const { sessionId } = await params;
    const tenant = request.nextUrl.searchParams.get('tenant');

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant' },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await PosSession.findOne({ sessionId, tenant }).lean() as any;

    if (!session) {
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
        subtotal: session.subtotal,
        discount: session.discount,
        taxAmount: session.taxAmount,
        taxRate: session.taxRate,
        taxLabel: session.taxLabel,
        taxIncluded: !!session.taxIncluded,
        tip: session.tip,
        total: session.total,
        paymentMethod: session.paymentMethod,
        paymentStatus: session.paymentStatus,
        lastUpdate: session.lastUpdate,
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
    await connectDB();
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

    // Once a session belongs to a tenant, no caller may reassign it to a different
    // tenant — the client-supplied `tenant` field is otherwise unauthenticated and
    // sessionId alone must not be enough to hijack or reset another tenant's session.
    // Every write filters on { sessionId, tenant }; an upsert that collides with
    // another tenant's session hits the unique sessionId index (E11000) → 404.
    // One write per call — no read-before-write.
    const sessionNotFound = () => NextResponse.json(
      { success: false, error: 'Session not found' },
      { status: 404 }
    );
    const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

    // Upsert scoped to { sessionId, tenant }. A duplicate key means the sessionId
    // already exists: either another tenant owns it (→ null → 404) or a
    // concurrent request from this tenant created it first (→ plain update).
    const upsertSession = async (update: Record<string, unknown>) => {
      try {
        return await PosSession.findOneAndUpdate({ sessionId, tenant }, update, { upsert: true, new: true }).lean();
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
        const { $setOnInsert: _ignored, ...plainUpdate } = update; // eslint-disable-line @typescript-eslint/no-unused-vars
        return PosSession.findOneAndUpdate({ sessionId, tenant }, plainUpdate, { new: true }).lean();
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let session: any;

    if (action === 'init') {
      // Create a brand-new session, or reset an existing one owned by the same tenant
      session = await upsertSession({
            $set: {
              cart: data?.cart || [],
              subtotal: data?.subtotal || 0,
              discount: data?.discount || null,
              taxAmount: data?.taxAmount,
              taxRate: data?.taxRate,
              taxLabel: data?.taxLabel,
              taxIncluded: !!data?.taxIncluded,
              tip: data?.tip || 0,
              total: data?.total || 0,
              paymentMethod: data?.paymentMethod || null,
              paymentStatus: 'pending',
              lastUpdate: Date.now(),
            },
          });
      if (!session) return sessionNotFound();
    } else {
      const updates: Record<string, unknown> = { lastUpdate: Date.now() };

      if (action === 'update-cart' && data) {
        if (data.cart) updates.cart = data.cart;
        if (data.subtotal != null) updates.subtotal = data.subtotal;
        if (data.taxAmount != null) updates.taxAmount = data.taxAmount;
        if (data.taxRate != null) updates.taxRate = data.taxRate;
        if (data.taxLabel != null) updates.taxLabel = data.taxLabel;
        if (data.taxIncluded != null) updates.taxIncluded = !!data.taxIncluded;
        if (data.total != null) updates.total = data.total;
      } else if (action === 'update-discount' && data) {
        updates.discount = data.discount;
        if (data.taxAmount != null) updates.taxAmount = data.taxAmount;
        if (data.total != null) updates.total = data.total;
      } else if (action === 'update-tip' && data) {
        updates.tip = data.tip ?? 0;
        if (data.total != null) updates.total = data.total;
      } else if (action === 'update-payment-method' && data) {
        updates.paymentMethod = data.paymentMethod || null;
      } else if (action === 'update-payment-status' && data) {
        updates.paymentStatus = data.status || 'pending';
      } else if (action === 'clear') {
        updates.cart = [];
        updates.subtotal = 0;
        updates.discount = null;
        updates.taxAmount = 0;
        updates.taxRate = undefined;
        updates.taxLabel = undefined;
        updates.taxIncluded = false;
        updates.tip = 0;
        updates.total = 0;
        updates.paymentMethod = null;
        updates.paymentStatus = 'pending';
      }

      if (action === 'update-cart') {
        // Auto-create session if it doesn't exist (handles race condition where cart syncs before init completes)
        const insertDefaults: Record<string, unknown> = {
          cart: [], subtotal: 0, discount: null, taxAmount: 0, taxRate: 0, taxLabel: 'Tax', taxIncluded: false,
          tip: 0, total: 0, paymentMethod: null, paymentStatus: 'pending',
        };
        for (const key of Object.keys(updates)) delete insertDefaults[key];
        session = await upsertSession({ $set: updates, $setOnInsert: insertDefaults });
        if (!session) return sessionNotFound();
      } else {
        session = await PosSession.findOneAndUpdate(
          { sessionId, tenant },
          { $set: updates },
          { new: true }
        ).lean();
        if (!session) {
          return NextResponse.json(
            { success: false, error: 'Session not found. Please reinitialize.' },
            { status: 404 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        cart: session.cart,
        subtotal: session.subtotal,
        discount: session.discount,
        taxAmount: session.taxAmount,
        taxRate: session.taxRate,
        taxLabel: session.taxLabel,
        taxIncluded: !!session.taxIncluded,
        tip: session.tip,
        total: session.total,
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
