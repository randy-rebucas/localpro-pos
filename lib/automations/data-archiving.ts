/**
 * Automated Data Archiving
 * Automatically archive old data to reduce database size
 */

import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import { AutomationResult } from './types';
import mongoose from 'mongoose';

export interface DataArchivingOptions {
  tenantId?: string;
  archiveYears?: number; // Years to keep before archiving (default: 2)
  collections?: string[]; // Collections to archive (default: ['transactions'])
}

/**
 * Archive old data to reduce database size
 */
export async function archiveOldData(
  options: DataArchivingOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const archiveYears = options.archiveYears || 2;
    const collections = options.collections || ['transactions'];
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - archiveYears);

    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await Tenant.find({ status: 'active' }).lean();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalArchived = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const db = mongoose.connection.db;
        if (!db) continue;

        // Create archive collection if it doesn't exist
        const archiveCollectionName = `${collections[0]}_archive`;

        for (const collectionName of collections) {
          try {
            const collection = db.collection(collectionName);
            
            // Find old documents
            const oldDocuments = await collection.find({
              tenantId: new mongoose.Types.ObjectId(tenantId),
              createdAt: { $lt: cutoffDate },
            }).limit(1000).toArray(); // Process in batches

            if (oldDocuments.length === 0) {
              continue;
            }

            // Move to archive collection
            const archiveCollection = db.collection(`${collectionName}_archive`);
            await archiveCollection.insertMany(oldDocuments.map(doc => ({
              ...doc,
              archivedAt: new Date(),
              originalCollection: collectionName,
            })));

            // Delete from original collection
            const ids = oldDocuments.map(doc => doc._id);
            await collection.deleteMany({
              _id: { $in: ids },
            });

            totalArchived += oldDocuments.length;
          } catch (error: any) {
            totalFailed++;
            results.errors?.push(`Collection ${collectionName}: ${error.message}`);
          }
        }
      } catch (error: any) {
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalArchived;
    results.failed = totalFailed;
    results.message = `Archived ${totalArchived} records${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error archiving data: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
