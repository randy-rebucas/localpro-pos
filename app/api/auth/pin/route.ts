import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import bcrypt from 'bcryptjs';

/**
 * GET /api/auth/pin
 * Returns whether the authenticated user has a PIN set.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const doc = await User.findById(user.userId).select('+pin');
    if (!doc) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    return NextResponse.json({ success: true, data: { hasPinSet: !!doc.pin } });
  } catch (error) {
    return handleApiError(error, 'Failed to get PIN status');
  }
}

/**
 * POST /api/auth/pin
 * Set or update the user's PIN.
 * Body: { pin: string (4-6 digits), currentPassword: string }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`pin-set:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await connectDB();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { pin, currentPassword } = await request.json();

    if (!pin || !currentPassword) {
      return NextResponse.json(
        { success: false, error: 'PIN and current password are required' },
        { status: 400 }
      );
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN must be 4 to 6 digits' },
        { status: 400 }
      );
    }

    const doc = await User.findById(user.userId).select('+password');
    if (!doc) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    const passwordOk = await bcrypt.compare(currentPassword, doc.password);
    if (!passwordOk) {
      return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 401 });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await User.findByIdAndUpdate(user.userId, { pin: pinHash });

    await createAuditLog(request, {
      tenantId: user.tenantId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: user.userId,
      changes: { pinSet: true },
    });

    return NextResponse.json({ success: true, data: { message: 'PIN set successfully' } });
  } catch (error) {
    return handleApiError(error, 'Failed to set PIN');
  }
}

/**
 * DELETE /api/auth/pin
 * Remove the user's PIN.
 * Body: { currentPassword: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`pin-delete:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await connectDB();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { currentPassword } = await request.json();
    if (!currentPassword) {
      return NextResponse.json({ success: false, error: 'Current password is required' }, { status: 400 });
    }

    const doc = await User.findById(user.userId).select('+password');
    if (!doc) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

    const passwordOk = await bcrypt.compare(currentPassword, doc.password);
    if (!passwordOk) {
      return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 401 });
    }

    await User.findByIdAndUpdate(user.userId, { $unset: { pin: '' } });

    await createAuditLog(request, {
      tenantId: user.tenantId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: user.userId,
      changes: { pinRemoved: true },
    });

    return NextResponse.json({ success: true, data: { message: 'PIN removed successfully' } });
  } catch (error) {
    return handleApiError(error, 'Failed to remove PIN');
  }
}
