import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import connectDB from './mongodb';
import AuditLog from '@/models/AuditLog';
import { getCurrentUser } from './auth';
import { logger } from '@/lib/logger';

export interface AuditLogData {
  tenantId: string | mongoose.Types.ObjectId;
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
    tenantId?: string | mongoose.Types.ObjectId;
    userId?: string;
  }
): Promise<void> {
  try {
    await connectDB();

    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Only re-fetch the user from the request if the caller didn't already
    // resolve one (and pass its userId/tenantId through) earlier in the handler.
    const user = (data.userId && data.tenantId) ? null : await getCurrentUser(request);
    const resolvedUserId = data.userId ?? user?.userId;

    // Get tenantId from parameter, user, or request
    let tenantId: string | mongoose.Types.ObjectId;

    if (data.tenantId) {
      // Use provided tenantId (could be ObjectId or string)
      tenantId = data.tenantId;
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
        const Tenant = (await import('@/models/Tenant')).default;
        const defaultTenant = await Tenant.findOne({ slug: 'default' }).lean();
        if (defaultTenant) {
          tenantId = defaultTenant._id;
        } else {
          // Can't create audit log without tenant
          console.warn('Cannot create audit log: no tenant available for API route:', pathname);
          return;
        }
      } else {
        // For non-API routes, extract tenant slug and convert to ObjectId
        const tenantMatch = pathname.match(/\/([^/]+)\//);
        const tenantSlug = tenantMatch ? tenantMatch[1] : 'default';
        
        // Convert slug to ObjectId
        const Tenant = (await import('@/models/Tenant')).default;
        const tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
        if (tenant) {
          tenantId = tenant._id;
        } else {
          console.warn('Cannot create audit log: tenant not found for slug:', tenantSlug);
          return;
        }
      }
    }

    // Ensure tenantId is an ObjectId
    if (typeof tenantId === 'string') {
      // Check if it's already a valid ObjectId string
      if (mongoose.Types.ObjectId.isValid(tenantId)) {
        tenantId = new mongoose.Types.ObjectId(tenantId);
      } else {
        // It's a slug, need to look up the tenant
        const Tenant = (await import('@/models/Tenant')).default;
        const tenant = await Tenant.findOne({ slug: tenantId }).lean();
        if (tenant) {
          tenantId = tenant._id;
        } else {
          console.warn('Cannot create audit log: tenant not found for slug:', tenantId);
          return;
        }
      }
    }

    await AuditLog.create({
      tenantId,
      userId: resolvedUserId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      changes: data.changes,
      metadata: data.metadata,
      ipAddress,
      userAgent,
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
} as const;

