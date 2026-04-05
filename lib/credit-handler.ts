/**
 * Credit handling utilities
 * Handles customer credit balance updates and credit transaction creation
 */

import Credit from '@/models/Credit';
import Customer from '@/models/Customer';

export interface CreditDeductionOptions {
  tenantId: string;
  customerId?: string;
  amount: number;
  transactionId: string;
  userId: string;
  session?: any;
}

/**
 * Deduct credits from customer balance when paying with credits
 * Creates a Credit transaction record for audit trail
 * Returns success boolean
 */
export async function deductCredits(options: CreditDeductionOptions): Promise<{
  success: boolean;
  error?: string;
  newBalance?: number;
}> {
  const { tenantId, customerId, amount, transactionId, userId, session } = options;

  if (!customerId) {
    return { success: false, error: 'Customer ID is required for credit payment' };
  }

  try {
    // Get customer and check credit balance
    const customer = await Customer.findOne(
      { _id: customerId, tenantId, isActive: true },
      {},
      { session }
    );

    if (!customer) {
      return { success: false, error: 'Customer not found' };
    }

    // Get current balance from most recent credit transaction
    const mostRecentCredit = await Credit.findOne(
      { tenantId, customerId },
      'balanceAfter',
      { session }
    )
      .sort({ createdAt: -1 });

    const currentBalance = mostRecentCredit?.balanceAfter || 0;

    if (currentBalance < amount) {
      return {
        success: false,
        error: `Insufficient credits. Balance: ₱${currentBalance.toFixed(2)}, Required: ₱${amount.toFixed(2)}`,
      };
    }

    // Deduct credits from customer balance
    const newBalance = currentBalance - amount;

    // Create credit transaction record for audit trail
    await Credit.create(
      [
        {
          tenantId,
          customerId,
          type: 'usage',
          amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          transactionId,
          createdBy: userId,
        },
      ],
      { session }
    );

    return { success: true, newBalance };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deduct credits';
    return { success: false, error: message };
  }
}

/**
 * Validate that a customer has sufficient credits
 */
export async function validateCreditBalance(
  customerId: string,
  amount: number,
  tenantId: string
): Promise<{ valid: boolean; currentBalance?: number; error?: string }> {
  try {
    const customer = await Customer.findOne(
      { _id: customerId, tenantId, isActive: true }
    );

    if (!customer) {
      return { valid: false, error: 'Customer not found' };
    }

    // Get current balance from most recent credit transaction
    const mostRecentCredit = await Credit.findOne(
      { tenantId, customerId },
      'balanceAfter'
    )
      .sort({ createdAt: -1 });

    const balance = mostRecentCredit?.balanceAfter || 0;
    if (balance < amount) {
      return {
        valid: false,
        currentBalance: balance,
        error: `Insufficient credits. Balance: ${balance}, Required: ${amount}`,
      };
    }

    return { valid: true, currentBalance: balance };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation failed';
    return { valid: false, error: message };
  }
}
