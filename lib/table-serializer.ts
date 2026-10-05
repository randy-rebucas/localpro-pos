import type { TableStatus } from '@prisma/client';

// The client/API vocabulary is 'check-requested'; Prisma's enum member is
// `check_requested` (the hyphenated form only exists as the DB value via @map).
export const TABLE_STATUSES = ['open', 'occupied', 'check-requested'] as const;

export function toPrismaTableStatus(status: string): TableStatus {
  return (status === 'check-requested' ? 'check_requested' : status) as TableStatus;
}

/** Legacy client shape (admin tables page, FloorMap, POS): `_id` and the hyphenated status. */
export function serializeTable<T extends { id: string; status: TableStatus }>(t: T) {
  return {
    ...t,
    _id: t.id,
    status: t.status === 'check_requested' ? 'check-requested' : t.status,
  };
}
