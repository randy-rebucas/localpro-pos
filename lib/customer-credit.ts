import prisma from '@/lib/prisma';

export function wouldExceedCreditLimit(
  currentBalance: number,
  amountToBill: number,
  creditLimit?: number | null
): boolean {
  if (typeof creditLimit !== 'number' || creditLimit < 0) return false;
  return currentBalance + amountToBill - creditLimit > 0.01;
}

export function calculateOnAccountRefundAmount(
  refundAmount: number,
  transactionTotal: number,
  onAccountTotal: number
): number {
  if (refundAmount <= 0 || onAccountTotal <= 0 || transactionTotal <= 0) return 0;
  const ratio = refundAmount / transactionTotal;
  return Math.round(onAccountTotal * ratio * 100) / 100;
}

export async function getOnAccountTotalForTransaction(
  tenantId: string,
  transactionId: string,
  transactionTotal: number,
  paymentMethod: string
): Promise<number> {
  const onAccountPayments = await prisma.payment.findMany({
    where: { tenantId, transactionId, method: 'on_account', status: 'completed' },
    select: { amount: true },
  });

  if (onAccountPayments.length > 0) {
    return onAccountPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  }

  if (paymentMethod === 'on_account') {
    return transactionTotal;
  }

  return 0;
}

export function parseCreditLimitInput(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  if (Number.isNaN(parsed) || parsed < 0) return NaN;
  return parsed;
}
