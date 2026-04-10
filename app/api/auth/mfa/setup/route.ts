import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireAuth } from '@/lib/auth';
import MFAConfig from '@/models/MFAConfig';
import { generateTOTPSecret, totpKeyUri, generateQRCode } from '@/lib/totp';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { handleApiError } from '@/lib/error-handler';
import { MFA_BACKUP_CODES_COUNT } from '@/lib/auth-config';
import { createAuditLog, AuditActions } from '@/lib/audit';

/**
 * GET /api/auth/mfa/setup — Returns current MFA status
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const config = await MFAConfig.findOne({ userId: user.userId });
    return NextResponse.json({
      success: true,
      data: { isEnabled: config?.isEnabled ?? false, enabledAt: config?.enabledAt ?? null },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to get MFA status');
  }
}

/**
 * POST /api/auth/mfa/setup — Generates TOTP secret and QR code
 * MFA is NOT active until the user calls /mfa/verify to confirm.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);

    const existing = await MFAConfig.findOne({ userId: user.userId });
    if (existing?.isEnabled) {
      return NextResponse.json(
        { success: false, error: 'MFA is already enabled. Disable it first to reconfigure.' },
        { status: 400 }
      );
    }

    const secret = generateTOTPSecret();
    const rawBackupCodes = Array.from({ length: MFA_BACKUP_CODES_COUNT }, () =>
      crypto.randomBytes(6).toString('hex').toUpperCase()
    );
    const hashedBackupCodes = await Promise.all(rawBackupCodes.map(c => bcrypt.hash(c, 10)));

    const appName = process.env.APP_NAME || '1pos';
    const uri = totpKeyUri(user.email, appName, secret);
    const qrCodeDataUrl = await generateQRCode(uri);

    await MFAConfig.findOneAndUpdate(
      { userId: user.userId },
      { userId: user.userId, tenantId: user.tenantId, totpSecret: secret, backupCodes: hashedBackupCodes, isEnabled: false },
      { upsert: true, new: true }
    );

    await createAuditLog(request, {
      tenantId: user.tenantId,
      action: AuditActions.UPDATE,
      entityType: 'mfa_config',
      entityId: user.userId,
      metadata: { action: 'mfa_setup_initiated' },
    });

    return NextResponse.json({
      success: true,
      data: {
        secret,
        qrCode: qrCodeDataUrl,
        backupCodes: rawBackupCodes,
        message: 'Scan the QR code, then call /api/auth/mfa/verify to confirm.',
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to set up MFA');
  }
}
