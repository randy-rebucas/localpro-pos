/**
 * Sales domain: transactions (+ line items and split payments), payments,
 * invoices, offline transactions, saved carts, customer-display POS sessions,
 * stock movements, prescriptions and the receipt/invoice number counters.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { id, money, objectId, quantity, rate, tenantId, timestamps, timestamptz } from './_columns';
import { users } from './core';
import { branches, devices, diningTables } from './org';
import { customers } from './customers';
import { products } from './catalog';

export const TRANSACTION_DISCOUNT_CATEGORIES = ['general', 'senior', 'pwd', 'employee', 'promo'] as const;
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
export const TRANSACTION_STATUSES = ['completed', 'cancelled', 'refunded'] as const;
export const ORDER_TYPES = ['dine-in', 'takeout', 'delivery'] as const;
export const SALES_CHANNELS = ['pos', 'shopify', 'woocommerce'] as const;

// models/Transaction.ts
// Repository: discount_code is uppercased + trimmed (Mongoose setters today).
export const transactions = pgTable(
  'transactions',
  {
    id: id(),
    tenantId: tenantId(),
    branchId: objectId('branch_id').references((): AnyPgColumn => branches.id, { onDelete: 'set null' }),
    // Total before discount
    subtotal: money('subtotal').notNull(),
    discountCode: text('discount_code'),
    discountCategory: text('discount_category', { enum: TRANSACTION_DISCOUNT_CATEGORIES }),
    discountAmount: money('discount_amount'),
    // BIR: SC/PWD name and ID when discount_category is senior/pwd
    scPwdName: text('sc_pwd_name'),
    scPwdId: text('sc_pwd_id'),
    taxExemptAmount: money('tax_exempt_amount').notNull().default(0),
    zeroRatedAmount: money('zero_rated_amount').notNull().default(0),
    taxAmount: money('tax_amount').notNull().default(0),
    total: money('total').notNull(),
    paymentMethod: text('payment_method', { enum: TRANSACTION_PAYMENT_METHODS }).notNull(),
    paymentProvider: text('payment_provider'),
    paymentReference: text('payment_reference'),
    bnplInstallments: integer('bnpl_installments'),
    cashReceived: money('cash_received'),
    change: money('change'),
    status: text('status', { enum: TRANSACTION_STATUSES }).notNull().default('completed'),
    customerId: objectId('customer_id').references((): AnyPgColumn => customers.id, { onDelete: 'set null' }),
    loyaltyPointsEarned: integer('loyalty_points_earned'),
    loyaltyPointsRedeemed: integer('loyalty_points_redeemed'),
    userId: objectId('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    deviceId: objectId('device_id').references((): AnyPgColumn => devices.id, { onDelete: 'set null' }),
    // Snapshots of the device at time of sale
    terminalId: text('terminal_id'),
    deviceSerialNumber: text('device_serial_number'),
    receiptNumber: text('receipt_number'),
    idempotencyKey: text('idempotency_key'),
    notes: text('notes'),
    displayCurrency: text('display_currency'),
    displayTotal: money('display_total'),
    // Restaurant
    orderType: text('order_type', { enum: ORDER_TYPES }),
    tableNumber: text('table_number'),
    tableId: objectId('table_id').references((): AnyPgColumn => diningTables.id, { onDelete: 'set null' }),
    splitCount: integer('split_count'),
    // Imported online orders
    salesChannel: text('sales_channel', { enum: SALES_CHANNELS }),
    externalOrderId: text('external_order_id'),
    // `${provider}:${externalOrderId}`
    channelSyncKey: text('channel_sync_key'),
    channelImportedAt: timestamptz('channel_imported_at'),
    shopifyFulfilledAt: timestamptz('shopify_fulfilled_at'),
    shopifyFulfillmentId: text('shopify_fulfillment_id'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('transactions_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('transactions_tenant_active_created_idx').on(t.tenantId, t.isActive, t.createdAt.desc()),
    index('transactions_tenant_branch_created_idx').on(t.tenantId, t.branchId, t.createdAt.desc()),
    index('transactions_tenant_status_created_idx').on(t.tenantId, t.status, t.createdAt.desc()),
    index('transactions_tenant_customer_created_idx').on(t.tenantId, t.customerId, t.createdAt.desc()),
    index('transactions_tenant_user_created_idx').on(t.tenantId, t.userId, t.createdAt.desc()),
    uniqueIndex('transactions_tenant_receipt_number_key')
      .on(t.tenantId, t.receiptNumber)
      .where(sql`${t.receiptNumber} IS NOT NULL`),
    uniqueIndex('transactions_tenant_idempotency_key_key')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    uniqueIndex('transactions_tenant_channel_sync_key_key')
      .on(t.tenantId, t.channelSyncKey)
      .where(sql`${t.channelSyncKey} IS NOT NULL AND ${t.channelSyncKey} <> ''`),
    check(
      'transactions_discount_category_check',
      sql`${t.discountCategory} IS NULL OR ${t.discountCategory} IN ('general', 'senior', 'pwd', 'employee', 'promo')`
    ),
    check(
      'transactions_payment_method_check',
      sql`${t.paymentMethod} IN ('cash', 'card', 'digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'on_account')`
    ),
    check('transactions_status_check', sql`${t.status} IN ('completed', 'cancelled', 'refunded')`),
    check(
      'transactions_order_type_check',
      sql`${t.orderType} IS NULL OR ${t.orderType} IN ('dine-in', 'takeout', 'delivery')`
    ),
    check(
      'transactions_sales_channel_check',
      sql`${t.salesChannel} IS NULL OR ${t.salesChannel} IN ('pos', 'shopify', 'woocommerce')`
    ),
    check(
      'transactions_amounts_non_negative',
      sql`${t.subtotal} >= 0 AND ${t.total} >= 0
        AND ${t.taxExemptAmount} >= 0 AND ${t.zeroRatedAmount} >= 0 AND ${t.taxAmount} >= 0
        AND (${t.discountAmount} IS NULL OR ${t.discountAmount} >= 0)
        AND (${t.cashReceived} IS NULL OR ${t.cashReceived} >= 0)
        AND (${t.change} IS NULL OR ${t.change} >= 0)
        AND (${t.displayTotal} IS NULL OR ${t.displayTotal} >= 0)
        AND (${t.loyaltyPointsEarned} IS NULL OR ${t.loyaltyPointsEarned} >= 0)
        AND (${t.loyaltyPointsRedeemed} IS NULL OR ${t.loyaltyPointsRedeemed} >= 0)`
    ),
    check('transactions_bnpl_installments_min', sql`${t.bnplInstallments} IS NULL OR ${t.bnplInstallments} >= 1`),
    check('transactions_split_count_min', sql`${t.splitCount} IS NULL OR ${t.splitCount} >= 2`),
  ]
);

// models/Transaction.ts — items[] (subdoc _id kept as id)
export const transactionItems = pgTable(
  'transaction_items',
  {
    id: id(),
    tenantId: tenantId(),
    transactionId: objectId('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    // Null for manual/custom items. RESTRICT approximates the Product delete
    // guard (which only blocked on *completed* transactions; products are
    // soft-deleted in practice).
    productId: objectId('product_id').references(() => products.id),
    name: text('name').notNull(),
    price: money('price').notNull(),
    quantity: quantity('quantity').notNull(),
    subtotal: money('subtotal').notNull(),
    // Null when the item had no modifiers (Mongo default: undefined)
    modifiers: jsonb('modifiers').$type<Array<{ name: string; chosenOption: string; price: number }>>(),
    // Pharmacy: Rx item → prescription
    prescriptionId: objectId('prescription_id').references((): AnyPgColumn => prescriptions.id, {
      onDelete: 'set null',
    }),
  },
  t => [
    index('transaction_items_transaction_position_idx').on(t.transactionId, t.position),
    // Product delete guard lookup ({ tenantId, 'items.product' }) and RESTRICT check
    index('transaction_items_tenant_product_idx').on(t.tenantId, t.productId),
    check('transaction_items_quantity_min', sql`${t.quantity} >= 1`),
  ]
);

// models/Transaction.ts — splitPayments[] (no subdoc _id; ETL generates ids)
export const transactionSplitPayments = pgTable(
  'transaction_split_payments',
  {
    id: id(),
    tenantId: tenantId(),
    transactionId: objectId('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    guestIndex: integer('guest_index').notNull(),
    // Free-form in Mongo (no enum)
    method: text('method').notNull(),
    amount: money('amount').notNull(),
    reference: text('reference'),
  },
  t => [
    index('transaction_split_payments_transaction_position_idx').on(t.transactionId, t.position),
    check('transaction_split_payments_amount_non_negative', sql`${t.amount} >= 0`),
  ]
);

export const PAYMENT_METHODS = ['cash', 'card', 'digital', 'check', 'other', 'on_account'] as const;
export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded'] as const;

// models/Payment.ts
export const payments = pgTable(
  'payments',
  {
    id: id(),
    tenantId: tenantId(),
    transactionId: objectId('transaction_id')
      .notNull()
      .references(() => transactions.id),
    method: text('method', { enum: PAYMENT_METHODS }).notNull(),
    amount: money('amount').notNull(),
    status: text('status', { enum: PAYMENT_STATUSES }).notNull().default('pending'),
    details: jsonb('details').$type<{
      cardLast4?: string;
      cardType?: string;
      cardBrand?: string;
      transactionId?: string;
      provider?: string;
      cashReceived?: number;
      change?: number;
      checkNumber?: string;
      notes?: string;
    }>(),
    processedBy: objectId('processed_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    processedAt: timestamptz('processed_at'),
    refundedAt: timestamptz('refunded_at'),
    refundReason: text('refund_reason'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('payments_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('payments_tenant_transaction_idx').on(t.tenantId, t.transactionId),
    index('payments_tenant_status_created_idx').on(t.tenantId, t.status, t.createdAt.desc()),
    index('payments_tenant_method_created_idx').on(t.tenantId, t.method, t.createdAt.desc()),
    index('payments_tenant_status_method_created_idx').on(t.tenantId, t.status, t.method, t.createdAt.desc()),
    check('payments_method_check', sql`${t.method} IN ('cash', 'card', 'digital', 'check', 'other', 'on_account')`),
    check('payments_status_check', sql`${t.status} IN ('pending', 'completed', 'failed', 'refunded')`),
    check('payments_amount_non_negative', sql`${t.amount} >= 0`),
  ]
);

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;

// models/Invoice.ts
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    tenantId: tenantId(),
    // INV-YYYYMMDD-XXXXX (counters table)
    invoiceNumber: text('invoice_number').notNull(),
    transactionId: objectId('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    customerId: objectId('customer_id').references((): AnyPgColumn => customers.id, { onDelete: 'set null' }),
    // Snapshot of the customer at invoice creation, read as a whole
    customerInfo: jsonb('customer_info').$type<{
      name: string;
      email?: string;
      phone?: string;
      address?: {
        street?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
      };
    }>(),
    subtotal: money('subtotal').notNull(),
    discountAmount: money('discount_amount'),
    taxAmount: money('tax_amount').notNull().default(0),
    total: money('total').notNull(),
    dueDate: timestamptz('due_date').notNull(),
    paymentTerms: text('payment_terms'),
    status: text('status', { enum: INVOICE_STATUSES }).notNull().default('draft'),
    paidAt: timestamptz('paid_at'),
    paidAmount: money('paid_amount'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    uniqueIndex('invoices_tenant_invoice_number_key').on(t.tenantId, t.invoiceNumber),
    index('invoices_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('invoices_tenant_status_due_date_idx').on(t.tenantId, t.status, t.dueDate),
    index('invoices_tenant_customer_idx').on(t.tenantId, t.customerId),
    index('invoices_tenant_transaction_idx').on(t.tenantId, t.transactionId),
    check('invoices_status_check', sql`${t.status} IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')`),
    check(
      'invoices_amounts_non_negative',
      sql`${t.subtotal} >= 0 AND ${t.taxAmount} >= 0 AND ${t.total} >= 0
        AND (${t.discountAmount} IS NULL OR ${t.discountAmount} >= 0)
        AND (${t.paidAmount} IS NULL OR ${t.paidAmount} >= 0)`
    ),
  ]
);

// models/Invoice.ts — items[] (no subdoc _id; ETL generates ids)
export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: id(),
    tenantId: tenantId(),
    invoiceId: objectId('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    quantity: quantity('quantity').notNull(),
    price: money('price').notNull(),
    subtotal: money('subtotal').notNull(),
  },
  t => [
    index('invoice_items_invoice_position_idx').on(t.invoiceId, t.position),
    check(
      'invoice_items_values_check',
      sql`${t.quantity} >= 1 AND ${t.price} >= 0 AND ${t.subtotal} >= 0`
    ),
  ]
);

export const OFFLINE_PAYMENT_METHODS = ['cash', 'card', 'digital'] as const;
export const OFFLINE_SYNC_STATUSES = ['pending', 'processing', 'synced', 'failed'] as const;

// models/OfflineTransaction.ts
// Repository: discount_code is uppercased + trimmed.
export const offlineTransactions = pgTable(
  'offline_transactions',
  {
    id: id(),
    tenantId: tenantId(),
    branchId: objectId('branch_id').references((): AnyPgColumn => branches.id, { onDelete: 'set null' }),
    // Client-generated device identifier (String in Mongo), not devices.id
    deviceId: text('device_id').notNull(),
    subtotal: money('subtotal').notNull(),
    discountCode: text('discount_code'),
    discountCategory: text('discount_category', { enum: TRANSACTION_DISCOUNT_CATEGORIES }),
    discountAmount: money('discount_amount'),
    taxExemptAmount: money('tax_exempt_amount').notNull().default(0),
    taxAmount: money('tax_amount').notNull().default(0),
    total: money('total').notNull(),
    paymentMethod: text('payment_method', { enum: OFFLINE_PAYMENT_METHODS }).notNull(),
    cashReceived: money('cash_received'),
    change: money('change'),
    customerId: objectId('customer_id').references((): AnyPgColumn => customers.id, { onDelete: 'set null' }),
    userId: objectId('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    // When the sale happened on the device
    offlineCreatedAt: timestamptz('offline_created_at').notNull().defaultNow(),
    syncStatus: text('sync_status', { enum: OFFLINE_SYNC_STATUSES }).notNull().default('pending'),
    syncedTransactionId: objectId('synced_transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    retryCount: integer('retry_count').notNull().default(0),
    syncError: text('sync_error'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('offline_transactions_tenant_sync_status_idx').on(t.tenantId, t.syncStatus),
    index('offline_transactions_tenant_device_offline_created_idx').on(
      t.tenantId,
      t.deviceId,
      t.offlineCreatedAt.desc()
    ),
    index('offline_transactions_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    // TTL in Mongo: synced rows expire 30 days after updated_at — enforced by lib/automations/ttl-cleanup.ts
    index('offline_transactions_synced_updated_at_idx')
      .on(t.updatedAt)
      .where(sql`${t.syncStatus} = 'synced'`),
    check(
      'offline_transactions_discount_category_check',
      sql`${t.discountCategory} IS NULL OR ${t.discountCategory} IN ('general', 'senior', 'pwd', 'employee', 'promo')`
    ),
    check('offline_transactions_payment_method_check', sql`${t.paymentMethod} IN ('cash', 'card', 'digital')`),
    check(
      'offline_transactions_sync_status_check',
      sql`${t.syncStatus} IN ('pending', 'processing', 'synced', 'failed')`
    ),
    check(
      'offline_transactions_amounts_non_negative',
      sql`${t.subtotal} >= 0 AND ${t.total} >= 0 AND ${t.taxExemptAmount} >= 0 AND ${t.taxAmount} >= 0
        AND (${t.discountAmount} IS NULL OR ${t.discountAmount} >= 0)
        AND (${t.cashReceived} IS NULL OR ${t.cashReceived} >= 0)
        AND (${t.change} IS NULL OR ${t.change} >= 0)
        AND ${t.retryCount} >= 0`
    ),
  ]
);

// models/OfflineTransaction.ts — items[] (subdoc _id kept as id)
export const offlineTransactionItems = pgTable(
  'offline_transaction_items',
  {
    id: id(),
    tenantId: tenantId(),
    offlineTransactionId: objectId('offline_transaction_id')
      .notNull()
      .references(() => offlineTransactions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    productId: objectId('product_id').references(() => products.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    price: money('price').notNull(),
    quantity: quantity('quantity').notNull(),
    subtotal: money('subtotal').notNull(),
  },
  t => [
    index('offline_transaction_items_parent_position_idx').on(t.offlineTransactionId, t.position),
    check(
      'offline_transaction_items_values_check',
      sql`${t.quantity} >= 1 AND ${t.price} >= 0 AND ${t.subtotal} >= 0`
    ),
  ]
);

// models/SavedCart.ts
// Repository: discount_code is uppercased + trimmed.
export const savedCarts = pgTable(
  'saved_carts',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull().default('Saved Cart'),
    subtotal: money('subtotal').notNull(),
    discountCode: text('discount_code'),
    discountAmount: money('discount_amount'),
    total: money('total').notNull(),
    userId: objectId('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('saved_carts_tenant_user_created_idx').on(t.tenantId, t.userId, t.createdAt.desc()),
    // TTL in Mongo: inactive carts expire 90 days after updated_at — enforced by lib/automations/ttl-cleanup.ts
    index('saved_carts_inactive_updated_at_idx')
      .on(t.updatedAt)
      .where(sql`${t.isActive} = false`),
    check(
      'saved_carts_amounts_non_negative',
      sql`${t.subtotal} >= 0 AND ${t.total} >= 0 AND (${t.discountAmount} IS NULL OR ${t.discountAmount} >= 0)`
    ),
  ]
);

// models/SavedCart.ts — items[] (subdoc _id kept as id)
export const savedCartItems = pgTable(
  'saved_cart_items',
  {
    id: id(),
    tenantId: tenantId(),
    savedCartId: objectId('saved_cart_id')
      .notNull()
      .references(() => savedCarts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    // RESTRICT mirrors the Product delete guard (saved carts reference the product)
    productId: objectId('product_id')
      .notNull()
      .references(() => products.id),
    name: text('name').notNull(),
    price: money('price').notNull(),
    quantity: quantity('quantity').notNull(),
    // Stock snapshot when the cart was saved
    stock: quantity('stock').notNull(),
  },
  t => [
    index('saved_cart_items_cart_position_idx').on(t.savedCartId, t.position),
    // Product delete guard lookup ({ tenantId, 'items.productId' }) and RESTRICT check
    index('saved_cart_items_tenant_product_idx').on(t.tenantId, t.productId),
    check(
      'saved_cart_items_values_check',
      sql`${t.price} >= 0 AND ${t.quantity} >= 1 AND ${t.stock} >= 0`
    ),
  ]
);

export const POS_SESSION_PAYMENT_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;

// models/PosSession.ts — customer-display cart mirror
export const posSessions = pgTable(
  'pos_sessions',
  {
    id: id(),
    // Mongo stores this as a free string field `tenant`; the ETL resolves the
    // slug/id string to tenants.id.
    tenantId: tenantId(),
    sessionId: text('session_id').notNull(),
    // Opaque client cart (Mongo `Array`), always replaced as a whole
    cart: jsonb('cart').$type<Array<Record<string, unknown>>>().notNull().default([]),
    subtotal: money('subtotal').notNull().default(0),
    // Mongo `Mixed`, default null
    discount: jsonb('discount').$type<Record<string, unknown> | null>(),
    taxAmount: money('tax_amount'),
    taxRate: rate('tax_rate'),
    taxLabel: text('tax_label'),
    tip: money('tip').notNull().default(0),
    total: money('total').notNull().default(0),
    paymentMethod: text('payment_method'),
    paymentStatus: text('payment_status', { enum: POS_SESSION_PAYMENT_STATUSES }).notNull().default('pending'),
    // Epoch ms sent to the display client
    lastUpdate: bigint('last_update', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    ...timestamps(),
  },
  t => [
    uniqueIndex('pos_sessions_session_id_key').on(t.sessionId),
    // TTL in Mongo: sessions expire 1 hour after updated_at — enforced by lib/automations/ttl-cleanup.ts
    index('pos_sessions_updated_at_idx').on(t.updatedAt),
    check(
      'pos_sessions_payment_status_check',
      sql`${t.paymentStatus} IN ('pending', 'processing', 'completed', 'failed')`
    ),
  ]
);

export const STOCK_MOVEMENT_TYPES = ['sale', 'purchase', 'adjustment', 'return', 'damage', 'transfer'] as const;

// models/StockMovement.ts
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    tenantId: tenantId(),
    productId: objectId('product_id')
      .notNull()
      .references(() => products.id),
    branchId: objectId('branch_id').references((): AnyPgColumn => branches.id, { onDelete: 'set null' }),
    // Variation is identified by its values, not by product_variations.id (keep as-is)
    variationSize: text('variation_size'),
    variationColor: text('variation_color'),
    variationType: text('variation_type'),
    type: text('type', { enum: STOCK_MOVEMENT_TYPES }).notNull(),
    // Signed: positive adds, negative subtracts
    quantity: quantity('quantity').notNull(),
    previousStock: quantity('previous_stock').notNull(),
    newStock: quantity('new_stock').notNull(),
    reason: text('reason'),
    transactionId: objectId('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    userId: objectId('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...timestamps(),
  },
  t => [
    index('stock_movements_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('stock_movements_tenant_product_created_idx').on(t.tenantId, t.productId, t.createdAt.desc()),
    index('stock_movements_tenant_branch_product_created_idx').on(
      t.tenantId,
      t.branchId,
      t.productId,
      t.createdAt.desc()
    ),
    index('stock_movements_tenant_type_created_idx').on(t.tenantId, t.type, t.createdAt.desc()),
    check(
      'stock_movements_type_check',
      sql`${t.type} IN ('sale', 'purchase', 'adjustment', 'return', 'damage', 'transfer')`
    ),
  ]
);

export const PRESCRIPTION_STATUSES = ['pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled'] as const;

// models/Prescription.ts
// Repository: "at least one item" validator.
export const prescriptions = pgTable(
  'prescriptions',
  {
    id: id(),
    tenantId: tenantId(),
    // RX-YYYY-NNNNNN
    prescriptionNumber: text('prescription_number').notNull(),
    patientName: text('patient_name').notNull(),
    patientAge: integer('patient_age'),
    doctorName: text('doctor_name').notNull(),
    doctorPrcNumber: text('doctor_prc_number').notNull(),
    doctorClinic: text('doctor_clinic'),
    issuedDate: timestamptz('issued_date').notNull(),
    validUntil: timestamptz('valid_until').notNull(),
    transactionId: objectId('transaction_id').references((): AnyPgColumn => transactions.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: PRESCRIPTION_STATUSES }).notNull().default('pending'),
    notes: text('notes'),
    // URL of the uploaded scan
    scannedCopy: text('scanned_copy'),
    createdBy: objectId('created_by')
      .notNull()
      .references((): AnyPgColumn => users.id),
    ...timestamps(),
  },
  t => [
    index('prescriptions_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    index('prescriptions_tenant_status_created_idx').on(t.tenantId, t.status, t.createdAt.desc()),
    uniqueIndex('prescriptions_tenant_prescription_number_key').on(t.tenantId, t.prescriptionNumber),
    index('prescriptions_tenant_valid_until_idx').on(t.tenantId, t.validUntil),
    // Mongo { tenantId: 1, patientName: 'text' } → ILIKE with pg_trgm
    index('prescriptions_patient_name_trgm_idx').using('gin', sql`${t.patientName} gin_trgm_ops`),
    check(
      'prescriptions_status_check',
      sql`${t.status} IN ('pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled')`
    ),
    check('prescriptions_patient_age_non_negative', sql`${t.patientAge} IS NULL OR ${t.patientAge} >= 0`),
  ]
);

// models/Prescription.ts — items[] (no subdoc _id; ETL generates ids)
export const prescriptionItems = pgTable(
  'prescription_items',
  {
    id: id(),
    tenantId: tenantId(),
    prescriptionId: objectId('prescription_id')
      .notNull()
      .references(() => prescriptions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    productId: objectId('product_id').references(() => products.id, { onDelete: 'set null' }),
    drugName: text('drug_name').notNull(),
    quantity: quantity('quantity').notNull(),
    dosage: text('dosage').notNull(),
    frequency: text('frequency').notNull(),
    instructions: text('instructions'),
    dispensed: boolean('dispensed').notNull().default(false),
    dispensedAt: timestamptz('dispensed_at'),
    dispensedBy: objectId('dispensed_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    dispensedTransactionId: objectId('dispensed_transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
  },
  t => [
    index('prescription_items_prescription_position_idx').on(t.prescriptionId, t.position),
    check('prescription_items_quantity_min', sql`${t.quantity} >= 1`),
  ]
);

// lib/receipt.ts (inline Counter schema). key = "REC-YYYYMMDD-<tenantId>" / "INV-...";
// $inc + upsert → INSERT ... ON CONFLICT (key) DO UPDATE SET seq = counters.seq + 1 RETURNING seq.
export const counters = pgTable('counters', {
  key: text('key').primaryKey(),
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
});
