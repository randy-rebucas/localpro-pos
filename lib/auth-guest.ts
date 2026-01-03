import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface GuestJWTPayload {
  guestId: string;
  tenantId: string;
  type: 'guest';
}

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Generate a unique guest ID
 */
export function generateGuestId(): string {
  return `guest_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Generate JWT token for guest user
 */
export function generateGuestToken(payload: GuestJWTPayload): string {
  const expiresIn = process.env.GUEST_JWT_EXPIRES_IN || '7d'; // 7 days for guest sessions
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Verify guest JWT token
 */
export function verifyGuestToken(token: string): GuestJWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as GuestJWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Get guest session from request (from JWT token)
 */
export async function getCurrentGuest(request: NextRequest): Promise<{
  guestId: string;
  tenantId: string;
} | null> {
  try {
    const token = request.cookies.get('guest-token')?.value || 
                  request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return null;
    }

    const payload = verifyGuestToken(token);
    if (!payload || payload.type !== 'guest') {
      return null;
    }

    return {
      guestId: payload.guestId,
      tenantId: payload.tenantId,
    };
  } catch (error) {
    console.error('Error getting current guest:', error);
    return null;
  }
}

/**
 * Require guest authentication middleware (optional - doesn't throw if not present)
 */
export async function getGuestSession(request: NextRequest): Promise<GuestJWTPayload | null> {
  const guest = await getCurrentGuest(request);
  if (!guest) return null;
  return {
    ...guest,
    type: 'guest' as const,
  };
}
