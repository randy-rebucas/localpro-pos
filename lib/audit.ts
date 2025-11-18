import { NextRequest } from 'next/server';
import connectDB from './mongodb';
import AuditLog from '@/models/AuditLog';
import { getCurrentUser } from './auth';

export interface AuditLogData {
  tenantId: string;
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
  data: Omit<AuditLogData, 'tenantId' | 'userId'>
): Promise<void> {
  try {
    await connectDB();
    
    const user = await getCurrentUser(request);
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Get tenantId from user or request
    let tenantId: string;
    if (user) {
      tenantId = user.tenantId;
    } else {
      // Try to get from URL or headers
      const url = new URL(request.url);
      const tenantMatch = url.pathname.match(/\/([^/]+)\//);
      tenantId = tenantMatch ? tenantMatch[1] : 'default';
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
} as const;

