import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import MFAConfig from '@/models/MFAConfig';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { verifyTOTP } from '@/lib/totp';
import bcrypt from 'bcryptjs';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

/**
 * POST /api/auth/mfa/login
 * Body: { userId: string, code: string, isBackupCode?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`mfa-login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await connectDB();
    const body = await request.json();
    const { userId, code, isBackupCode } = body;

    if (!userId || !code) {
      return NextResponse.json({ success: false, error: 'userId and code are required' }, { status: 400 });
    }

    const user = await User.findById(userId).lean();
    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 401 });
    }

    const config = await MFAConfig.findOne({ userId, isEnabled: true }).select('+totpSecret +backupCodes +lastUsedCounter');
    if (!config) {
      return NextResponse.json({ success: false, error: 'MFA not configured for this user' }, { status: 400 });
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
        // Replay attack prevention: reject reuse within same time window
        if (config.lastUsedCounter !== undefined && config.lastUsedCounter !== null && result.counter <= config.lastUsedCounter) {
          await createAuditLog(request, {
            tenantId: user.tenantId?.toString() || '',
            action: AuditActions.LOGIN,
            entityType: 'user',
            entityId: userId,
            metadata: { success: false, reason: 'mfa_replay_attempt' },
          });
          return NextResponse.json({ success: false, error: 'TOTP code already used' }, { status: 401 });
        }
        await MFAConfig.findByIdAndUpdate(config._id, { lastUsedCounter: result.counter });
        isValid = true;
      }
    }

    if (!isValid) {
      await createAuditLog(request, {
        tenantId: user.tenantId?.toString() || '',
        action: AuditActions.LOGIN,
        entityType: 'user',
        entityId: userId,
        metadata: { success: false, reason: 'mfa_invalid_code' },
      });
      return NextResponse.json({ success: false, error: 'Invalid MFA code' }, { status: 401 });
    }

    await User.findByIdAndUpdate(userId, { lastLogin: new Date() });

    const token = generateToken({
      userId: user._id.toString(),
      tenantId: user.tenantId?.toString() || '',
      email: user.email,
      role: user.role,
    });

    await createAuditLog(request, {
      tenantId: user.tenantId?.toString() || '',
      action: AuditActions.LOGIN,
      entityType: 'user',
      entityId: userId,
      metadata: { success: true, mfa: true },
    });

    const response = NextResponse.json({
      success: true,
      data: { user: { _id: user._id, email: user.email, name: user.name, role: user.role } },
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'MFA login failed');
  }
}
