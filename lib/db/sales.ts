/**
 * Domain 7 (sales core): transactions, payments, invoices, offline
 * transactions, saved carts, customer-display POS sessions, stock movements,
 * prescriptions, e-commerce integrations and the number counters.
 *
 * Every method takes `tenantId` first and scopes by it. Cross-tenant methods
 * say so in their name. POS sessions are keyed by the tenant slug the display
 * client sends, not by tenant id.
 *
 * Reporting aggregates over transactions belong to the analytics domain.
 */
import type { DbTx } from './tx';
import type { Id, Patch, Ref, UpdateResult, UserSummary } from './types';
import type { Select } from './identity';
import type { ChannelProvider } from './catalog';

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

type DateRange = { gt?: Date; gte?: Date; lt?: Date; lte?: Date };

type Page = { skip: number; limit: number };

// ─── Transactions ───────────────────────────────────────────────────────────

export const TRANSACTION_STATUSES = ['completed', 'cancelled', 'refunded'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const TRANSACTION_PAYMENT_METHODS = [
  'cash',
  'card',
  'digital',
  'tap_to_pay',
  'wallet',
  'qr_code',
  'bnpl',
  'on_account',
] as const;
export type TransactionPaymentMethod = (typeof TRANSACTION_PAYMENT_METHODS)[number];

export type DiscountCategory = 'general' | 'senior' | 'pwd' | 'employee' | 'promo';

export interface TransactionItem {
  _id?: Id;
  /** Unset for manual items. Holds the bundle id for a bundle line. */
  product?: Id;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  modifiers?: Array<{ name: string; chosenOption: string; price: number }>;
  prescriptionId?: Id;
}

export interface SplitPayment {
  guestIndex: number;
  method: string;
  amount: number;
  reference?: string;
}

export interface Transaction extends Timestamps {
  _id: Id;
  tenantId: Id;
  branchId?: Id;
  items: TransactionItem[];
  /** Total before discount. */
  subtotal: number;
  discountCode?: string;
  discountCategory?: DiscountCategory;
  discountAmount?: number;
  scPwdName?: string;
  scPwdId?: string;
  taxExemptAmount?: number;
  zeroRatedAmount?: number;
  taxAmount?: number;
  /** Total after discount and tax. */
  total: number;
  paymentMethod: TransactionPaymentMethod;
  paymentProvider?: string;
  paymentReference?: string;
  bnplInstallments?: number;
  cashReceived?: number;
  change?: number;
  status: TransactionStatus;
  customerId?: Id;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  userId?: Id;
  deviceId?: Id;
  terminalId?: string;
  deviceSerialNumber?: string;
  receiptNumber?: string;
  idempotencyKey?: string;
  notes?: string;
  displayCurrency?: string;
  displayTotal?: number;
  orderType?: 'dine-in' | 'takeout' | 'delivery';
  tableNumber?: string;
  tableId?: Id;
  splitCount?: number;
  splitPayments?: SplitPayment[];
  salesChannel?: ChannelProvider | 'pos';
  externalOrderId?: string;
  channelSyncKey?: string;
  channelImportedAt?: Date;
  shopifyFulfilledAt?: Date;
  shopifyFulfillmentId?: string;
  isActive: boolean;
}

/** Line items take whatever the caller built; fields the schema doesn't know are dropped. */
export type TransactionItemInput = Omit<TransactionItem, '_id'>;

export type TransactionInput = Pick<Transaction, 'subtotal' | 'total' | 'paymentMethod'> &
  Partial<Omit<Transaction, 'tenantId' | 'items' | keyof Timestamps>> & { items: TransactionItemInput[] };

/** List read: customerId is `{ _id, firstName, lastName }`, userId is `{ _id, name, email }`. */
export type TransactionWithRefs = Omit<Transaction, 'customerId' | 'userId'> & {
  customerId?: Ref<{ firstName: string; lastName: string }>;
  userId?: Ref<UserSummary>;
};

/** Detail read: as in the list, and each items[].product is `{ _id, name, sku }`. */
export type TransactionDetail = Omit<Transaction, 'userId' | 'items'> & {
  userId?: Ref<UserSummary>;
  items: Array<Omit<TransactionItem, 'product'> & { product?: Ref<{ name: string; sku?: string }> }>;
};

export interface TransactionFilter {
  status?: TransactionStatus | TransactionStatus[];
  /** Exact isActive. */
  isActive?: boolean;
  /** isActive !== false. */
  notDisabled?: true;
  customerId?: Id;
  userId?: Id;
  paymentMethod?: TransactionPaymentMethod;
  /** Has a line for this product. */
  productId?: Id;
  createdAt?: DateRange;
  salesChannel?: Transaction['salesChannel'];
  externalOrderId?: string;
  /** Case-insensitive substring of notes (literal, no regex). */
  notesContain?: string;
}

interface TransactionListOpts {
  select?: Select;
  sort?: 'createdAt' | '-createdAt';
  page?: Page;
  limit?: number;
}

export interface TransactionRepo {
  /** Unordered unless `sort` is given. */
  list(tenantId: Id, filter?: TransactionFilter, opts?: TransactionListOpts): Promise<Transaction[]>;
  /** Newest first, with customer and cashier populated. */
  listWithRefs(tenantId: Id, filter: TransactionFilter, opts: { page: Page }): Promise<TransactionWithRefs[]>;
  /** Automations and system health only. */
  listAcrossTenants(filter: TransactionFilter, opts?: TransactionListOpts): Promise<Transaction[]>;
  count(tenantId: Id, filter?: TransactionFilter): Promise<number>;
  /** Public platform stats only. */
  countAcrossTenants(filter: TransactionFilter): Promise<number>;
  /** The first match, newest first when `sort` is given. */
  findOne(
    tenantId: Id,
    filter: TransactionFilter,
    opts?: { select?: Select; sort?: '-createdAt' }
  ): Promise<Transaction | null>;
  findById(tenantId: Id, id: Id, opts?: { select?: Select; status?: TransactionStatus }): Promise<Transaction | null>;
  /** A transaction that isn't disabled, with product and cashier populated. */
  findDetail(tenantId: Id, id: Id): Promise<TransactionDetail | null>;
  /** Receipt jobs, which start from a bare transaction id. */
  findByIdAcrossTenants(id: Id): Promise<Transaction | null>;
  findByIdempotencyKey(tenantId: Id, key: string): Promise<Transaction | null>;
  findByChannelSyncKey(tenantId: Id, key: string): Promise<Transaction | null>;
  /**
   * `_id` may be set by the caller (stock movements are written before the
   * transaction). Throws DuplicateKeyError with field `receiptNumber`,
   * `idempotencyKey` or `channelSyncKey`.
   */
  create(tenantId: Id, input: TransactionInput, opts?: { tx?: DbTx }): Promise<Transaction>;
  /** Writes the loyalty points of a finished sale. */
  setLoyaltyPoints(
    tenantId: Id,
    id: Id,
    points: Partial<Pick<Transaction, 'loyaltyPointsEarned' | 'loyaltyPointsRedeemed'>>,
    opts?: { tx?: DbTx }
  ): Promise<void>;
  /**
   * Atomic status change: applies only while the status is still `from`, so
   * concurrent voids and refunds can't both win. Null when it no longer is.
   * `from === to` still counts as a write, which is what serializes partial
   * refunds of one transaction.
   */
  claimStatus(
    tenantId: Id,
    id: Id,
    from: TransactionStatus,
    to: TransactionStatus,
    opts?: { tx?: DbTx }
  ): Promise<Transaction | null>;
  /** Records the fulfillment on the imported Shopify order. */
  markShopifyFulfilled(tenantId: Id, externalOrderId: string, fulfillmentId: string, at: Date): Promise<void>;
}

// ─── Payments ───────────────────────────────────────────────────────────────

export const PAYMENT_METHODS = ['cash', 'card', 'digital', 'check', 'other', 'on_account'] as const;
export type PaymentRecordMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentDetails {
  cardLast4?: string;
  cardType?: string;
  cardBrand?: string;
  transactionId?: string;
  provider?: string;
  cashReceived?: number;
  change?: number;
  checkNumber?: string;
  notes?: string;
}

export interface Payment extends Timestamps {
  _id: Id;
  tenantId: Id;
  transactionId: Id;
  method: PaymentRecordMethod;
  amount: number;
  status: PaymentStatus;
  details?: PaymentDetails;
  processedBy?: Id;
  processedAt?: Date;
  refundedAt?: Date;
  refundReason?: string;
  isActive: boolean;
}

export type PaymentInput = Pick<Payment, 'transactionId' | 'method' | 'amount'> &
  Partial<Pick<Payment, 'status' | 'details' | 'processedBy' | 'processedAt' | 'refundedAt' | 'refundReason'>>;

export type PaymentWithRefs = Omit<Payment, 'transactionId' | 'processedBy'> & {
  transactionId: Ref<{ receiptNumber?: string; total: number }>;
  processedBy?: Ref<UserSummary>;
};

export interface PaymentFilter {
  status?: PaymentStatus;
  method?: PaymentRecordMethod;
  transactionId?: Id;
  /** isActive !== false. */
  notDisabled?: true;
}

export interface PaymentRepo {
  list(tenantId: Id, filter: PaymentFilter, opts?: { select?: Select }): Promise<Payment[]>;
  /** Newest first, with transaction and processor populated. */
  listWithRefs(tenantId: Id, filter: PaymentFilter, opts: { page: Page }): Promise<PaymentWithRefs[]>;
  count(tenantId: Id, filter?: PaymentFilter): Promise<number>;
  /** The first match (no particular order). */
  findOne(tenantId: Id, filter: PaymentFilter, opts?: { tx?: DbTx }): Promise<Payment | null>;
  findById(tenantId: Id, id: Id): Promise<Payment | null>;
  create(tenantId: Id, input: PaymentInput, opts?: { tx?: DbTx }): Promise<Payment>;
  /**
   * Atomic claim: applies only while the payment isn't refunded yet, so a
   * retry can't refund it twice. Null when it already is.
   */
  markRefunded(
    tenantId: Id,
    id: Id,
    refund: { at: Date; reason?: string },
    opts?: { tx?: DbTx }
  ): Promise<Payment | null>;
}

// ─── Invoices ───────────────────────────────────────────────────────────────

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface InvoiceItem {
  name: string;
  description?: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface InvoiceCustomerInfo {
  name: string;
  email?: string;
  phone?: string;
  address?: { street?: string; city?: string; state?: string; zipCode?: string; country?: string };
}

export interface Invoice extends Timestamps {
  _id: Id;
  tenantId: Id;
  invoiceNumber: string;
  transactionId?: Id;
  customerId?: Id;
  customerInfo?: InvoiceCustomerInfo;
  items: InvoiceItem[];
  subtotal: number;
  discountAmount?: number;
  taxAmount: number;
  total: number;
  dueDate: Date;
  paymentTerms?: string;
  status: InvoiceStatus;
  paidAt?: Date;
  paidAmount?: number;
  notes?: string;
  isActive: boolean;
}

export type InvoiceInput = Pick<Invoice, 'invoiceNumber' | 'items' | 'subtotal' | 'taxAmount' | 'total' | 'dueDate'> &
  Partial<Pick<Invoice, 'transactionId' | 'customerId' | 'discountAmount' | 'paymentTerms' | 'status' | 'notes'>> & {
    customerInfo?: InvoiceCustomerInfo | null;
  };

export type InvoiceWithRefs = Omit<Invoice, 'transactionId' | 'customerId'> & {
  transactionId?: Ref<Record<string, unknown>>;
  customerId?: Ref<Record<string, unknown>>;
};

export interface InvoiceFilter {
  status?: InvoiceStatus | InvoiceStatus[];
  customerId?: Id;
  dueDate?: DateRange;
  /** isActive !== false. */
  notDisabled?: true;
}

export interface InvoiceRepo {
  /** Newest first, with transaction and customer populated. */
  listWithRefs(tenantId: Id, filter: InvoiceFilter, opts: { page: Page }): Promise<InvoiceWithRefs[]>;
  count(tenantId: Id, filter?: InvoiceFilter): Promise<number>;
  findById(tenantId: Id, id: Id): Promise<Invoice | null>;
  /** The transaction comes with its items, the customer with its contact fields. */
  findDetail(tenantId: Id, id: Id): Promise<InvoiceWithRefs | null>;
  create(tenantId: Id, input: InvoiceInput): Promise<Invoice>;
  /** Loads and saves, so setters and validators run. `null` clears a field. */
  update(
    tenantId: Id,
    id: Id,
    patch: Patch<Pick<Invoice, 'status' | 'paidAt' | 'paidAmount' | 'notes'>>
  ): Promise<UpdateResult<Invoice> | null>;
}

// ─── Offline transactions ───────────────────────────────────────────────────

export interface OfflineTransaction extends Timestamps {
  _id: Id;
  tenantId: Id;
  branchId?: Id;
  deviceId: string;
  items: Array<{ _id?: Id; productId?: Id; name: string; price: number; quantity: number; subtotal: number }>;
  subtotal: number;
  discountCode?: string;
  discountCategory?: DiscountCategory;
  discountAmount?: number;
  taxExemptAmount?: number;
  taxAmount?: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  change?: number;
  customerId?: Id;
  userId?: Id;
  notes?: string;
  offlineCreatedAt: Date;
  syncStatus: 'pending' | 'processing' | 'synced' | 'failed';
  syncedTransactionId?: Id;
  retryCount: number;
  syncError?: string;
  isActive: boolean;
}

export interface OfflineTransactionRepo {
  /** Active pending or failed rows below `maxRetries`, oldest first. */
  listSyncable(tenantId: Id, opts: { maxRetries: number; limit: number }): Promise<OfflineTransaction[]>;
  /** Atomic claim for one sync run. False when another run took the row. */
  claimForSync(tenantId: Id, id: Id): Promise<boolean>;
  /** Clears syncError. */
  markSynced(tenantId: Id, id: Id, transactionId: Id): Promise<void>;
  recordSyncFailure(
    tenantId: Id,
    id: Id,
    failure: { status: 'pending' | 'failed'; retryCount: number; error: string }
  ): Promise<void>;
}

// ─── Saved carts ────────────────────────────────────────────────────────────

export interface SavedCartItem {
  _id?: Id;
  productId: Id;
  name: string;
  price: number;
  quantity: number;
  stock: number;
}

export interface SavedCart extends Timestamps {
  _id: Id;
  tenantId: Id;
  name: string;
  items: SavedCartItem[];
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  total: number;
  userId: Id;
  isActive: boolean;
}

export type SavedCartInput = Pick<SavedCart, 'name' | 'subtotal' | 'total' | 'userId'> &
  Partial<Pick<SavedCart, 'discountCode' | 'discountAmount'>> & { items: Array<Omit<SavedCartItem, '_id'>> };

export type SavedCartWithUser = Omit<SavedCart, 'userId'> & { userId: Ref<UserSummary> };

export interface SavedCartRepo {
  /** The user's carts that aren't disabled, newest first. */
  listForUser(tenantId: Id, userId: Id): Promise<SavedCart[]>;
  findForUser(tenantId: Id, userId: Id, id: Id): Promise<SavedCart | null>;
  create(tenantId: Id, input: SavedCartInput): Promise<SavedCart>;
  /** Soft delete. False when the user has no such active cart. */
  deactivate(tenantId: Id, userId: Id, id: Id): Promise<boolean>;
  /** Carts last updated in (after, upTo], most recent first, owner populated. */
  listUpdatedBetween(
    tenantId: Id,
    range: { after: Date; upTo: Date },
    opts: { limit: number }
  ): Promise<SavedCartWithUser[]>;
}

// ─── POS sessions (customer display) ────────────────────────────────────────

export interface PosSession extends Timestamps {
  _id: Id;
  sessionId: string;
  /** Tenant slug as sent by the display client. */
  tenant: string;
  cart: unknown[];
  subtotal: number;
  /** A stored `null` means no discount, so this is not a Patch field. */
  discount: unknown;
  taxAmount?: number;
  taxRate?: number;
  taxLabel?: string;
  tip: number;
  total: number;
  paymentMethod: string | null;
  paymentStatus: 'pending' | 'processing' | 'completed' | 'failed';
  lastUpdate: number;
}

/** Stored as given: `null` is a value here, and `undefined` keys are left alone. */
export type PosSessionFields = Partial<Omit<PosSession, '_id' | 'sessionId' | 'tenant' | keyof Timestamps>>;

export interface PosSessionRepo {
  find(tenant: string, sessionId: string): Promise<PosSession | null>;
  /** Null when no such session exists for this tenant. */
  update(tenant: string, sessionId: string, set: PosSessionFields): Promise<PosSession | null>;
  /**
   * Updates the session, creating it with `insertDefaults` when missing.
   * Session ids are globally unique, so this returns null when the id belongs
   * to another tenant: a session can't be taken over by naming its id.
   */
  upsert(
    tenant: string,
    sessionId: string,
    set: PosSessionFields,
    insertDefaults?: PosSessionFields
  ): Promise<PosSession | null>;
}

// ─── Stock movements ────────────────────────────────────────────────────────

export const STOCK_MOVEMENT_TYPES = ['sale', 'purchase', 'adjustment', 'return', 'damage', 'transfer'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface StockMovement extends Timestamps {
  _id: Id;
  productId: Id;
  tenantId: Id;
  branchId?: Id;
  variation?: { size?: string; color?: string; type?: string };
  type: StockMovementType;
  /** Positive for additions, negative for subtractions. */
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  transactionId?: Id;
  userId?: Id;
  notes?: string;
}

export type StockMovementInput = Omit<StockMovement, '_id' | keyof Timestamps>;

export type StockMovementWithRefs = Omit<StockMovement, 'productId' | 'userId' | 'transactionId'> & {
  productId: Ref<{ name: string; sku?: string }>;
  userId?: Ref<UserSummary>;
  transactionId?: Ref<{ receiptNumber?: string }>;
};

export interface StockMovementFilter {
  productId?: Id;
  branchId?: Id;
  type?: StockMovementType;
  createdAt?: DateRange;
}

export interface StockMovementRepo {
  /** Newest first. */
  list(tenantId: Id, filter: StockMovementFilter, opts: { select?: Select; limit: number }): Promise<StockMovement[]>;
  /** Newest first, with product, user and receipt populated. */
  listWithRefs(tenantId: Id, filter: StockMovementFilter, opts: { page: Page }): Promise<StockMovementWithRefs[]>;
  count(tenantId: Id, filter?: StockMovementFilter): Promise<number>;
  /** One write for the whole batch. Every movement carries its own tenantId. */
  createMany(movements: StockMovementInput[], opts?: { tx?: DbTx }): Promise<void>;
}

// ─── Prescriptions ──────────────────────────────────────────────────────────

export const PRESCRIPTION_STATUSES = ['pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled'] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

export interface PrescriptionItem {
  productId?: Id;
  drugName: string;
  quantity: number;
  dosage: string;
  frequency: string;
  instructions?: string;
  dispensed: boolean;
  dispensedAt?: Date;
  dispensedBy?: Id;
  dispensedTransactionId?: Id;
}

export interface Prescription extends Timestamps {
  _id: Id;
  tenantId: Id;
  prescriptionNumber: string;
  patientName: string;
  patientAge?: number;
  doctorName: string;
  doctorPRCNumber: string;
  doctorClinic?: string;
  issuedDate: Date;
  validUntil: Date;
  items: PrescriptionItem[];
  transactionId?: Id;
  status: PrescriptionStatus;
  notes?: string;
  scannedCopy?: string;
  createdBy: Id;
}

export type PrescriptionInput = Pick<
  Prescription,
  'prescriptionNumber' | 'patientName' | 'doctorName' | 'doctorPRCNumber' | 'issuedDate' | 'validUntil' | 'createdBy'
> &
  Partial<Pick<Prescription, 'patientAge' | 'doctorClinic' | 'notes' | 'scannedCopy'>> & {
    items: Array<Partial<PrescriptionItem>>;
  };

export interface PrescriptionFilter {
  status?: PrescriptionStatus;
  /** Full-text search of the patient name. */
  search?: string;
}

export interface PrescriptionRepo {
  /** Newest first. */
  list(tenantId: Id, filter: PrescriptionFilter, opts: { page: Page }): Promise<Prescription[]>;
  count(tenantId: Id, filter?: PrescriptionFilter): Promise<number>;
  findById(tenantId: Id, id: Id): Promise<Prescription | null>;
  /** The highest RX-<year>-NNNNNN number of that year, or null. */
  findLastNumber(tenantId: Id, year: number): Promise<string | null>;
  /** Throws DuplicateKeyError with field `prescriptionNumber`. */
  create(tenantId: Id, input: PrescriptionInput): Promise<Prescription>;
  /** Loads and saves, so setters and validators run. `null` clears a field. */
  update(
    tenantId: Id,
    id: Id,
    patch: Patch<Pick<Prescription, 'status' | 'notes' | 'scannedCopy' | 'doctorClinic'>>
  ): Promise<UpdateResult<Prescription> | null>;
  /**
   * Marks the items dispensed and sets the status. Reads inside `tx`, so it
   * sees the latest state on every transaction retry. Returns null when the
   * prescription is gone, already closed, or one of the items is dispensed.
   * Call it before touching stock.
   */
  dispenseItems(
    tenantId: Id,
    id: Id,
    itemIndexes: number[],
    dispense: { by: Id; at: Date },
    opts?: { tx?: DbTx }
  ): Promise<Prescription | null>;
}

// ─── E-commerce integrations ────────────────────────────────────────────────

export interface EcommerceIntegration extends Timestamps {
  _id: Id;
  tenantId: Id;
  provider: ChannelProvider;
  shopDomain?: string;
  siteUrl?: string;
  credentialsEncrypted: string;
  webhookSecretEncrypted?: string;
  scopes?: string[];
  shopifyLocationId?: string;
  isActive: boolean;
  lastSyncAt?: Date;
  lastError?: string;
  defaultBranchId?: Id;
}

export type EcommerceIntegrationFields = Partial<Omit<EcommerceIntegration, '_id' | 'tenantId' | 'provider' | keyof Timestamps>>;

export interface EcommerceIntegrationRepo {
  /** The tenant's active integrations. */
  listActive(tenantId: Id): Promise<EcommerceIntegration[]>;
  /** Cheap check run after every sale; callers cache the answer. */
  hasActive(tenantId: Id): Promise<boolean>;
  findActive(tenantId: Id, provider: ChannelProvider): Promise<EcommerceIntegration | null>;
  /** Webhook entry point: the tenant is what the lookup finds out. */
  findActiveByShopDomainAcrossTenants(shopDomain: string): Promise<EcommerceIntegration | null>;
  /** Webhook entry point: the tenant is what the lookup finds out. */
  findByIdAcrossTenants(id: Id): Promise<EcommerceIntegration | null>;
  /** Connects or reconnects the provider. `undefined` values leave the stored field alone. */
  upsert(tenantId: Id, provider: ChannelProvider, set: EcommerceIntegrationFields): Promise<EcommerceIntegration>;
  /** `undefined` values leave the stored field alone. */
  update(tenantId: Id, provider: ChannelProvider, set: EcommerceIntegrationFields): Promise<void>;
  delete(tenantId: Id, provider: ChannelProvider): Promise<void>;
}

// ─── Counters ───────────────────────────────────────────────────────────────

export interface CounterRepo {
  /** Atomically returns the next value of the sequence (1 for a new key). */
  next(key: string): Promise<number>;
}

export interface SalesRepos {
  transactions: TransactionRepo;
  payments: PaymentRepo;
  invoices: InvoiceRepo;
  offlineTransactions: OfflineTransactionRepo;
  savedCarts: SavedCartRepo;
  posSessions: PosSessionRepo;
  stockMovements: StockMovementRepo;
  prescriptions: PrescriptionRepo;
  ecommerceIntegrations: EcommerceIntegrationRepo;
  counters: CounterRepo;
}
