import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

const KEY_TABLES = [
  'tenants',
  'users',
  'subscriptions',
  'subscription_plans',
  'audit_logs',
  'products',
  'transactions',
  'customers',
  'categories',
  'branches',
];

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const start = Date.now();

    // Ping
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;

    // Approximate row counts (fast — reads Postgres's planner statistics
    // rather than scanning each table).
    const rows = await prisma.$queryRaw<Array<{ relname: string; n_live_tup: bigint }>>`
      SELECT relname, n_live_tup
      FROM pg_stat_user_tables
      WHERE relname = ANY(${KEY_TABLES})
    `;
    const countByTable = new Map(rows.map((r) => [r.relname, Number(r.n_live_tup)]));

    const allTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;

    const collections = KEY_TABLES
      .filter((name) => countByTable.has(name))
      .map((name) => ({ name, count: countByTable.get(name) ?? -1 }));

    return NextResponse.json({
      success: true,
      data: {
        status: 'ok',
        latencyMs,
        totalCollections: allTables.length,
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
