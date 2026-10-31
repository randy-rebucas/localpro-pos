import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import PosSession, { IPosSession } from '@/models/PosSession';
import { requireAuth } from '@/lib/auth';
import { getTenantId } from '@/lib/tenant';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

/**
 * POS <-> customer-display session.
 *
 * Both the POS terminal (writes) and the customer display (polls GET, and
 * POSTs `update-payment-method`) run in the staff member's logged-in browser —
 * proxy.ts already requires a JWT for every non-public /api/* path. This route
 * additionally binds the session to the *authenticated* tenant: the
 * client-supplied `tenant` slug is only accepted when it resolves to the
 * caller's own tenant, and every lookup is scoped by `tenantId`.
 */

// GET is polled roughly once per second by the display; POST fires on every
// cart change. Generous per-IP-per-session ceiling that still stops floods.
const RATE_LIMIT = 300;
const RATE_WINDOW_MS = 60_000;

type AuthContext = { tenantId: string; slug: string | null };

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status });
}

/**
 * Rate limit + auth + tenant resolution. Returns either a ready error response
 * or the caller's tenant context.
 */
async function authorize(
  request: NextRequest,
  sessionId: string,
  slug: string | null | undefined
): Promise<NextResponse | AuthContext> {
  const rl = checkRateLimit(`pos-session:${getClientIp(request)}:${sessionId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
    );
  }

  const user = await requireAuth(request); // throws 'Unauthorized' -> 401 via handleApiError
  if (!user.tenantId || !mongoose.Types.ObjectId.isValid(user.tenantId)) {
    return json({ success: false, error: 'Forbidden' }, 403);
  }

  await connectDB();

  if (slug) {
    const slugTenantId = await getTenantId(slug);
    if (!slugTenantId || slugTenantId !== String(user.tenantId)) {
      return json({ success: false, error: 'Forbidden' }, 403);
    }
  }

  return { tenantId: String(user.tenantId), slug: slug || null };
}

/**
 * A session is owned by the caller when its tenantId matches. Sessions created
 * before tenantId was stored (TTL ≤ 1h) are matched by the verified slug.
 */
function isOwned(session: Pick<IPosSession, 'tenant' | 'tenantId'>, ctx: AuthContext): boolean {
  if (session.tenantId) return String(session.tenantId) === ctx.tenantId;
  return !!ctx.slug && session.tenant === ctx.slug;
}

function serialize(sessionId: string, session: IPosSession) {
  return {
    sessionId,
    cart: session.cart,
    subtotal: session.subtotal,
    discount: session.discount,
    taxAmount: session.taxAmount,
    taxRate: session.taxRate,
    taxLabel: session.taxLabel,
    tip: session.tip,
    total: session.total,
    paymentMethod: session.paymentMethod,
    paymentStatus: session.paymentStatus,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const ctx = await authorize(request, sessionId, request.nextUrl.searchParams.get('tenant'));
    if (ctx instanceof NextResponse) return ctx;

    const session = await PosSession.findOne({ sessionId }).lean<IPosSession>();

    if (!session || !isOwned(session, ctx)) {
      return json({ success: false, error: 'Session not found' }, 404);
    }

    return NextResponse.json({
      success: true,
      data: { ...serialize(sessionId, session), lastUpdate: session.lastUpdate },
    }, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
      }
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load POS session');
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
      return json({ success: false, error: 'Empty or invalid request body' }, 400);
    }
    const { tenant, action, data } = body;

    if (!tenant || !sessionId) {
      return json({ success: false, error: 'Missing tenant or sessionId' }, 400);
    }

    const ctx = await authorize(request, sessionId, tenant);
    if (ctx instanceof NextResponse) return ctx;

    const tenantId = new mongoose.Types.ObjectId(ctx.tenantId);
    // Slug kept on the document for backward compatibility (verified in authorize()).
    const tenantSlug = tenant;

    let session = await PosSession.findOne({ sessionId });

    // Never let a sessionId belonging to another tenant be read, reset or hijacked.
    if (session && !isOwned(session, ctx)) {
      return json({ success: false, error: 'Session not found' }, 404);
    }

    if (action === 'init' && !session) {
      session = await PosSession.create({
        sessionId,
        tenant: tenantSlug,
        tenantId,
        cart: data?.cart || [],
        subtotal: data?.subtotal || 0,
        discount: data?.discount || null,
        taxAmount: data?.taxAmount,
        taxRate: data?.taxRate,
        taxLabel: data?.taxLabel,
        tip: data?.tip || 0,
        total: data?.total || 0,
        paymentMethod: data?.paymentMethod || null,
        paymentStatus: 'pending',
        lastUpdate: Date.now(),
      });
    } else if (action === 'init' && session) {
      session = await PosSession.findOneAndUpdate(
        { _id: session._id },
        {
          tenantId,
          cart: data?.cart || [],
          subtotal: data?.subtotal || 0,
          discount: data?.discount || null,
          taxAmount: data?.taxAmount,
          taxRate: data?.taxRate,
          taxLabel: data?.taxLabel,
          tip: data?.tip || 0,
          total: data?.total || 0,
          paymentMethod: data?.paymentMethod || null,
          paymentStatus: 'pending',
          lastUpdate: Date.now(),
        },
        { new: true }
      );
    } else if (action === 'update-cart' && !session) {
      // Auto-create session if it doesn't exist (handles race condition where cart syncs before init completes)
      session = await PosSession.findOneAndUpdate(
        { sessionId, tenantId },
        {
          sessionId,
          tenant: tenantSlug,
          tenantId,
          cart: data?.cart || [],
          subtotal: data?.subtotal || 0,
          discount: null,
          taxAmount: data?.taxAmount || 0,
          taxRate: data?.taxRate || 0,
          taxLabel: data?.taxLabel || 'Tax',
          tip: 0,
          total: data?.total || 0,
          paymentMethod: null,
          paymentStatus: 'pending',
          lastUpdate: Date.now(),
        },
        { upsert: true, new: true }
      );
    } else if (session) {
      const updates: Record<string, unknown> = { lastUpdate: Date.now(), tenantId };

      if (action === 'update-cart' && data) {
        if (data.cart) updates.cart = data.cart;
        if (data.subtotal != null) updates.subtotal = data.subtotal;
        if (data.taxAmount != null) updates.taxAmount = data.taxAmount;
        if (data.taxRate != null) updates.taxRate = data.taxRate;
        if (data.taxLabel != null) updates.taxLabel = data.taxLabel;
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
        updates.tip = 0;
        updates.total = 0;
        updates.paymentMethod = null;
        updates.paymentStatus = 'pending';
      }

      session = await PosSession.findOneAndUpdate(
        { _id: session._id },
        { $set: updates },
        { new: true }
      );
    } else {
      return json({ success: false, error: 'Session not found. Please reinitialize.' }, 404);
    }

    if (!session) {
      // Expired (TTL) or removed between the lookup and the update.
      return json({ success: false, error: 'Session not found. Please reinitialize.' }, 404);
    }

    return NextResponse.json({ success: true, data: serialize(sessionId, session) });
  } catch (error) {
    return handleApiError(error, 'Failed to update POS session');
  }
}
