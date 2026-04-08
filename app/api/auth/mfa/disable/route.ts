import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireAuth } from '@/lib/auth';
import MFAConfig from '@/models/MFAConfig';
import { verifyTOTP } from '@/lib/totp';
import bcrypt from 'bcryptjs';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';

/**
 * POST /api/auth/mfa/disable
 * Body: { code: string, isBackupCode?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const body = await request.json();
    const { code, isBackupCode } = body;

    if (!code) {
      return NextResponse.json({ success: false, error: 'Verification code is required' }, { status: 400 });
    }

    const config = await MFAConfig.findOne({ userId: user.userId }).select('+totpSecret +backupCodes +lastUsedCounter');
    if (!config || !config.isEnabled) {
      return NextResponse.json({ success: false, error: 'MFA is not enabled' }, { status: 400 });
    }

    let isValid = false;

    if (isBackupCode) {
      // Check all codes without short-circuiting to prevent timing oracle attacks
      let matchedIndex = -1;
      const normalizedCode = code.toUpperCase();
      for (let i = 0; i < config.backupCodes.length; i++) {
        const matches = await bcrypt.compare(normalizedCode, config.backupCodes[i]);
        if (matches && matchedIndex === -1) {
          matchedIndex = i;
        }
      }
      if (matchedIndex !== -1) {
        isValid = true;
        // Atomic removal via $pull to prevent race condition
        await MFAConfig.findByIdAndUpdate(config._id, {
          $pull: { backupCodes: config.backupCodes[matchedIndex] },
        });
      }
    } else {
      const result = verifyTOTP(code, config.totpSecret);
      if (result.valid) {
        // Replay attack prevention
        if (config.lastUsedCounter !== undefined && config.lastUsedCounter !== null && result.counter <= config.lastUsedCounter) {
          return NextResponse.json({ success: false, error: 'TOTP code already used' }, { status: 401 });
        }
        await MFAConfig.findByIdAndUpdate(config._id, { lastUsedCounter: result.counter });
        isValid = true;
      }
    }

    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid verification code' }, { status: 401 });
    }

    await MFAConfig.findByIdAndDelete(config._id);
    await createAuditLog(request, {
      tenantId: user.tenantId,
      action: AuditActions.UPDATE,
      entityType: 'mfa_config',
      entityId: user.userId,
      metadata: { action: 'mfa_disabled' },
    });

    return NextResponse.json({ success: true, data: { message: 'MFA has been disabled.' } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to disable MFA');
  }
}
