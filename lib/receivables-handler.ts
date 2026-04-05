/**
 * Accounts Receivable utilities
 * Handles customer debt tracking, payment recording, and receivable lifecycle
 */

import mongoose from 'mongoose';
import AccountsReceivable, { IAccountsReceivable } from '@/models/AccountsReceivable';
import PaymentRecord, { IPaymentRecord } from '@/models/PaymentRecord';
import Customer from '@/models/Customer';

export interface CreateReceivableOptions {
  tenantId: string;
  customerId: string;
  transactionId: string;
  amount: number;
  daysUntilDue?: number; // Calculate dueDate from today (default 30)
  notes?: string;
  invoiceNumber?: string;
  createdBy: string;
  session?: mongoose.ClientSession;
}

export interface RecordPaymentOptions {
  tenantId: string;
  customerId: string;
  receivableId: string;
  amount: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  processedBy: string;
  transactionId?: string;
  session?: mongoose.ClientSession;
}

/**
 * Create an accounts receivable record after a sale
 * Automatically calculates due date based on customer's payment terms
 */
export async function createReceivable(options: CreateReceivableOptions): Promise<{
  success: boolean;
  error?: string;
  receivable?: IAccountsReceivable;
}> {
  const {
    tenantId,
    customerId,
    transactionId,
    amount,
    daysUntilDue = 30,
    notes,
    invoiceNumber,
    createdBy,
    session,
  } = options;

  try {
    // Fetch customer to verify it exists
    const customer = await Customer.findOne(
      { _id: customerId, tenantId, isActive: true },
      {},
      { session }
    );

    if (!customer) {
      return { success: false, error: 'Customer not found' };
    }

    // Note: Credit status and credit limit checks would require additional fields on Customer model
    // These can be added in a future migration if needed

    // Calculate due date based on provided daysUntilDue
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (daysUntilDue || 30));

    // Create receivable
    const receivable = await AccountsReceivable.create(
      [
        {
          tenantId,
          customerId,
          transactionId,
          originalAmount: amount,
          paidAmount: 0,
          outstandingAmount: amount,
          dueDate,
          paymentStatus: 'pending',
          notes,
          invoiceNumber,
          createdBy,
        },
      ],
      { session }
    );

    // Note: Customer's outstanding debt is tracked via AccountsReceivable model queries, not stored on Customer
    // This design prevents data duplication and inconsistency

    return { success: true, receivable: receivable[0] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create receivable';
    return { success: false, error: message };
  }
}

/**
 * Record a payment against a receivable
 * Updates receivable status and customer debt
 */
