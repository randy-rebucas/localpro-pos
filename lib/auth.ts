import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { getUserAuthState } from '@/lib/data/users';
import { getTenantById } from '@/lib/data/tenants';
import { isTokenRevoked, isTokenIssuedBeforeRevocation } from '@/lib/token-blacklist';
import { logger } from '@/lib/logger';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
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
 * Generate JWT token for user
 */
export function generateToken(payload: JWTPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Get user from request (from JWT token or session)
 */
export async function getCurrentUser(request: NextRequest): Promise<{
  userId: string;
  tenantId: string;
  email: string;
  role: string;
} | null> {
  try {
    const token = request.cookies.get('auth-token')?.value || 
                  request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return null;
    }

    // Check if this specific token has been revoked (e.g. after logout)
    if (await isTokenRevoked(token)) {
      return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }

    // Check if all tokens for this user were revoked (e.g. password change)
    const decoded = jwt.decode(token) as { iat?: number } | null;
    if (decoded?.iat && await isTokenIssuedBeforeRevocation(payload.userId, decoded.iat)) {
      return null;
    }

    // Verify user still exists and is active
    const user = await getUserAuthState(payload.userId);

    if (!user || !user.isActive) {
      return null;
    }

    // Guard against missing tenantId before string comparison
    // super_admin users have no tenantId — skip this check
    if (payload.role !== 'super_admin' && user.tenantId && user.tenantId !== payload.tenantId) {
      return null;
    }

    // Deactivated tenants (e.g. suspended for non-payment) lose access even with a
    // still-valid token — login blocks new sessions, this blocks existing ones.
    if (payload.role !== 'super_admin' && user.tenantId) {
      const tenant = await getTenantById(user.tenantId);
      if (!tenant || !tenant.isActive) {
        return null;
      }
    }

    return payload;
  } catch (error) {
    logger.error('Error getting current user:', error);
    return null;
  }
}

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 1,
  cashier: 2,
  manager: 3,
  admin: 4,
  owner: 5,
  super_admin: 6,
};

/**
 * Numeric privilege rank for a role — higher outranks lower. Used for
 * comparing an acting user's privilege against a target user/role, e.g. to
 * stop a manager from editing an admin account, or an admin from minting
 * a new owner.
 */
export function getRoleRank(role: string): number {
  return ROLE_HIERARCHY[role] || 0;
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: string, requiredRoles: string[]): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  return requiredRoles.some(role => ROLE_HIERARCHY[role] <= userLevel);
}

/**
 * Require authentication middleware
 */
export async function requireAuth(request: NextRequest): Promise<JWTPayload> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

/**
 * Require specific role middleware
 */
export async function requireRole(
  request: NextRequest,
  roles: string[]
): Promise<JWTPayload> {
  const user = await requireAuth(request);
  if (!hasRole(user.role, roles)) {
    throw new Error('Forbidden: Insufficient permissions');
  }
  return user;
}

