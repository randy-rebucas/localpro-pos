import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import connectDB from './mongodb';
import User from '@/models/User';
import { isTokenRevoked, isTokenIssuedBeforeRevocation } from '@/lib/token-blacklist';
import { logger } from '@/lib/logger';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  /** Present only for API key auth. Scoped permissions e.g. ['transactions:read', 'products:write'] */
  apiKeyPermissions?: string[];
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
 * Authenticate via API key (Bearer sk_live_... header)
 * Returns a synthetic user-like payload for API key requests
 */
async function authenticateApiKey(rawKey: string): Promise<JWTPayload | null> {
  try {
    const { default: ApiKey } = await import('@/models/ApiKey');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await ApiKey.findOne({ keyHash, isActive: true }).lean();
    if (!apiKey) return null;
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return null;

    // Update lastUsedAt without awaiting to not block the request
    ApiKey.findByIdAndUpdate(apiKey._id, { lastUsedAt: new Date() }).exec();

    // Derive role from permissions: empty permissions = full owner access;
    // any write/delete/admin permission = admin; read-only = viewer
    let role = 'owner';
    const perms: string[] = apiKey.permissions || [];
    if (perms.length > 0) {
      const hasWrite = perms.some(p => p.endsWith(':write') || p.endsWith(':delete') || p.endsWith(':admin') || p.endsWith(':*'));
      role = hasWrite ? 'admin' : 'viewer';
    }

    return {
      userId: apiKey.createdBy.toString(),
      tenantId: apiKey.tenantId.toString(),
      email: `apikey:${apiKey._id}`,
      role,
      apiKeyPermissions: perms.length > 0 ? perms : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Check if an API key user has a specific scoped permission.
 * For non-API-key users (no apiKeyPermissions), this always returns true (role-based auth applies instead).
 * Format: 'resource:action' e.g. 'transactions:read', 'products:write'
 */
export function hasApiKeyPermission(user: JWTPayload, permission: string): boolean {
  if (!user.apiKeyPermissions) return true; // Not an API key, use role-based auth
  return user.apiKeyPermissions.some(p => {
    if (p === permission) return true;
    // Wildcard: 'transactions:*' matches 'transactions:read'
    const [pResource, pAction] = p.split(':');
    const [rResource, rAction] = permission.split(':');
    return pResource === rResource && (pAction === '*' || pAction === rAction);
  });
}

/**
 * Get user from request (from JWT token, session, or API key)
 */
export async function getCurrentUser(request: NextRequest): Promise<{
  userId: string;
  tenantId: string;
  email: string;
  role: string;
} | null> {
  try {
    const authHeader = request.headers.get('authorization');
    const rawToken = request.cookies.get('auth-token')?.value || authHeader?.replace('Bearer ', '');

    // Detect API key (starts with sk_live_)
    if (rawToken?.startsWith('sk_live_')) {
      await connectDB();
      return await authenticateApiKey(rawToken);
    }

    const token = rawToken;

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
    await connectDB();
    const user = await User.findById(payload.userId).select('isActive tenantId').lean();

    if (!user || !user.isActive) {
      return null;
    }

    // Guard against missing tenantId before string comparison
    // super_admin users have no tenantId — skip this check
    if (payload.role !== 'super_admin' && user.tenantId && user.tenantId.toString() !== payload.tenantId) {
      return null;
    }

    return payload;
  } catch (error) {
    logger.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: string, requiredRoles: string[]): boolean {
  const roleHierarchy: Record<string, number> = {
    viewer: 1,
    cashier: 2,
    manager: 3,
    admin: 4,
    owner: 5,
    super_admin: 6,
  };

  const userLevel = roleHierarchy[userRole] || 0;
  return requiredRoles.some(role => roleHierarchy[role] <= userLevel);
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

