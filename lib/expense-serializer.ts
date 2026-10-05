import type { Prisma } from '@prisma/client';

type ExpenseRow = {
  id: string;
  userId: string;
  amount: Prisma.Decimal | number;
  user?: { name: string; email: string } | null;
  [key: string]: unknown;
};

/**
 * Legacy client shape (hooks/useExpensesList.ts, transactions page): `_id`, a
 * populated `userId` object when the user relation is included, and a numeric
 * `amount` (Prisma serializes Decimal as a string).
 */
export function serializeExpense<T extends ExpenseRow>(e: T) {
  const { user, ...rest } = e;
  return {
    ...rest,
    _id: e.id,
    amount: Number(e.amount),
    userId: user ? { _id: e.userId, name: user.name, email: user.email } : e.userId,
  };
}
