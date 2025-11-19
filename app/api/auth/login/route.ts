import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateEmail } from '@/lib/validation';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { email, password, tenantSlug } = body;

    // Validation
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

    // Get tenant ID from slug
    const Tenant = (await import('@/models/Tenant')).default;
    const tenant = await Tenant.findOne({ slug: tenantSlug || 'default', isActive: true }).lean();
    
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found or inactive' },
        { status: 404 }
      );
    }

    // Find user with password field - ensure we get a Mongoose document, not a plain object
    const user = await User.findOne({ email: email.toLowerCase(), tenantId: tenant._id })
      .select('+password');

    if (!user || !user.isActive) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if password exists and is a string
    if (!user.password || typeof user.password !== 'string') {
      console.error('User password is missing or invalid for user:', user._id, 'Password type:', typeof user.password);
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password using bcrypt directly (not the method to avoid 'this' context issues)
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } catch (bcryptError: any) {
      console.error('Bcrypt comparison error:', bcryptError);
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    if (!isPasswordValid) {
      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        entityId: user._id.toString(),
        metadata: { success: false, reason: 'invalid_password' },
      });
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
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
      metadata: { success: true },
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
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}

