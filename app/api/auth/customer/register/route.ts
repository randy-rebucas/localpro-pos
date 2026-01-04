import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { generateCustomerToken } from '@/lib/auth-customer';
import { validateEmail } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * POST - Register a new customer with email/password
 * Body: { email: string, password: string, firstName: string, lastName: string, phone?: string, tenantSlug?: string }
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string = (key: string, fallback: string) => fallback;
  try {
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();
    const { email, password, firstName, lastName, phone, tenantSlug } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: t('validation.emailPasswordRequired', 'Email and password are required') },
        { status: 400 }
      );
    }

    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: t('validation.nameRequired', 'First name and last name are required') },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidEmailFormat', 'Invalid email format') },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: t('validation.passwordMinLength', 'Password must be at least 8 characters') },
        { status: 400 }
      );
    }

    // Get tenant ID - for mobile, tenantSlug is optional (can be null)
    let tenantId = null;
    
    if (tenantSlug) {
      const Tenant = (await import('@/models/Tenant')).default;
      const tenant = await Tenant.findOne({ 
        slug: tenantSlug, 
        isActive: true 
      }).lean();
      
      if (!tenant) {
        return NextResponse.json(
          { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
          { status: 404 }
        );
      }
      
      tenantId = tenant._id;
    }

    // Check if customer with email already exists
    // If tenantId is null, check if email exists with null tenantId
    // If tenantId is provided, check in that specific tenant
    const existingCustomerQuery: { email: string; tenantId?: unknown } = {
      email: email.toLowerCase(),
    };
    
    if (tenantId) {
      existingCustomerQuery.tenantId = tenantId;
    } else {
      // For null tenantId, check if email exists with null tenantId
      existingCustomerQuery.tenantId = null;
    }
    
    const existingCustomer = await Customer.findOne(existingCustomerQuery);

    if (existingCustomer) {
      return NextResponse.json(
        { success: false, error: t('validation.emailAlreadyExists', 'An account with this email already exists') },
        { status: 409 }
      );
    }

    // Normalize phone if provided
    const normalizedPhone = phone ? phone.replace(/\D/g, '') : undefined;

    // Create new customer
    const customer = await Customer.create({
      tenantId: tenantId, // Can be null for mobile customers
      email: email.toLowerCase(),
      password, // Will be hashed by pre-save hook
      firstName,
      lastName,
      phone: normalizedPhone,
      isActive: true,
    });

    // Generate JWT token
    const token = generateCustomerToken({
      customerId: customer._id.toString(),
      tenantId: tenantId ? tenantId.toString() : null,
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
  } catch (error: unknown) {
    console.error('Customer registration error:', error);
    
    // Get translator if not already available (in case error occurred before assignment)
    try {
      if (t === ((key: string, fallback: string) => fallback)) {
        t = await getValidationTranslatorFromRequest(request);
      }
    } catch {
      // Keep default fallback translator
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: t('validation.emailAlreadyExists', 'An account with this email already exists') },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Registration failed' },
      { status: 500 }
    );
  }
}
