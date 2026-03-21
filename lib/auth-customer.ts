import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import connectDB from './mongodb';
import Customer from '@/models/Customer';
import { logger } from '@/lib/logger';

export interface CustomerJWTPayload {
  customerId: string;
  tenantId: string;
  phone?: string;
  email?: string;
}

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is required in production');
    }
    console.warn('WARNING: JWT_SECRET not set. Using insecure default for development only.');
    return 'dev-only-insecure-secret-do-not-use-in-production';
  }
  return secret;
})();

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
  } catch (error) {
    return null;
  }
}

/**
 * Get customer from request (from JWT token)
 */
export async function getCurrentCustomer(request: NextRequest): Promise<{
  customerId: string;
  tenantId: string;
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
    
    if (!customer || !customer.isActive || customer.tenantId.toString() !== payload.tenantId) {
      return null;
    }

    return payload;
  } catch (error) {
    logger.error('Error getting current customer', error);
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
