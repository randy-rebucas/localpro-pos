/**
 * Centralized authentication for automation / cron endpoints.
 *
 * Correct (fail-closed) logic:
 *  - If CRON_SECRET is not configured → deny all in production, allow in dev
 *  - A request is authorized when either:
 *      a) Authorization header is `Bearer <CRON_SECRET>`  (Vercel Cron)
 *      b) `?secret=<CRON_SECRET>` query param is present  (external cron services)
 */

import { NextRequest, NextResponse } from 'next/server';

export function verifyCronAuth(
  request: NextRequest,
  providedSecret: string | null
): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  // No secret configured → fail closed in production, open in dev
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: 'Automation endpoints require CRON_SECRET to be configured in production.' },
        { status: 503 }
      );
    }
    return null; // allow in development
  }

  const authHeader = request.headers.get('authorization');
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;
  const secretMatches = providedSecret === cronSecret;

  if (!isVercelCron && !secretMatches) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null; // authorized
}
