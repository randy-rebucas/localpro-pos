import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import connectDB from './mongodb';
import AuditLog from '@/models/AuditLog';
import { getCurrentUser } from './auth';

export interface AuditLogData {
  tenantId: string | mongoose.Types.ObjectId;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Create audit log entry
 */
export async function createAuditLog(
  request: NextRequest,
  data: Omit<AuditLogData, 'userId'> & { tenantId?: string | mongoose.Types.ObjectId }
): Promise<void> {
  try {
    await connectDB();
    
    const user = await getCurrentUser(request);
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

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
      userId: user?.userId,
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
    console.error('Error creating audit log:', error);
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
} as const;

