import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import { generateCustomerToken } from '@/lib/auth-customer';
import { verifyFacebookToken, parseName } from '@/lib/facebook-auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * POST - Authenticate customer with Facebook
 * Body: { accessToken: string, tenantSlug?: string }
 * Returns: { success: boolean, data: { token: string, user: Customer } }
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string = (key: string, fallback: string) => fallback;
  try {
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();
    const { accessToken, tenantSlug } = body;

    // Validation
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: t('validation.accessTokenRequired', 'Facebook access token is required') },
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

    // Verify Facebook access token and get user info
    const facebookUser = await verifyFacebookToken(accessToken);

    if (!facebookUser) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidFacebookToken', 'Invalid or expired Facebook token') },
        { status: 401 }
      );
    }

    // Extract user information from Facebook profile
    const facebookId = facebookUser.id;
    const email = facebookUser.email?.toLowerCase();
    const firstName = facebookUser.first_name || (facebookUser.name ? parseName(facebookUser.name).firstName : '');
    const lastName = facebookUser.last_name || (facebookUser.name ? parseName(facebookUser.name).lastName : '');

    if (!firstName) {
      return NextResponse.json(
        { success: false, error: t('validation.facebookNameRequired', 'Unable to retrieve name from Facebook profile') },
        { status: 400 }
      );
    }

    // Find existing customer by Facebook ID
    let customer = await Customer.findOne({
      tenantId: tenant._id,
      facebookId,
      isActive: true,
    });

    // If not found by Facebook ID, try to find by email (for account linking)
    if (!customer && email) {
      customer = await Customer.findOne({
        tenantId: tenant._id,
        email,
        isActive: true,
      });

      // If found by email, link Facebook ID to existing account
      if (customer) {
        customer.facebookId = facebookId;
        // Update name if not set
        if (!customer.firstName) customer.firstName = firstName;
        if (!customer.lastName) customer.lastName = lastName;
        await customer.save();
      }
    }

    // Create new customer if doesn't exist
    if (!customer) {
      customer = await Customer.create({
        tenantId: tenant._id,
        facebookId,
        email: email || undefined,
        firstName,
        lastName: lastName || 'User', // Ensure lastName is not empty
        isActive: true,
      });
    } else {
      // Update last login
      customer.lastLogin = new Date();
      // Update email if not set and Facebook provides it
      if (!customer.email && email) {
        customer.email = email;
      }
      // Update name if changed on Facebook
      if (firstName && customer.firstName !== firstName) {
        customer.firstName = firstName;
      }
      if (lastName && customer.lastName !== lastName) {
        customer.lastName = lastName;
      }
      await customer.save();
    }

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
        token,
        user: {
          _id: customer._id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          facebookId: customer.facebookId,
        },
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
    console.error('Facebook authentication error:', error);
    
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
        { success: false, error: t('validation.accountAlreadyExists', 'An account with this Facebook profile already exists') },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Facebook authentication failed' },
      { status: 500 }
    );
  }
}
