import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Tenant from '@/models/Tenant';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateEmail } from '@/lib/validation';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

/**
 * Mobile-specific login — returns the JWT in the response body instead of
 * an httpOnly cookie, because React Native cannot access httpOnly cookies.
 *
 * Accepts the same credentials as POST /api/auth/login but requires the
 * tenant slug so the mobile app can target a specific store.
 *
 * Rate limit: 10 attempts / 15 min per IP (same as web login).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`mobile-login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await connectDB();

    const body = await request.json();
    const { email, password, tenantSlug } = body as {
      email?: string;
      password?: string;
      tenantSlug?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'tenantSlug is required' },
        { status: 400 }
      );
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean();
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Store not found or inactive' },
        { status: 404 }
      );
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      tenantId: tenant._id,
    }).select('+password');

    const failedLogin = async (reason: string) => {
      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        metadata: { success: false, reason, channel: 'mobile' },
      });
    };

    if (!user || !user.isActive) {
      await failedLogin('user_not_found');
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    if (!user.password || typeof user.password !== 'string') {
      logger.error('Mobile login: password field missing', { userId: user._id });
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password).catch(() => false);
    if (!valid) {
      await failedLogin('invalid_password');
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // Only admin / owner roles may use the mobile scanner
    const allowedRoles = ['admin', 'owner', 'manager', 'super_admin'];
    if (!allowedRoles.includes(user.role)) {
      await failedLogin('insufficient_role');
      return NextResponse.json(
        { success: false, error: 'Your account does not have access to the mobile scanner' },
        { status: 403 }
      );
    }

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    const token = generateToken({
      userId: user._id.toString(),
      tenantId: tenant._id.toString(),
      email: user.email,
      role: user.role,
    });

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.LOGIN,
      entityType: 'user',
      entityId: user._id.toString(),
      metadata: { success: true, channel: 'mobile' },
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        access_token: token, // alias for clients that expect this key
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        },
        tenant: {
          id: tenant._id.toString(),
          name: tenant.name,
          slug: tenant.slug,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'Login failed');
  }
}
