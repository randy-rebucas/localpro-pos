import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';

/**
 * POST /api/auth/pin/verify
 * Verify the user's credential to unlock the app.
 *
 * Logic:
 *  - If the user has a PIN set  → compare credential against PIN hash
 *  - If no PIN is set           → compare credential against password (password is the default)
 *
 * Body: { credential: string }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    // Tight rate limit — this endpoint is the brute-force target for the lock screen
    const rl = checkRateLimit(`pin-verify:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await connectDB();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { credential } = await request.json();
    if (!credential) {
      return NextResponse.json({ success: false, error: 'Credential is required' }, { status: 400 });
    }

    const doc = await User.findById(user.userId).select('+pin +password');
    if (!doc) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    let isValid = false;

    if (doc.pin) {
      // User has a PIN — verify against it
      isValid = await bcrypt.compare(credential, doc.pin);
    } else {
      // No PIN set — fall back to password
      isValid = await bcrypt.compare(credential, doc.password);
    }

    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Incorrect credential' }, { status: 401 });
    }

    return NextResponse.json({ success: true, data: { unlocked: true } });
  } catch (error) {
    return handleApiError(error, 'Verification failed');
  }
}
