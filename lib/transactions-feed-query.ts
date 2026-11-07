import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import Customer from '@/models/Customer';
import Tenant from '@/models/Tenant';
import '@/models/User'; // Registers the model that populate('userId') looks up
import { Types } from 'mongoose';
import { escapeRegex } from '@/lib/query-utils';
import { DEFAULT_TENANT_TIMEZONE, getTenantDayBoundaries } from '@/lib/timezone';
import {
  FEED_PAYMENT_METHODS,
  FEED_STATUSES,
  buildFeedMatches,
  buildFeedPipeline,
  type FeedFilters,
  type FeedType,
} from '@/lib/transactions-feed';

const MAX_SEARCH_LENGTH = 64;
const MAX_CUSTOMER_MATCHES = 50;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface FeedRef {
  _id: unknown;
  kind: 'transaction' | 'expense';
  when: Date | string;
}

const objectIdParam = (value: string | null) => (value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined);
const dayParam = (value: string | null) => (value && DAY_PATTERN.test(value) ? value : undefined);

/** Reads filters from a request. Anything unrecognised is ignored rather than trusted. */
export async function resolveFeedFilters(params: URLSearchParams, tenantId: string): Promise<FeedFilters> {
  const filters: FeedFilters = {
    status: FEED_STATUSES.find((status) => status === params.get('status')),
    paymentMethod: FEED_PAYMENT_METHODS.find((method) => method === params.get('paymentMethod')),
    userId: objectIdParam(params.get('userId')),
    branchId: objectIdParam(params.get('branchId')),
  };

  const startDay = dayParam(params.get('startDate'));
  const endDay = dayParam(params.get('endDate'));
  if (startDay || endDay) {
    const tenant = await Tenant.findById(tenantId).select('settings.timezone').lean();
    const timezone = tenant?.settings?.timezone || DEFAULT_TENANT_TIMEZONE;
    if (startDay) filters.startDate = getTenantDayBoundaries(startDay, timezone).start;
    if (endDay) filters.endDate = getTenantDayBoundaries(endDay, timezone).end;
  }

  const search = params.get('search')?.trim().slice(0, MAX_SEARCH_LENGTH);
  if (search) {
    filters.search = search;
    const terms = search.split(/\s+/).map((term) => new RegExp(escapeRegex(term), 'i'));
    const customers = await Customer.find({
      tenantId,
      $and: terms.map((term) => ({ $or: [{ firstName: term }, { lastName: term }] })),
    }).select('_id').limit(MAX_CUSTOMER_MATCHES).lean();
    filters.customerIds = customers.map((customer) => customer._id as Types.ObjectId);
  }

  return filters;
}

interface FeedQuery {
  tenantId: string;
  type: FeedType;
  filters: FeedFilters;
  skip: number;
  limit: number;
  maxTimeMS: number;
}

/** One page of references plus the total across every page. */
export async function queryFeedRefs({ tenantId, type, filters, skip, limit, maxTimeMS }: FeedQuery): Promise<{ refs: FeedRef[]; total: number }> {
  const matches = buildFeedMatches(filters);
  // Sale-only filters leave no expenses to show
  if (type === 'expenses' && !matches.expenses) return { refs: [], total: 0 };
  const effectiveType: FeedType = type === 'all' && !matches.expenses ? 'transactions' : type;

  const pipeline = buildFeedPipeline({
    tenantId,
    type: effectiveType,
    expenseCollection: Expense.collection.name,
    skip,
    limit,
    saleMatch: matches.sales,
    expenseMatch: matches.expenses ?? undefined,
  });
  const active = { tenantId: new Types.ObjectId(tenantId), isActive: { $ne: false } };

  const [refs, saleCount, expenseCount] = await Promise.all([
    effectiveType === 'expenses'
      ? Expense.aggregate<FeedRef>(pipeline, { maxTimeMS })
      : Transaction.aggregate<FeedRef>(pipeline, { maxTimeMS }),
    effectiveType === 'expenses' ? 0 : Transaction.countDocuments({ ...active, ...matches.sales }, { maxTimeMS }),
    effectiveType === 'transactions' ? 0 : Expense.countDocuments({ ...active, ...matches.expenses }, { maxTimeMS }),
  ]);

  return { refs, total: saleCount + expenseCount };
}

const PEOPLE = [
  { path: 'userId', select: 'name email' },
  { path: 'customerId', select: 'firstName lastName' },
];

/** Full documents for a page of references, in the same order. */
export async function loadFeedEntries(refs: FeedRef[], tenantId: string) {
  const idsOf = (kind: FeedRef['kind']) => refs.filter((ref) => ref.kind === kind).map((ref) => ref._id);
  const [sales, expenses] = await Promise.all([
    Transaction.find({ _id: { $in: idsOf('transaction') }, tenantId }).populate(PEOPLE).lean(),
    Expense.find({ _id: { $in: idsOf('expense') }, tenantId }).populate(PEOPLE[0]).lean(),
  ]);

  const byId = new Map<string, unknown>([...sales, ...expenses].map((doc) => [String(doc._id), doc]));
  return refs.flatMap((ref) => {
    const doc = byId.get(String(ref._id));
    return doc ? [{ type: ref.kind, data: doc, date: ref.when }] : [];
  });
}
