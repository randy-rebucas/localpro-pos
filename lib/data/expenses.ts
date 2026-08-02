import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export function serializeExpense(e: {
  id: string;
  amount: Prisma.Decimal;
  user?: { name: string; email: string } | null;
  userId: string;
  [key: string]: unknown;
}) {
  const { id, user, userId, ...rest } = e;
  return {
    _id: id,
    ...rest,
    amount: Number(e.amount),
    userId: user ? { _id: userId, name: user.name, email: user.email } : userId,
  };
}
