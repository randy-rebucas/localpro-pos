import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import connectDB from './mongodb';
import Customer from '@/models/Customer';

export interface CustomerJWTPayload {
  customerId: string;
  tenantId: string | null;
  phone?: string;
  email?: string;
}

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Generate JWT token for customer
 */
export function generateCustomerToken(payload: CustomerJWTPayload): string {
  const expiresIn = process.env.CUSTOMER_JWT_EXPIRES_IN || '30d'; // Longer expiry for customers
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Verify customer JWT token
 */
export function verifyCustomerToken(token: string): CustomerJWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as CustomerJWTPayload;
  } catch {
    return null;
  }
}

/**
 * Get customer from request (from JWT token)
 */
export async function getCurrentCustomer(request: NextRequest): Promise<{
  customerId: string;
  tenantId: string | null;
  phone?: string;
  email?: string;
} | null> {
  try {
    const token = request.cookies.get('customer-auth-token')?.value || 
                  request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return null;
    }

    const payload = verifyCustomerToken(token);
    if (!payload) {
      return null;
    }

    // Verify customer still exists and is active
    await connectDB();
    const customer = await Customer.findById(payload.customerId)
      .select('isActive tenantId')
      .lean();
    
    if (!customer || !customer.isActive) {
      return null;
    }

    // Check tenantId match (handle null case)
    const customerTenantId = customer.tenantId ? customer.tenantId.toString() : null;
    if (customerTenantId !== payload.tenantId) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Error getting current customer:', error);
    return null;
  }
}

/**
 * Require customer authentication middleware
 */
export async function requireCustomerAuth(request: NextRequest): Promise<CustomerJWTPayload> {
  const customer = await getCurrentCustomer(request);
  if (!customer) {
    throw new Error('Unauthorized');
  }
  return customer;
}
