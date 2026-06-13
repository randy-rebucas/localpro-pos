import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`scan-session-log:${tenantId}:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { sessionId, stats } = body as {
      sessionId?: string;
      stats?: { done: number; skipped: number; errors: number };
    };

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
    }
    if (!stats || typeof stats.done !== 'number') {
      return NextResponse.json({ success: false, error: 'stats object is required' }, { status: 400 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'scan_session',
      entityId: sessionId,
      changes: { stats },
    });

    logger.info(`scan-session complete: ${sessionId} — done=${stats.done} skipped=${stats.skipped} errors=${stats.errors}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to log scan session');
  }
}
