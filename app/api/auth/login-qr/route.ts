import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { generateToken } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { qrToken, tenantSlug } = body;

    // Validation
    if (!qrToken) {
      return NextResponse.json(
        { success: false, error: 'QR token is required' },
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

    // Find user by QR token
    const user = await User.findOne({ 
      qrToken, 
      tenantId: tenant._id, 
      isActive: true 
    });

    if (!user) {
      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.LOGIN,
        entityType: 'user',
        metadata: { success: false, reason: 'invalid_qr_token', method: 'qr' },
      });
      return NextResponse.json(
        { success: false, error: 'Invalid QR code' },
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
      metadata: { success: true, method: 'qr' },
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
    console.error('QR login error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}

