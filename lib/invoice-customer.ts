import type { CustomerAddress } from '@/types/customer';

/**
 * Customer fields to select when populating `Invoice.customerId`.
 * Customer has no `name`/`address` fields — it stores firstName/lastName/addresses[].
 */
export const INVOICE_CUSTOMER_SELECT = 'firstName lastName email phone addresses';

type PopulatedCustomer = {
  firstName?: string;
  lastName?: string;
  addresses?: CustomerAddress[];
  [key: string]: unknown;
};

function isPopulatedCustomer(value: unknown): value is PopulatedCustomer {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('firstName' in value || 'lastName' in value || 'addresses' in value)
  );
}

/**
 * Adds the `name` and `address` keys API consumers of invoices historically expected
 * (the old populate selected those non-existent fields, so they were always missing).
 * `address` is the default address, else the first one. Leaves unpopulated ids untouched.
 */
export function withInvoiceCustomerSummary<T extends { customerId?: unknown }>(invoice: T): T {
  const customer = invoice.customerId;
  if (!isPopulatedCustomer(customer)) return invoice;

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
  const address = addresses.find((a) => a?.isDefault) ?? addresses[0];

  return {
    ...invoice,
    customerId: { ...customer, name, ...(address ? { address } : {}) },
  };
}
