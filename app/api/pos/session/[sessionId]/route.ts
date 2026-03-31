import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import { logger } from '@/lib/logger';

// MongoDB-backed POS session for serverless compatibility
const posSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  tenant: { type: String, required: true },
  cart: { type: Array, default: [] },
  subtotal: { type: Number, default: 0 },
  discount: { type: mongoose.Schema.Types.Mixed, default: null },
  taxAmount: { type: Number },
  taxRate: { type: Number },
  taxLabel: { type: String },
  tip: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paymentMethod: { type: String, default: null },
  paymentStatus: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  lastUpdate: { type: Number, default: Date.now },
}, {
  timestamps: true,
  // TTL index: auto-delete sessions older than 1 hour
  expireAfterSeconds: 3600,
});

// Add TTL index on createdAt
posSessionSchema.index({ lastUpdate: 1 }, { expireAfterSeconds: 3600 });

const PosSession = mongoose.models.PosSession || mongoose.model('PosSession', posSessionSchema);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await connectDB();
    const { sessionId } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await PosSession.findOne({ sessionId }).lean() as any;

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
    const body = await request.json();
    const { tenant, action, data } = body;

    if (!tenant || !sessionId) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant or sessionId' },
        { status: 400 }
      );
    }

    let session = await PosSession.findOne({ sessionId });

    if (action === 'init') {
      // Upsert: create or reset session
      session = await PosSession.findOneAndUpdate(
        { sessionId },
        {
          sessionId,
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
        },
        { upsert: true, new: true }
      );
    } else if (session) {
      const updates: Record<string, unknown> = { lastUpdate: Date.now() };

      if (action === 'update-cart') {
        if (data.cart) updates.cart = data.cart;
        if (data.subtotal != null) updates.subtotal = data.subtotal;
        if (data.taxAmount != null) updates.taxAmount = data.taxAmount;
        if (data.taxRate != null) updates.taxRate = data.taxRate;
        if (data.taxLabel != null) updates.taxLabel = data.taxLabel;
        if (data.total != null) updates.total = data.total;
      } else if (action === 'update-discount') {
        updates.discount = data.discount;
        if (data.taxAmount != null) updates.taxAmount = data.taxAmount;
        if (data.total != null) updates.total = data.total;
      } else if (action === 'update-tip') {
        updates.tip = data.tip ?? 0;
        if (data.total != null) updates.total = data.total;
      } else if (action === 'update-payment-method') {
        updates.paymentMethod = data.paymentMethod || null;
      } else if (action === 'update-payment-status') {
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
        { sessionId },
        { $set: updates },
        { new: true }
      );
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
    logger.error('POST /api/pos/session/[sessionId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
