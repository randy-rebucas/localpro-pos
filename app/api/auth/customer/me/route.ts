import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getCurrentCustomer } from '@/lib/auth-customer';
import Customer from '@/models/Customer';

/**
 * GET - Get current authenticated customer
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const customerAuth = await getCurrentCustomer(request);
    
    if (!customerAuth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get full customer details
    const customer = await Customer.findById(customerAuth.customerId)
      .select('-password')
      .lean();

    if (!customer || !customer.isActive) {
      return NextResponse.json(
        { success: false, error: 'Customer not found or inactive' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      customer: {
        _id: customer._id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        addresses: customer.addresses,
        dateOfBirth: customer.dateOfBirth,
        tags: customer.tags,
        totalSpent: customer.totalSpent,
        lastPurchaseDate: customer.lastPurchaseDate,
        lastLogin: customer.lastLogin,
      },
    });
  } catch (error: any) {
    console.error('Get customer error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get customer' },
      { status: 500 }
    );
  }
}
