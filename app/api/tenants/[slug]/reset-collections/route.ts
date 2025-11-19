import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import Product from '@/models/Product';
import Transaction from '@/models/Transaction';
import Category from '@/models/Category';
import StockMovement from '@/models/StockMovement';
import Expense from '@/models/Expense';
import Discount from '@/models/Discount';
import Branch from '@/models/Branch';
import CashDrawerSession from '@/models/CashDrawerSession';
import ProductBundle from '@/models/ProductBundle';
import Attendance from '@/models/Attendance';
import mongoose from 'mongoose';

// Map collection names to their models
const COLLECTION_MODELS: Record<string, any> = {
  products: Product,
  transactions: Transaction,
  categories: Category,
  stockMovements: StockMovement,
  expenses: Expense,
  discounts: Discount,
  branches: Branch,
  cashDrawerSessions: CashDrawerSession,
  productBundles: ProductBundle,
  attendance: Attendance,
};

// Backup endpoint - GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const { slug } = await params;
    
    const tenant = await Tenant.findOne({ slug, isActive: true });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const collectionsParam = searchParams.get('collections');
    const collections = collectionsParam ? collectionsParam.split(',') : Object.keys(COLLECTION_MODELS);

    // Validate collection names
    const invalidCollections = collections.filter(
      (col: string) => !COLLECTION_MODELS[col]
    );
    if (invalidCollections.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid collections: ${invalidCollections.join(', ')}` },
        { status: 400 }
      );
    }

    const backup: Record<string, any[]> = {};
    const counts: Record<string, number> = {};

    // Export data from each collection
    for (const collectionName of collections) {
      const Model = COLLECTION_MODELS[collectionName];
      const documents = await Model.find({ tenantId: tenant._id }).lean();
      backup[collectionName] = documents;
      counts[collectionName] = documents.length;
    }

    const backupData = {
      version: '1.0',
      tenantSlug: slug,
      tenantName: tenant.name,
      createdAt: new Date().toISOString(),
      collections: backup,
      counts,
    };

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.VIEW,
      entityType: 'collections',
      entityId: 'backup',
      changes: {
        collections: collections,
        counts: counts,
      },
    });

    // Return as JSON with download headers
    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="backup-${slug}-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    console.error('Error creating backup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create backup' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const { slug } = await params;
    
    const tenant = await Tenant.findOne({ slug, isActive: true });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { collections } = body;

    if (!Array.isArray(collections) || collections.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Collections array is required' },
        { status: 400 }
      );
    }

    // Validate collection names
    const invalidCollections = collections.filter(
      (col: string) => !COLLECTION_MODELS[col]
    );
    if (invalidCollections.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid collections: ${invalidCollections.join(', ')}` },
        { status: 400 }
      );
    }

    const results: Record<string, { deleted: number }> = {};

    // Delete documents for each collection
    for (const collectionName of collections) {
      const Model = COLLECTION_MODELS[collectionName];
      const result = await Model.deleteMany({ tenantId: tenant._id });
      results[collectionName] = { deleted: result.deletedCount || 0 };
    }

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.DELETE,
      entityType: 'collections',
      entityId: 'reset',
      changes: {
        collections: collections,
        results: results,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: `Successfully reset ${collections.length} collection(s)`,
        results,
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    console.error('Error resetting collections:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to reset collections' },
      { status: 500 }
    );
  }
}

// Restore endpoint - PUT
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const { slug } = await params;
    
    const tenant = await Tenant.findOne({ slug, isActive: true });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { backupData, clearExisting = false } = body;

    if (!backupData || !backupData.collections) {
      return NextResponse.json(
        { success: false, error: 'Invalid backup data format' },
        { status: 400 }
      );
    }

    const results: Record<string, { restored: number; cleared: number }> = {};

    // Restore each collection
    for (const [collectionName, documents] of Object.entries(backupData.collections)) {
      if (!COLLECTION_MODELS[collectionName]) {
        continue; // Skip invalid collections
      }

      const Model = COLLECTION_MODELS[collectionName];
      let cleared = 0;

      // Clear existing data if requested
      if (clearExisting) {
        const deleteResult = await Model.deleteMany({ tenantId: tenant._id });
        cleared = deleteResult.deletedCount || 0;
      }

      // Restore documents
      if (Array.isArray(documents) && documents.length > 0) {
        // Replace tenantId with current tenant's ID and convert _id strings to ObjectIds
        const documentsToInsert = documents.map((doc: any) => {
          const newDoc = { ...doc };
          // Remove _id to let MongoDB create new ones (or keep if you want to preserve IDs)
          delete newDoc._id;
          // Ensure tenantId is set correctly
          newDoc.tenantId = tenant._id;
          // Convert any ObjectId strings to ObjectIds
          Object.keys(newDoc).forEach(key => {
            if (typeof newDoc[key] === 'string' && mongoose.Types.ObjectId.isValid(newDoc[key]) && key.endsWith('Id')) {
              newDoc[key] = new mongoose.Types.ObjectId(newDoc[key]);
            }
          });
          // Handle nested ObjectIds in arrays (like items.product in transactions)
          if (newDoc.items && Array.isArray(newDoc.items)) {
            newDoc.items = newDoc.items.map((item: any) => {
              if (item.product && typeof item.product === 'string' && mongoose.Types.ObjectId.isValid(item.product)) {
                item.product = new mongoose.Types.ObjectId(item.product);
              }
              return item;
            });
          }
          return newDoc;
        });

        await Model.insertMany(documentsToInsert, { ordered: false });
        results[collectionName] = { restored: documentsToInsert.length, cleared };
      } else {
        results[collectionName] = { restored: 0, cleared };
      }
    }

    // Create audit log
    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.UPDATE,
      entityType: 'collections',
      entityId: 'restore',
      changes: {
        collections: Object.keys(backupData.collections),
        results: results,
        clearExisting,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        message: `Successfully restored ${Object.keys(backupData.collections).length} collection(s)`,
        results,
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    console.error('Error restoring backup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to restore backup' },
      { status: 500 }
    );
  }
}

