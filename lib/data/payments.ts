import { Prisma } from '@prisma/client';

type PaymentWithRelations = {
  id: string;
  amount: Prisma.Decimal;
  transactionId: string;
  processedBy: string | null;
  transaction?: { id: string; receiptNumber: string | null; total: Prisma.Decimal } | null;
  processedByUser?: { id: string; name: string; email: string } | null;
  [key: string]: unknown;
};

export function serializePayment(p: PaymentWithRelations) {
  const { id, transaction, processedByUser, ...rest } = p;
  return {
    _id: id,
    ...rest,
    amount: Number(p.amount),
    transactionId: transaction
      ? { _id: transaction.id, receiptNumber: transaction.receiptNumber, total: Number(transaction.total) }
      : p.transactionId,
    processedBy: processedByUser
      ? { _id: processedByUser.id, name: processedByUser.name, email: processedByUser.email }
      : p.processedBy,
  };
}
