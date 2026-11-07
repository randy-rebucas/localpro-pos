import { Types, type PipelineStage } from 'mongoose';
import { escapeRegex } from '@/lib/query-utils';

export const FEED_TYPES = ['all', 'transactions', 'expenses'] as const;
export type FeedType = (typeof FEED_TYPES)[number];

export function parseFeedType(value: string | null): FeedType {
  return FEED_TYPES.find((type) => type === value) ?? 'all';
}

export const FEED_STATUSES = ['completed', 'refunded', 'cancelled'] as const;
export const FEED_PAYMENT_METHODS = ['cash', 'card', 'digital', 'on_account', 'other'] as const;

export interface FeedFilters {
  startDate?: Date;
  endDate?: Date;
  status?: (typeof FEED_STATUSES)[number];
  paymentMethod?: (typeof FEED_PAYMENT_METHODS)[number];
  userId?: Types.ObjectId;
  branchId?: Types.ObjectId;
  search?: string;
  customerIds?: Types.ObjectId[];
}

type Match = Record<string, unknown>;

function dateRange({ startDate, endDate }: FeedFilters) {
  return { ...(startDate ? { $gte: startDate } : {}), ...(endDate ? { $lte: endDate } : {}) };
}

/**
 * What each collection has to match. Expenses have no status or branch, so those
 * filters mean sales only, and `expenses` comes back null.
 */
export function buildFeedMatches(filters: FeedFilters): { sales: Match; expenses: Match | null } {
  const { status, paymentMethod, userId, branchId, search, customerIds = [] } = filters;
  const range = dateRange(filters);
  const hasRange = Object.keys(range).length > 0;
  const text = search ? new RegExp(escapeRegex(search), 'i') : undefined;

  const shared: Match = {
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(userId ? { userId } : {}),
  };
  const sales: Match = {
    ...shared,
    ...(hasRange ? { createdAt: range } : {}),
    ...(status ? { status } : {}),
    ...(branchId ? { branchId } : {}),
  };
  if (search && text) {
    sales.$or = [
      { receiptNumber: text },
      ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
      ...(Types.ObjectId.isValid(search) && search.length === 24 ? [{ _id: new Types.ObjectId(search) }] : []),
    ];
  }

  if (status || branchId) return { sales, expenses: null };
  return {
    sales,
    expenses: {
      ...shared,
      ...(hasRange ? { date: range } : {}),
      ...(text ? { $or: [{ name: text }, { description: text }] } : {}),
    },
  };
}

// A spreadsheet runs a cell starting with one of these as a formula
const FORMULA_START = /^[=+\-@\t\r]/;
const safeCell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value);
  return FORMULA_START.test(text) ? `'${text}` : text;
};

interface ExportPerson { name?: string; firstName?: string; lastName?: string }
interface ExportDoc {
  _id: unknown;
  receiptNumber?: string;
  status?: string;
  name?: string;
  description?: string;
  items?: unknown[];
  paymentMethod?: string;
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  total?: number;
  amount?: number;
  cashReceived?: number;
  change?: number;
  voidReason?: string;
  userId?: ExportPerson | unknown;
  customerId?: ExportPerson | unknown;
}

/** Text fields hold what staff and customers typed, so they are neutralised for spreadsheets. */
export function toFeedExportRow(entry: { type: 'transaction' | 'expense'; data: unknown; date: Date | string }) {
  const doc = entry.data as ExportDoc;
  const person = (value: unknown) => {
    const found = (value && typeof value === 'object' ? value : {}) as ExportPerson;
    return safeCell(found.name ?? [found.firstName, found.lastName].filter(Boolean).join(' '));
  };
  const isSale = entry.type === 'transaction';
  return {
    date: new Date(entry.date).toISOString(),
    type: entry.type,
    receipt: isSale ? safeCell(doc.receiptNumber || String(doc._id).slice(-8)) : '',
    description: safeCell(isSale ? doc.voidReason : [doc.name, doc.description].filter(Boolean).join(' - ')),
    status: isSale ? safeCell(doc.status) : '',
    customer: isSale ? person(doc.customerId) : '',
    cashier: person(doc.userId),
    items: isSale ? doc.items?.length ?? 0 : '',
    payment: safeCell(doc.paymentMethod),
    subtotal: isSale ? doc.subtotal ?? doc.total ?? 0 : '',
    discount: isSale ? doc.discountAmount ?? 0 : '',
    tax: isSale ? doc.taxAmount ?? 0 : '',
    total: isSale ? doc.total ?? 0 : -(doc.amount ?? 0),
    cash: isSale ? doc.cashReceived ?? '' : '',
    change: isSale ? doc.change ?? '' : '',
  };
}

interface FeedPipelineOptions {
  tenantId: string;
  type: FeedType;
  expenseCollection: string;
  skip: number;
  limit: number;
  saleMatch?: Match;
  expenseMatch?: Match;
}

/**
 * One page of sales and expenses, newest first, as { _id, kind, when } references.
 *
 * aggregate() does not cast like find() does, so tenantId has to be an ObjectId here,
 * and $unionWith runs its own pipeline, so that side needs its own tenant match.
 * Each side is capped at skip + limit, the most it can contribute to this page. Those sorts
 * stay on one date field so they can use the tenant date indexes; only the merged sort,
 * which sees at most 2 * (skip + limit) rows, breaks ties on _id to keep paging stable.
 */
export function buildFeedPipeline({ tenantId, type, expenseCollection, skip, limit, saleMatch, expenseMatch }: FeedPipelineOptions): PipelineStage[] {
  const active = { tenantId: new Types.ObjectId(tenantId), isActive: { $ne: false } };
  const window = skip + limit;

  const sales = [
    { $match: { ...saleMatch, ...active } },
    { $sort: { createdAt: -1 } },
    { $limit: window },
    { $project: { kind: { $literal: 'transaction' }, when: '$createdAt' } },
  ];
  const expenses = [
    { $match: { ...expenseMatch, ...active } },
    { $sort: { date: -1 } },
    { $limit: window },
    { $project: { kind: { $literal: 'expense' }, when: '$date' } },
  ];

  const page = [{ $skip: skip }, { $limit: limit }];
  if (type === 'transactions') return [...sales, ...page] as PipelineStage[];
  if (type === 'expenses') return [...expenses, ...page] as PipelineStage[];

  return [
    ...sales,
    { $unionWith: { coll: expenseCollection, pipeline: expenses } },
    { $sort: { when: -1, _id: -1 } },
    ...page,
  ] as PipelineStage[];
}
