import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { generateCustomerToken } from '@/lib/auth-customer';
import { validateEmail } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * POST - Login customer with email/password
 * Body: { email: string, password: string, tenantSlug?: string }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();
    const { email, password, tenantSlug } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: t('validation.emailPasswordRequired', 'Email and password are required') },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidEmailFormat', 'Invalid email format') },
        { status: 400 }
      );
    }

    // Get tenant ID
    const Tenant = (await import('@/models/Tenant')).default;
    const tenant = await Tenant.findOne({ 
      slug: tenantSlug || 'default', 
      isActive: true 
    }).lean();
    
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Find customer with password field
    const customer = await Customer.findOne({
      tenantId: tenant._id,
      email: email.toLowerCase(),
      isActive: true,
    }).select('+password');

    if (!customer) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid email or password') },
        { status: 401 }
      );
    }

    // Check if customer has a password set
    if (!customer.password) {
      return NextResponse.json(
        { 
          success: false, 
          error: t('validation.passwordNotSet', 'Password not set. Please use phone OTP verification or set a password.') 
        },
        { status: 401 }
      );
    }

    // Verify password
    const isPasswordValid = await customer.comparePassword(password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidCredentials', 'Invalid email or password') },
        { status: 401 }
      );
    }

    // Update last login
    await Customer.findByIdAndUpdate(customer._id, { lastLogin: new Date() });

    // Generate JWT token
    const token = generateCustomerToken({
      customerId: customer._id.toString(),
      tenantId: tenant._id.toString(),
      email: customer.email,
      phone: customer.phone,
    });

    // Set cookie
    const response = NextResponse.json({
      success: true,
      data: {
        customer: {
          _id: customer._id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
        },
        token,
      },
    });

    response.cookies.set('customer-auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error: any) {
    console.error('Customer login error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Login failed' },
      { status: 500 }
    );
  }
}
