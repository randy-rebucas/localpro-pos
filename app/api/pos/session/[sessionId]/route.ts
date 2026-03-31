import { NextRequest, NextResponse } from 'next/server';

// In-memory session storage (would use Redis in production)
const sessionStore = new Map<string, {
  tenant: string;
  cart: any[];
  subtotal: number;
  discount: { code: string; amount: number; name?: string } | null;
  taxAmount?: number;
  taxRate?: number;
  taxLabel?: string;
  tip: number;
  total: number;
  paymentMethod: string | null;
  paymentStatus: 'pending' | 'processing' | 'completed' | 'failed';
  lastUpdate: number;
}>()

// Cleanup old sessions (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of sessionStore.entries()) {
    if (now - data.lastUpdate > 60 * 60 * 1000) {
      sessionStore.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = sessionStore.get(sessionId);

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
    console.error('GET /api/pos/session/[sessionId] error:', error);
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
    const body = await request.json();
    const { tenant, action, data } = body;

    if (!tenant || !sessionId) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant or sessionId' },
        { status: 400 }
      );
    }

    let session = sessionStore.get(sessionId);

    if (action === 'init') {
      // Initialize or reset session
      session = {
        tenant,
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
      };
    } else if (session) {
      // Update existing session
      if (action === 'update-cart') {
        session.cart = data.cart || session.cart;
        session.subtotal = data.subtotal ?? session.subtotal;
        session.taxAmount = data.taxAmount ?? session.taxAmount;
        session.taxRate = data.taxRate ?? session.taxRate;
        session.taxLabel = data.taxLabel ?? session.taxLabel;
        session.total = data.total ?? session.total;
      } else if (action === 'update-discount') {
        session.discount = data.discount;
        session.taxAmount = data.taxAmount ?? session.taxAmount;
        session.total = data.total ?? session.total;
      } else if (action === 'update-tip') {
        session.tip = data.tip ?? 0;
        session.total = data.total ?? session.total;
      } else if (action === 'update-payment-method') {
        session.paymentMethod = data.paymentMethod || null;
      } else if (action === 'update-payment-status') {
        session.paymentStatus = data.status || 'pending';
      } else if (action === 'clear') {
        session.cart = [];
        session.subtotal = 0;
        session.discount = null;
        session.taxAmount = 0;
        session.taxRate = undefined;
        session.taxLabel = undefined;
        session.tip = 0;
        session.total = 0;
        session.paymentMethod = null;
        session.paymentStatus = 'pending';
      }
      session.lastUpdate = Date.now();
    } else {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    sessionStore.set(sessionId, session);

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
        tip: session.tip,
        total: session.total,
        paymentMethod: session.paymentMethod,
        paymentStatus: session.paymentStatus,
      },
    });
  } catch (error) {
    console.error('POST /api/pos/session/[sessionId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
