/**
 * Sample records a store can install from Admin > Sample Data to try the till.
 * Only the Retail and General sets exist; any other business type gets General.
 * Customers are clearly fake: named "Sample Customer", tagged Sample, with no phone
 * or email, so a CRM campaign can never reach a real person through them.
 */

export type SampleSet = 'retail' | 'general';

export interface SampleCustomer {
  firstName: string;
  lastName: string;
  tags: string[];
  notes: string;
}

export interface SampleConfig {
  categories: { name: string; description: string }[];
  products: Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  customers: SampleCustomer[];
  discounts: {
    code: string; name: string; type: 'percentage' | 'fixed';
    value: number; minPurchaseAmount?: number; description?: string;
  }[];
}

const SAMPLE_NOTE = 'Sample record from Admin > Sample Data. Not a real person.';

/** Fake customers: same names in every set, so the preview can tell which are already installed. */
function sampleCustomers(tags: string[][]): SampleCustomer[] {
  return tags.map((extra, i) => ({
    firstName: 'Sample',
    lastName: `Customer ${i + 1}`,
    tags: ['Sample', ...extra],
    notes: SAMPLE_NOTE,
  }));
}

export const SAMPLE_DATA: Record<SampleSet, SampleConfig> = {
  retail: {
    categories: [
      { name: 'Electronics',   description: 'Gadgets, accessories, and electronics' },
      { name: 'Clothing',      description: 'Apparel and fashion items' },
      { name: 'Accessories',   description: 'Bags, watches, and fashion accessories' },
      { name: 'Home & Living', description: 'Household items and decor' },
      { name: 'Bundles',       description: 'Value bundle deals' },
    ],
    products: [
      { name: 'Wireless Earbuds Pro',     description: 'Noise-cancelling BT 5.0 earbuds, 30h battery',      price: 2999,  stock: 50,  sku: 'ELEC-001', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'USB-C Fast Charger 65W',   description: '65W GaN charger, universal compatibility',           price: 899,   stock: 80,  sku: 'ELEC-002', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 15 },
      { name: 'Slim Power Bank 20000mAh', description: '20000mAh, dual USB-A + USB-C output',               price: 1499,  stock: 40,  sku: 'ELEC-003', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 8  },
      { name: 'Classic White Tee',        description: 'Premium cotton, unisex, S–XL',                      price: 399,   stock: 120, sku: 'CLO-001',  category: 'Clothing',      productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'Denim Jacket',             description: 'Classic cut, 100% cotton denim',                    price: 1899,  stock: 30,  sku: 'CLO-002',  category: 'Clothing',      productType: 'regular', trackInventory: true,  lowStockThreshold: 5  },
      { name: 'Canvas Tote Bag',          description: 'Heavy-duty canvas, eco-friendly',                   price: 549,   stock: 60,  sku: 'ACC-001',  category: 'Accessories',   productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Minimalist Watch',         description: 'Stainless steel, leather strap, water-resistant',   price: 3499,  stock: 20,  sku: 'ACC-002',  category: 'Accessories',   productType: 'regular', trackInventory: true,  lowStockThreshold: 5  },
      { name: 'Scented Candle Set',       description: 'Set of 3 — lavender, vanilla, sandalwood',         price: 799,   stock: 45,  sku: 'HOME-001', category: 'Home & Living', productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Ceramic Coffee Mug',       description: '350ml ceramic, dishwasher safe',                    price: 299,   stock: 100, sku: 'HOME-002', category: 'Home & Living', productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'Tech Starter Bundle',      description: 'Earbuds + USB-C charger combo deal',                price: 3699,  stock: 20,  sku: 'BUN-001',  category: 'Bundles',       productType: 'bundle',  trackInventory: false },
    ],
    customers: sampleCustomers([['VIP', 'Regular'], ['Regular'], ['Wholesale'], ['VIP'], ['Regular']]),
    discounts: [
      { code: 'WELCOME10', name: 'Welcome 10% Off', type: 'percentage', value: 10, description: 'First-time customer discount' },
      { code: 'SAVE100',   name: 'Save ₱100',       type: 'fixed',      value: 100, minPurchaseAmount: 800, description: 'Min. ₱800 purchase' },
      { code: 'VIP20',     name: 'VIP 20% Off',     type: 'percentage', value: 20, description: 'Exclusive VIP member discount' },
    ],
  },

  general: {
    categories: [
      { name: 'Office Supplies', description: 'Stationery, consumables, and office essentials' },
      { name: 'Snacks & Drinks', description: 'Quick bites and beverages' },
      { name: 'Cleaning',        description: 'Cleaning products and supplies' },
      { name: 'Services',        description: 'Miscellaneous services offered' },
      { name: 'Combos',          description: 'Popular product combos' },
    ],
    products: [
      { name: 'Ballpen (Blue) — 12pcs',  description: 'Reliable medium-tip ballpen, blue ink, box of 12', price: 89,  stock: 200, sku: 'OFF-001', category: 'Office Supplies', productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'A4 Paper Ream 500 sheets', description: '80gsm A4 printing paper, 500 sheets',             price: 199, stock: 100, sku: 'OFF-002', category: 'Office Supplies', productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Stapler (Standard)',        description: 'Desktop stapler with 1000pc staples included',   price: 149, stock: 50,  sku: 'OFF-003', category: 'Office Supplies', productType: 'regular', trackInventory: true,  lowStockThreshold: 5  },
      { name: 'Sticky Notes 3x3 (5pk)',   description: 'Yellow sticky notes, 100 sheets each',           price: 75,  stock: 150, sku: 'OFF-004', category: 'Office Supplies', productType: 'regular', trackInventory: true,  lowStockThreshold: 15 },
      { name: 'Bottled Water 500ml',       description: 'Purified drinking water',                        price: 20,  stock: 500, sku: 'DRK-001', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true,  lowStockThreshold: 50 },
      { name: 'Instant Coffee Sachet',     description: '3-in-1 instant coffee, 20g sachet',              price: 15,  stock: 300, sku: 'DRK-002', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true,  lowStockThreshold: 50 },
      { name: 'Mixed Nuts Snack Pack',     description: '30g mixed roasted nuts, single serving',         price: 45,  stock: 120, sku: 'SNK-001', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'All-Purpose Cleaner 1L',    description: 'Disinfectant cleaner, citrus scent',             price: 115, stock: 80,  sku: 'CLN-001', category: 'Cleaning',        productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Trash Bags (M) — 10pcs',   description: 'Medium garbage bags, black, tie-top closure',    price: 55,  stock: 120, sku: 'CLN-002', category: 'Cleaning',        productType: 'regular', trackInventory: true,  lowStockThreshold: 15 },
      { name: 'Lamination Service (A4)',   description: 'Hot lamination, A4 size, same-day',              price: 25,  stock: 999, sku: 'SVC-001', category: 'Services',        productType: 'service', trackInventory: false },
      { name: 'Photocopying (per page)',   description: 'Black & white photocopy, A4',                    price: 3,   stock: 999, sku: 'SVC-002', category: 'Services',        productType: 'service', trackInventory: false },
      { name: 'Office Starter Pack',       description: 'Ballpen box + ream + sticky notes + stapler',   price: 499, stock: 30,  sku: 'COM-001', category: 'Combos',          productType: 'bundle',  trackInventory: true,  lowStockThreshold: 5  },
    ],
    customers: sampleCustomers([['Regular'], ['Regular'], ['Wholesale']]),
    discounts: [
      { code: 'BULK5',     name: 'Bulk Purchase 5%',       type: 'percentage', value: 5,  minPurchaseAmount: 500, description: 'On orders ₱500 and above' },
      { code: 'LOYALCARD', name: 'Loyalty Card Discount',  type: 'fixed',      value: 50, minPurchaseAmount: 300, description: 'For loyalty card holders' },
    ],
  },
};

/** The sample set for a store's business type: Retail gets Retail, everything else General. */
export function sampleSetFor(businessType: unknown): SampleSet {
  return businessType === 'retail' ? 'retail' : 'general';
}
