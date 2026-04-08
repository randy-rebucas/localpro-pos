import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireAuth } from '@/lib/auth';
import MFAConfig from '@/models/MFAConfig';
import { verifyTOTP } from '@/lib/totp';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/auth/mfa/verify
 * - Activation: called by authenticated user to confirm setup
 * - Login challenge: pass userId (no auth required)
 * Body: { code: string, userId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { code, userId: challengeUserId } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ success: false, error: 'TOTP code is required' }, { status: 400 });
    }

    let userId: string;
    let tenantId: string = '';
    let isLoginChallenge = false;

    if (challengeUserId) {
      // Rate-limit unauthenticated TOTP verification by IP + userId to prevent brute-force
      const ip = getClientIp(request);
      const rl = checkRateLimit(`mfa-verify:${ip}:${challengeUserId}`, 5, 15 * 60 * 1000);
      if (!rl.allowed) {
        return NextResponse.json(
          { success: false, error: 'Too many verification attempts. Please try again later.' },
          { status: 429 }
        );
      }
      userId = challengeUserId;
      isLoginChallenge = true;
    } else {
      const user = await requireAuth(request);
      userId = user.userId;
      tenantId = user.tenantId;
    }

    const config = await MFAConfig.findOne({ userId }).select('+totpSecret +backupCodes +lastUsedCounter');
    if (!config) {
      return NextResponse.json({ success: false, error: 'MFA not configured' }, { status: 404 });
    }
    if (!tenantId) tenantId = config.tenantId.toString();

    const result = verifyTOTP(code, config.totpSecret);
    if (!result.valid) {
      return NextResponse.json({ success: false, error: 'Invalid or expired TOTP code' }, { status: 401 });
    }

    // Replay attack prevention: reject codes already used in this time window
    if (config.lastUsedCounter !== undefined && config.lastUsedCounter !== null && result.counter <= config.lastUsedCounter) {
      return NextResponse.json({ success: false, error: 'TOTP code already used' }, { status: 401 });
    }

    // Atomically record the used counter
    await MFAConfig.findByIdAndUpdate(config._id, { lastUsedCounter: result.counter });

    if (!isLoginChallenge && !config.isEnabled) {
      await MFAConfig.findByIdAndUpdate(config._id, { isEnabled: true, enabledAt: new Date() });
      await createAuditLog(request, {
        tenantId,
        action: AuditActions.UPDATE,
        entityType: 'mfa_config',
        entityId: userId,
        metadata: { action: 'mfa_enabled' },
      });
      return NextResponse.json({ success: true, data: { message: 'MFA has been enabled successfully.' } });
    }

    return NextResponse.json({ success: true, data: { verified: true } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'MFA verification failed');
  }
}
