import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import type { Types as MongooseTypes } from 'mongoose';
import prisma from '@/lib/db';
import { getCurrentUser, verifyToken } from './auth';
import { logger } from '@/lib/logger';

// Callers across app/api/** are migrated to Prisma incrementally; until every
// route is rewritten, some still pass a Mongoose ObjectId here (from models
// not yet ported). Accept both shapes and normalize to a plain string below
// so this stays a drop-in replacement during the transition.
export interface AuditLogData {
  tenantId: string | MongooseTypes.ObjectId;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Create audit log entry.
 *
 * Pass `userId` (and `tenantId`) when the caller has already resolved the user via
 * requireAuth/getCurrentUser/requireTenantAccess earlier in the request handler —
 * this avoids re-running the auth lookup (token revocation + User.findById reads).
 * userId is only re-derived from the request when the caller doesn't already have it.
 */
export async function createAuditLog(
  request: NextRequest,
  data: Omit<AuditLogData, 'userId'> & {
    tenantId?: string | MongooseTypes.ObjectId;
    userId?: string;
  }
): Promise<void> {
  try {
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Only re-fetch the user from the request if the caller didn't already
    // resolve one (and pass its userId/tenantId through) earlier in the handler.
    const user = (data.userId && data.tenantId) ? null : await getCurrentUser(request);
    const resolvedUserId = data.userId ?? user?.userId;

    // Tag entries made during a super-admin impersonation session so the audit
    // trail shows who was really acting, not just the impersonated account.
    // Decoded from the token directly (no DB hit) since callers may have
    // already resolved `user` to skip the getCurrentUser lookup above.
    const tokenValue = request.cookies.get('impersonation-token')?.value ||
      request.cookies.get('auth-token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '');
    const impersonatedBy = user?.impersonatedBy ?? (tokenValue ? verifyToken(tokenValue)?.impersonatedBy : undefined);
    const metadata = impersonatedBy ? { ...data.metadata, impersonatedBy } : data.metadata;

    // Get tenantId from parameter, user, or request
    let tenantId: string;

    if (data.tenantId) {
      // Use provided tenantId — normalize a Mongoose ObjectId (from
      // not-yet-migrated callers) down to a plain string id.
      tenantId = data.tenantId.toString();
    } else if (user) {
      // Get from authenticated user
      tenantId = user.tenantId;
    } else {
      // Try to get from URL (only for non-API routes)
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Skip API routes - they don't have tenant slugs in the path
      if (pathname.startsWith('/api/')) {
        // For API routes without tenant info, try to find default tenant
        const defaultTenant = await prisma.tenant.findFirst({ where: { slug: 'default' } });
        if (defaultTenant) {
          tenantId = defaultTenant.id;
        } else {
          // Can't create audit log without tenant
          console.warn('Cannot create audit log: no tenant available for API route:', pathname);
          return;
        }
      } else {
        // For non-API routes, extract tenant slug
        const tenantMatch = pathname.match(/\/([^/]+)\//);
        const tenantSlug = tenantMatch ? tenantMatch[1] : 'default';

        const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug } });
        if (tenant) {
          tenantId = tenant.id;
        } else {
          console.warn('Cannot create audit log: tenant not found for slug:', tenantSlug);
          return;
        }
      }
    }

    // If a caller passed a slug instead of an actual tenant id, resolve it
    // (Postgres tenant ids are not ObjectId-shaped, so we can't cheaply
    // detect "looks like an id" the way the old Mongo code did — instead we
    // trust ids passed by authenticated callers/requireAuth, and only
    // fall back to a slug lookup when the direct id lookup below misses).
    const tenantExists = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenantExists) {
      const bySlug = await prisma.tenant.findFirst({ where: { slug: tenantId } });
      if (bySlug) {
        tenantId = bySlug.id;
      } else {
        console.warn('Cannot create audit log: tenant not found for id/slug:', tenantId);
        return;
      }
    }

    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        tenantId,
        userId: resolvedUserId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        changes: data.changes,
        metadata,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    // Don't throw - audit logging should not break the application
    logger.error('Error creating audit log:', error);
  }
}

/**
 * Common audit actions
 */
export const AuditActions = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW: 'view',
  LOGIN: 'login',
  LOGOUT: 'logout',
  TRANSACTION_CREATE: 'transaction.create',
  TRANSACTION_CANCEL: 'transaction.cancel',
  TRANSACTION_REFUND: 'transaction.refund',
  STOCK_ADJUST: 'stock.adjust',
  STOCK_PURCHASE: 'stock.purchase',
  DISCOUNT_CREATE: 'discount.create',
  DISCOUNT_UPDATE: 'discount.update',
  DISCOUNT_DELETE: 'discount.delete',
  ATTENDANCE_CLOCK_IN: 'attendance.clock_in',
  ATTENDANCE_CLOCK_OUT: 'attendance.clock_out',
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_REFUND: 'payment.refund',
  INVOICE_CREATE: 'invoice.create',
  INVOICE_UPDATE: 'invoice.update',
  INVOICE_SEND: 'invoice.send',
  INVOICE_MARK_PAID: 'invoice.mark_paid',
  PRESCRIPTION_CREATE: 'prescription.create',
  PRESCRIPTION_UPDATE: 'prescription.update',
  PRESCRIPTION_DISPENSE: 'prescription.dispense',
  PRESCRIPTION_CANCEL: 'prescription.cancel',
  PHARMACY_SETTINGS_UPDATE: 'pharmacy_settings.update',
  EXPIRY_REPORT_VIEW: 'expiry_report.view',
  X_READING_VIEW: 'x_reading.view',
  Z_READING_GENERATE: 'z_reading.generate',
  Z_READING_VIEW: 'z_reading.view',
  CASH_DRAWER_KICK: 'cash_drawer.kick',
  AUDIT_LOG_EXPORT: 'audit_log.export',
  DEVICE_CREATE: 'device.create',
  DEVICE_UPDATE: 'device.update',
  DEVICE_DELETE: 'device.delete',
  SUBSCRIPTION_ACTIVATE: 'subscription.activate',
} as const;
