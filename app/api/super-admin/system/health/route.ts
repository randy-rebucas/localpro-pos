import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Postgres table names for the equivalent of the old Mongo KEY_COLLECTIONS list.
const KEY_TABLES = [
  'tenants',
  'users',
  'subscriptions',
  'subscription_plans',
  'audit_logs',
  'products',
  'customers',
  'categories',
  'branches',
];

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`super-admin-health:${ip}`, 20, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await requireRole(request, ['super_admin']);

    const start = Date.now();

    // Ping
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;

    // Table listing (equivalent of listCollections)
    const allTables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    const tableNames = allTables.map((t) => t.tablename);

    const statsPromises = KEY_TABLES
      .filter((name) => tableNames.includes(name))
      .map(async (name) => {
        try {
          const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
            `SELECT COUNT(*)::bigint AS count FROM "${name}"`
          );
          return { name, count: Number(result[0]?.count ?? 0) };
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