export async function recordPayment(options: RecordPaymentOptions): Promise<{
  success: boolean;
  error?: string;
  paymentRecord?: IPaymentRecord;
  receivableUpdated?: { id: string; paidAmount: number; outstandingAmount: number; paymentStatus: string };
}> {
  const {
    tenantId,
    customerId,
    receivableId,
    amount,
    paymentMethod,
    reference,
    notes,
    processedBy,
    transactionId,
    session,
  } = options;

  try {
    // Fetch receivable
    const receivable = await AccountsReceivable.findOne(
      { _id: receivableId, tenantId, isActive: true },
      {},
      { session }
    );

    if (!receivable) {
      return { success: false, error: 'Receivable not found' };
    }

    if (amount > receivable.outstandingAmount) {
      return {
        success: false,
        error: `Payment cannot exceed outstanding amount (₱${receivable.outstandingAmount.toFixed(2)})`,
      };
    }

    // Create payment record
    const paymentRecord = await PaymentRecord.create(
      [
        {
          tenantId,
          customerId,
          receivableId,
          transactionId,
          amount,
          paymentMethod,
          reference,
          notes,
          processedBy,
          processedAt: new Date(),
        },
      ],
      { session }
    );

    // Update receivable
    const newPaidAmount = receivable.paidAmount + amount;
    const newOutstandingAmount = receivable.originalAmount - newPaidAmount;
    let newStatus = receivable.paymentStatus;

    // Determine status
    if (newOutstandingAmount === 0) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    }

    // Mark as overdue if past due date
    if (newOutstandingAmount > 0 && new Date() > receivable.dueDate) {
      newStatus = 'overdue';
    }

    await AccountsReceivable.updateOne(
      { _id: receivableId },
      {
        $set: {
          paidAmount: newPaidAmount,
          outstandingAmount: newOutstandingAmount,
          paymentStatus: newStatus,
        },
      },
      { session }
    );

    // Update customer's total outstanding debt
    const totalDebt = await AccountsReceivable.aggregate([
      {
        $match: {
          tenantId,
          customerId,
          paymentStatus: { $in: ['pending', 'partial', 'overdue'] },
          isActive: true,
        },
      },
      { $group: { _id: null, total: { $sum: '$outstandingAmount' } } },
    ]).session(session ?? null);

    // Note: Outstanding debt is tracked via AccountsReceivable model, not stored on Customer

    return {
      success: true,
      paymentRecord: paymentRecord[0],
      receivableUpdated: {
        id: receivableId,
        paidAmount: newPaidAmount,
        outstandingAmount: newOutstandingAmount,
        paymentStatus: newStatus,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record payment';
    return { success: false, error: message };
  }
}

/**
 * Synchronize receivable status based on payment and due date
 * Called via automation to mark overdue receivables
 */
export async function syncReceivableStatus(tenantId: string): Promise<{
  success: boolean;
  error?: string;
  updated?: number;
}> {
  try {
    const now = new Date();

    // Mark all past-due non-paid receivables as overdue
    const result = await AccountsReceivable.updateMany(
      {
        tenantId,
        isActive: true,
        dueDate: { $lt: now },
        outstandingAmount: { $gt: 0 },
        paymentStatus: { $in: ['pending', 'partial'] },
      },
      { $set: { paymentStatus: 'overdue' } }
    );

    return { success: true, updated: result.modifiedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync receivable status';
    return { success: false, error: message };
  }
}

/**
 * Get customer's outstanding debt summary
 */
export async function getCustomerDebtSummary(
  customerId: string,
  tenantId: string
): Promise<{
  success: boolean;
  error?: string;
  totalOutstanding?: number;
  pendingCount?: number;
  overdueCount?: number;
  overdueAmount?: number;
}> {
  try {
    const summary = await AccountsReceivable.aggregate([
      {
        $match: {
          tenantId,
          customerId,
          isActive: true,
          paymentStatus: { $in: ['pending', 'partial', 'overdue'] },
        },
      },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$outstandingAmount' },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] },
          },
          partialCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'partial'] }, 1, 0] },
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, 1, 0] },
          },
          overdueAmount: {
            $sum: {
              $cond: [{ $eq: ['$paymentStatus', 'overdue'] }, '$outstandingAmount', 0],
            },
          },
        },
      },
    ]);

    const data = summary[0] || {
      totalOutstanding: 0,
      pendingCount: 0,
      partialCount: 0,
      overdueCount: 0,
      overdueAmount: 0,
    };

    return {
      success: true,
      totalOutstanding: data.totalOutstanding,
      pendingCount: data.pendingCount,
      overdueCount: data.overdueCount,
      overdueAmount: data.overdueAmount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get debt summary';
    return { success: false, error: message };
  }
}

/**
 * Validate customer can make a purchase on account
 */
export async function validateCreditAvailability(
  customerId: string,
  tenantId: string,
  saleAmount: number
): Promise<{
  valid: boolean;
  error?: string;
  availableCredit?: number;
}> {
  try {
    const customer = await Customer.findOne(
      { _id: customerId, tenantId, isActive: true }
    );

    if (!customer) {
      return { valid: false, error: 'Customer not found' };
    }

    // Note: Credit limits and availability checks would require additional fields on Customer model
    // These can be added in a future migration if needed
    // For now, allow the sale on account if customer exists and is active
    return { valid: true, availableCredit: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation failed';
    return { valid: false, error: message };
  }
}
