/**
 * Customer types shared by client hooks, API JSON, and Mongoose model.
 * Mirrors `models/Customer.ts` — keep in sync when the schema changes.
 */

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  isDefault?: boolean;
}

/**
 * Customer as serialized in API responses (`lean()` + JSON).
 * Dates are ISO strings; ObjectIds are strings.
 */
export interface Customer {
  _id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  addresses?: CustomerAddress[];
  dateOfBirth?: string | null;
  notes?: string;
  tags?: string[];
  totalSpent?: number;
  lastPurchaseDate?: string | null;
  loyaltyPointsBalance?: number;
  accountBalance?: number;
  creditLimit?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Subset used by POS customer search / side panel when full list fields are not loaded.
 */
export type CustomerSummary = Pick<
  Customer,
  | '_id'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'totalSpent'
  | 'lastPurchaseDate'
  | 'loyaltyPointsBalance'
  | 'accountBalance'
  | 'creditLimit'
>;
