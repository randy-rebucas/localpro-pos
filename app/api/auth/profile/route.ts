import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { validateEmail, validatePassword } from '@/lib/validation';
import { createAuditLog, AuditActions } from '@/lib/audit';

/**
 * GET - Get current user's profile
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    await connectDB();
    let user = await User.findById(currentUser.userId)
      .select('-password')
      .lean();

    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: 'User not found or inactive' }, { status: 401 });
    }

    // Generate QR token if it doesn't exist
    if (!user.qrToken) {
      const newQrToken = currentUser.userId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
      await User.findByIdAndUpdate(currentUser.userId, { qrToken: newQrToken });
      user = await User.findById(currentUser.userId).select('-password').lean();
      
      if (!user) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        hasPin: !!user.pin,
        qrToken: user.qrToken || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PUT - Update current user's profile
 */
export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    await connectDB();
    const body = await request.json();
    const { email, password, name, currentPassword, pin, currentPin } = body;

    const oldUser = await User.findById(currentUser.userId).lean();
    if (!oldUser || !oldUser.isActive) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Build update object
    const updateData: any = {};
    
    if (email !== undefined && email !== oldUser.email) {
      if (!validateEmail(email)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email format' },
          { status: 400 }
        );
      }
      updateData.email = email.toLowerCase();
    }
    
    if (name !== undefined && name !== oldUser.name) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: 'Name is required' },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    
    // Password change requires current password
    if (password !== undefined && password) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Current password is required to change password' },
          { status: 400 }
        );
      }

      // Verify current password
      const userDoc = await User.findById(currentUser.userId).select('+password');
      if (!userDoc) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }

      const isPasswordValid = await userDoc.comparePassword(currentPassword);
      if (!isPasswordValid) {
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect' },
          { status: 400 }
        );
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return NextResponse.json(
          { success: false, error: 'Password validation failed', errors: passwordValidation.errors },
          { status: 400 }
        );
      }
      updateData.password = password;
    }

    // PIN management
    if (pin !== undefined) {
      // Validate PIN format (4-8 digits)
      if (!/^\d{4,8}$/.test(pin)) {
        return NextResponse.json(
          { success: false, error: 'PIN must be 4-8 digits' },
          { status: 400 }
        );
      }

      // If user already has a PIN, require current PIN
      if (oldUser.pin) {
        if (!currentPin) {
          return NextResponse.json(
            { success: false, error: 'Current PIN is required to change PIN' },
            { status: 400 }
          );
        }

        // Verify current PIN
        const userDoc = await User.findById(currentUser.userId).select('+pin');
        if (!userDoc) {
          return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const isPINValid = await userDoc.comparePIN(currentPin);
        if (!isPINValid) {
          return NextResponse.json(
            { success: false, error: 'Current PIN is incorrect' },
            { status: 400 }
          );
        }
      }

      updateData.pin = pin;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No changes provided' },
        { status: 400 }
      );
    }

    const user = await User.findByIdAndUpdate(
      currentUser.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Track changes (excluding password and PIN details)
    const changes: Record<string, any> = {};
    Object.keys(updateData).forEach(key => {
      if (key !== 'password' && key !== 'pin' && oldUser[key as keyof typeof oldUser] !== updateData[key]) {
        changes[key] = {
          old: oldUser[key as keyof typeof oldUser],
          new: updateData[key],
        };
      }
    });
    if (password) {
      changes.password = { changed: true };
    }
    if (pin) {
      changes.pin = { changed: true };
    }

    await createAuditLog(request, {
      tenantId: currentUser.tenantId,
      action: AuditActions.UPDATE,
      entityType: 'user',
      entityId: currentUser.userId,
      changes,
    });
    
    return NextResponse.json({ 
      success: true, 
      data: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        hasPin: !!user.pin,
        qrToken: user.qrToken || null,
      }
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

