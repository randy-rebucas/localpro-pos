import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireRole } from '@/lib/auth';
import mongoose from 'mongoose';

const KEY_COLLECTIONS = [
  'tenants',
  'users',
  'subscriptions',
  'subscriptionplans',
  'auditlogs',
  'products',
  'orders',
  'customers',
  'categories',
  'branches',
];

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const start = Date.now();
    const db = mongoose.connection.db;

    if (!db) {
      return NextResponse.json({ success: false, error: 'Database not connected' }, { status: 503 });
    }

    // Ping
    await db.admin().ping();
    const latencyMs = Date.now() - start;

    // Collection stats
    const allCollections = await db.listCollections().toArray();
    const collectionNames = allCollections.map(c => c.name);

    const statsPromises = KEY_COLLECTIONS
      .filter(name => collectionNames.includes(name))
      .map(async name => {
        try {
          const stats = await db.collection(name).estimatedDocumentCount();
          return { name, count: stats };
        } catch {
          return { name, count: -1 };
        }
      });

    const collections = await Promise.all(statsPromises);

    return NextResponse.json({
      success: true,
      data: {
        status: 'ok',
        latencyMs,
        totalCollections: allCollections.length,
        collections,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json({
      success: false,
      data: { status: 'error', latencyMs: -1, collections: [] },
      error: error instanceof Error ? error.message : 'Health check failed',
    }, { status: 503 });
  }
}
