import { shopifyAdminFetch } from '@/lib/ecommerce/shopify-api';
import type { ICustomer } from '@/models/Customer';

interface ShopifyCustomerResponse {
  customer: { id: number };
}

export async function shopifyUpsertCustomer(
  shopDomain: string,
  accessToken: string,
  customer: ICustomer
): Promise<{ shopifyCustomerId: string }> {
  const payload = {
    customer: {
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      tags: (customer.tags || []).join(', '),
    },
  };

  if (customer.shopifyCustomerId) {
    // Update existing
    const data = await shopifyAdminFetch<ShopifyCustomerResponse>(
      shopDomain,
      accessToken,
      `/customers/${customer.shopifyCustomerId}.json`,
      { method: 'PUT', body: JSON.stringify(payload) }
    );
    return { shopifyCustomerId: String(data.customer.id) };
  } else {
    // Create new
    const data = await shopifyAdminFetch<ShopifyCustomerResponse>(
      shopDomain,
      accessToken,
      '/customers.json',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    return { shopifyCustomerId: String(data.customer.id) };
  }
}
