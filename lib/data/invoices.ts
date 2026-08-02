import { Prisma } from '@prisma/client';

type InvoiceWithRelations = {
  id: string;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal | null;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  paidAmount: Prisma.Decimal | null;
  transactionId: string | null;
  customerId: string | null;
  transaction?: { id: string; receiptNumber: string | null; total: Prisma.Decimal } | null;
  customer?: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null } | null;
  [key: string]: unknown;
};

export function serializeInvoice(inv: InvoiceWithRelations) {
  const { id, transaction, customer, ...rest } = inv;
  return {
    _id: id,
    ...rest,
    subtotal: Number(inv.subtotal),
    discountAmount: inv.discountAmount != null ? Number(inv.discountAmount) : undefined,
    taxAmount: Number(inv.taxAmount),
    total: Number(inv.total),
    paidAmount: inv.paidAmount != null ? Number(inv.paidAmount) : undefined,
    transactionId: transaction
      ? { _id: transaction.id, receiptNumber: transaction.receiptNumber, total: Number(transaction.total) }
      : inv.transactionId,
    customerId: customer
      ? { _id: customer.id, name: `${customer.firstName} ${customer.lastName}`.trim(), email: customer.email, phone: customer.phone }
      : inv.customerId,
  };
}
