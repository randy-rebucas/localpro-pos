import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

const movementInclude = {
  product: { select: { id: true, name: true, sku: true } },
  user: { select: { id: true, name: true, email: true } },
  transaction: { select: { id: true, receiptNumber: true } },
} satisfies Prisma.StockMovementInclude;

function serializeMovement(movement: Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>) {
  const { id, product, user, transaction, ...rest } = movement;
  return {
    _id: id,
    ...rest,
    productId: product ? { _id: product.id, name: product.name, sku: product.sku } : rest.productId,
    userId: user ? { _id: user.id, name: user.name, email: user.email } : rest.userId,
    transactionId: transaction ? { _id: transaction.id, receiptNumber: transaction.receiptNumber } : rest.transactionId,
  };
}

export async function findStockMovements(
  tenantId: string,
  filters: { productId?: string; type?: string },
  pagination: { skip: number; limit: number }
) {
  const where: Prisma.StockMovementWhereInput = { tenantId };
  if (filters.productId) where.productId = filters.productId;
  if (filters.type) where.type = filters.type as Prisma.StockMovementWhereInput['type'];

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: movementInclude,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return { movements: movements.map(serializeMovement), total };
}

export async function findRecentStockMovements(
  tenantId: string,
  since: Date,
  filters: { productId?: string; branchId?: string },
  limit = 50
) {
  return prisma.stockMovement.findMany({
    where: {
      tenantId,
      createdAt: { gt: since },
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
