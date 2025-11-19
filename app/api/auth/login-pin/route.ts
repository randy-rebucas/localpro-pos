import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { pin, tenantSlug } = body;

    // Validation
    if (!pin) {
      return NextResponse.json(
        { success: false, error: 'PIN is required' },
        { status: 400 }
      );
    }

    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN must be 4-8 digits' },
        { status: 400 }
      );
    }

    // Get tenant ID from slug
    const Tenant = (await import('@/models/Tenant')).default;
    const tenant = await Tenant.findOne({ slug: tenantSlug || 'default', isActive: true }).lean();
    
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found or inactive' },
        { status: 404 }
      );
    }

    // Find all active users with PINs for this tenant
    const users = await User.find({ tenantId: tenant._id, isActive: true })
      .select('+pin');

    if (!users || users.length === 0) {
      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        metadata: { success: false, reason: 'no_users', method: 'pin' },
      });
      return NextResponse.json(
        { success: false, error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    // Try to find user with matching PIN
    let user = null;
    for (const u of users) {
      if (u.pin) {
        const isPINValid = await bcrypt.compare(pin, u.pin);
        if (isPINValid) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        metadata: { success: false, reason: 'invalid_pin', method: 'pin' },
      });
      return NextResponse.json(
        { success: false, error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    // Update last login
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      tenantId: tenant._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.LOGIN,
      entityType: 'user',
      entityId: user._id.toString(),
      metadata: { success: true, method: 'pin' },
    });

    // Set cookie
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('PIN login error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}

