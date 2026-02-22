import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Category from '@/models/Category';
import Product from '@/models/Product';
import Customer from '@/models/Customer';
import Discount from '@/models/Discount';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

// ── Sample data per business type ────────────────────────────────────────────

type BizType = 'retail' | 'restaurant' | 'laundry' | 'service' | 'general';

interface SeedConfig {
  categories: { name: string; description: string }[];
  products: Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  customers: { firstName: string; lastName: string; email?: string; phone?: string; tags?: string[] }[];
  discounts: {
    code: string; name: string; type: 'percentage' | 'fixed';
    value: number; minPurchaseAmount?: number; description?: string;
  }[];
}

const SAMPLE_DATA: Record<BizType, SeedConfig> = {
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
    customers: [
      { firstName: 'Maria',   lastName: 'Santos',    email: 'maria.s@example.com',   phone: '+63-917-000-0001', tags: ['VIP', 'Regular'] },
      { firstName: 'Juan',    lastName: 'dela Cruz',                                  phone: '+63-917-000-0002', tags: ['Regular'] },
      { firstName: 'Angela',  lastName: 'Reyes',     email: 'angela.r@example.com',  phone: '+63-917-000-0003', tags: ['Wholesale'] },
      { firstName: 'Ricardo', lastName: 'Lim',       email: 'ric.lim@example.com',   phone: '+63-917-000-0004', tags: ['VIP'] },
      { firstName: 'Sofia',   lastName: 'Tan',                                        phone: '+63-917-000-0005', tags: ['Regular'] },
    ],
    discounts: [
      { code: 'WELCOME10', name: 'Welcome 10% Off', type: 'percentage', value: 10, description: 'First-time customer discount' },
      { code: 'SAVE100',   name: 'Save ₱100',       type: 'fixed',      value: 100, minPurchaseAmount: 800, description: 'Min. ₱800 purchase' },
      { code: 'VIP20',     name: 'VIP 20% Off',     type: 'percentage', value: 20, description: 'Exclusive VIP member discount' },
    ],
  },

  restaurant: {
    categories: [
      { name: 'Appetizers',  description: 'Starters and sharing plates' },
      { name: 'Main Course', description: 'Signature main dishes' },
      { name: 'Desserts',    description: 'Sweet endings' },
      { name: 'Beverages',   description: 'Drinks — hot, cold, and blended' },
      { name: 'Set Meals',   description: 'Complete meal bundles' },
    ],
    products: [
      { name: 'Crispy Calamari',       description: 'Golden fried squid rings with aioli dip',                    price: 285,  stock: 999, category: 'Appetizers',  productType: 'regular', trackInventory: false, allergens: ['seafood','gluten'],    modifiers: [{ name: 'Sauce', options: [{ name: 'Aioli', price: 0 }, { name: 'Sweet Chili', price: 0 }], required: true }] },
      { name: 'Chicken Wings (6pcs)',  description: 'Crispy wings, choose your sauce',                             price: 320,  stock: 999, category: 'Appetizers',  productType: 'regular', trackInventory: false, modifiers: [{ name: 'Sauce', options: [{ name: 'Buffalo', price: 0 }, { name: 'BBQ', price: 0 }, { name: 'Honey Garlic', price: 0 }], required: true }] },
      { name: 'Grilled Salmon',        description: '180g Atlantic salmon, seasonal vegetables, lemon butter',     price: 680,  stock: 999, category: 'Main Course', productType: 'regular', trackInventory: false, allergens: ['seafood','dairy'],      nutritionInfo: { calories: 420, protein: 38, carbs: 12, fat: 24 } },
      { name: 'Pork Ribs Half Rack',   description: 'Slow-cooked BBQ ribs, coleslaw, corn bread',                 price: 750,  stock: 999, category: 'Main Course', productType: 'regular', trackInventory: false },
      { name: 'Truffle Mushroom Pasta',description: 'Tagliatelle, wild mushrooms, truffle cream sauce',            price: 480,  stock: 999, category: 'Main Course', productType: 'regular', trackInventory: false, allergens: ['gluten','dairy'],       modifiers: [{ name: 'Protein', options: [{ name: 'None', price: 0 }, { name: 'Chicken', price: 80 }, { name: 'Shrimp', price: 120 }], required: false }] },
      { name: 'Wagyu Beef Burger',     description: '150g wagyu patty, brioche bun, truffle fries',               price: 595,  stock: 999, category: 'Main Course', productType: 'regular', trackInventory: false, allergens: ['gluten','dairy'] },
      { name: 'Chocolate Lava Cake',   description: 'Warm chocolate cake, vanilla ice cream',                     price: 220,  stock: 999, category: 'Desserts',    productType: 'regular', trackInventory: false, allergens: ['gluten','dairy','eggs'] },
      { name: 'Mango Panna Cotta',     description: 'Silky panna cotta, fresh mango coulis',                      price: 195,  stock: 999, category: 'Desserts',    productType: 'regular', trackInventory: false, allergens: ['dairy'] },
      { name: 'Artisan Lemonade',      description: 'Fresh-squeezed, rosemary syrup, 500ml',                      price: 150,  stock: 999, category: 'Beverages',   productType: 'regular', trackInventory: false, modifiers: [{ name: 'Size', options: [{ name: 'Regular', price: 0 }, { name: 'Large', price: 50 }], required: true }] },
      { name: 'Pour-Over Coffee',      description: 'Single-origin, hand-poured',                                 price: 175,  stock: 999, category: 'Beverages',   productType: 'regular', trackInventory: false, modifiers: [{ name: 'Temperature', options: [{ name: 'Hot', price: 0 }, { name: 'Iced', price: 30 }], required: true }] },
      { name: 'Lunch Set A',           description: 'Soup + any main + iced tea',                                 price: 550,  stock: 999, category: 'Set Meals',   productType: 'bundle',  trackInventory: false },
      { name: 'Date Night for Two',    description: 'Appetizer + 2 mains + 1 dessert + 2 drinks',                 price: 1480, stock: 999, category: 'Set Meals',   productType: 'bundle',  trackInventory: false },
    ],
    customers: [
      { firstName: 'Elena', lastName: 'Garcia',    email: 'elena.g@example.com', phone: '+63-917-100-0001', tags: ['Regular'] },
      { firstName: 'Marco', lastName: 'Bautista',                                phone: '+63-917-100-0002', tags: ['VIP', 'Regular'] },
      { firstName: 'Lena',  lastName: 'Ocampo',   email: 'lena.o@example.com',  phone: '+63-917-100-0003', tags: ['Regular'] },
    ],
    discounts: [
      { code: 'LUNCH15',  name: 'Lunch Promo 15%',      type: 'percentage', value: 15, minPurchaseAmount: 400, description: '11am–2pm weekdays' },
      { code: 'BDAY',     name: 'Birthday Free Dessert', type: 'fixed',      value: 220, description: 'Free chocolate lava cake on birthday' },
      { code: 'TABLE10',  name: 'Group Dining 10%',      type: 'percentage', value: 10, minPurchaseAmount: 3000, description: 'Table of 10 or more' },
    ],
  },

  laundry: {
    categories: [
      { name: 'Wash & Fold',  description: 'Regular laundry wash, dry, and fold service' },
      { name: 'Dry Cleaning', description: 'Professional dry cleaning for delicate fabrics' },
      { name: 'Pressing',     description: 'Ironing and pressing service' },
      { name: 'Specialty',    description: 'Curtains, beddings, and specialty items' },
      { name: 'Express',      description: 'Same-day and rush service' },
    ],
    products: [
      { name: 'Wash & Fold (per kg)',     description: 'Machine wash, tumble dry, folded. Min. 3kg.',  price: 75,   stock: 999, category: 'Wash & Fold',  productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: true,  estimatedDuration: 480  },
      { name: 'Wash & Fold Bundle 10kg',  description: '10kg wash & fold package',                    price: 650,  stock: 999, category: 'Wash & Fold',  productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: false, estimatedDuration: 480  },
      { name: 'Dry Clean — Polo Shirt',   description: 'Professional dry clean, pressed and hanger',  price: 180,  stock: 999, category: 'Dry Cleaning', productType: 'service', trackInventory: false, serviceType: 'dry-clean', weightBased: false, estimatedDuration: 1440 },
      { name: 'Dry Clean — Suit (2pc)',   description: 'Jacket + pants, professionally cleaned',      price: 520,  stock: 999, category: 'Dry Cleaning', productType: 'service', trackInventory: false, serviceType: 'dry-clean', weightBased: false, estimatedDuration: 1440 },
      { name: 'Dry Clean — Evening Dress',description: 'Formal dress, gentle care',                   price: 380,  stock: 999, category: 'Dry Cleaning', productType: 'service', trackInventory: false, serviceType: 'dry-clean', weightBased: false, estimatedDuration: 1440 },
      { name: 'Press — Polo / Shirt',     description: 'Steam iron, hanger finish',                   price: 45,   stock: 999, category: 'Pressing',     productType: 'service', trackInventory: false, serviceType: 'press',     weightBased: false, estimatedDuration: 120  },
      { name: 'Press — Pants / Slacks',   description: 'Creased finish, steam iron',                  price: 55,   stock: 999, category: 'Pressing',     productType: 'service', trackInventory: false, serviceType: 'press',     weightBased: false, estimatedDuration: 120  },
      { name: 'Comforter / Duvet',        description: 'Full wash & dry for comforters up to queen',  price: 450,  stock: 999, category: 'Specialty',    productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: false, estimatedDuration: 720  },
      { name: 'Curtain Set (per pair)',   description: 'Machine wash + press, ready-to-hang',         price: 350,  stock: 999, category: 'Specialty',    productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: false, estimatedDuration: 720  },
      { name: 'Express Same-Day (per kg)',description: 'Delivered by 6pm if dropped by 9am',          price: 120,  stock: 999, category: 'Express',      productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: true,  estimatedDuration: 480, pickupDelivery: true },
    ],
    customers: [
      { firstName: 'Rosario', lastName: 'Mendez',  phone: '+63-917-200-0001', tags: ['Regular'] },
      { firstName: 'Dante',   lastName: 'Cruz',    phone: '+63-917-200-0002', email: 'dante.c@example.com', tags: ['VIP'] },
      { firstName: 'Ligaya',  lastName: 'Flores',  phone: '+63-917-200-0003', tags: ['Regular'] },
    ],
    discounts: [
      { code: 'FIRSTWASH', name: '1st Visit 20% Off',    type: 'percentage', value: 20, description: 'New customer welcome offer' },
      { code: 'MONTHLY',   name: 'Monthly Bundle -10%',  type: 'percentage', value: 10, minPurchaseAmount: 500, description: 'Regular monthly customers' },
    ],
  },

  service: {
    categories: [
      { name: 'Hair',     description: 'Cuts, color, treatments, and styling' },
      { name: 'Nails',    description: 'Manicure, pedicure, and nail art' },
      { name: 'Skin',     description: 'Facials, peels, and skin treatments' },
      { name: 'Massage',  description: 'Body massage and relaxation therapies' },
      { name: 'Packages', description: 'Curated service bundles' },
    ],
    products: [
      { name: 'Haircut — Ladies',        description: 'Shampoo, cut, blow-dry and style',               price: 380,  stock: 999, category: 'Hair',     productType: 'service', trackInventory: false, serviceDuration: 60,  staffRequired: 1 },
      { name: "Haircut — Men's",         description: 'Classic cut, shampoo and style',                 price: 220,  stock: 999, category: 'Hair',     productType: 'service', trackInventory: false, serviceDuration: 30,  staffRequired: 1 },
      { name: 'Hair Color — Full',       description: 'Full head color, toning + treatment',            price: 1500, stock: 999, category: 'Hair',     productType: 'service', trackInventory: false, serviceDuration: 120, staffRequired: 1 },
      { name: 'Keratin Treatment',       description: 'Brazilian keratin smoothing, lasts 3–5 months', price: 3500, stock: 999, category: 'Hair',     productType: 'service', trackInventory: false, serviceDuration: 180, staffRequired: 1 },
      { name: 'Classic Manicure',        description: 'Nail shaping, cuticle care, polish',             price: 200,  stock: 999, category: 'Nails',    productType: 'service', trackInventory: false, serviceDuration: 45,  staffRequired: 1 },
      { name: 'Gel Pedicure',            description: 'Full pedicure with gel polish, 3-week wear',    price: 450,  stock: 999, category: 'Nails',    productType: 'service', trackInventory: false, serviceDuration: 60,  staffRequired: 1 },
      { name: 'Hydrating Facial',        description: '60-min deep hydration facial',                  price: 850,  stock: 999, category: 'Skin',     productType: 'service', trackInventory: false, serviceDuration: 60,  staffRequired: 1 },
      { name: 'Chemical Peel',           description: 'Glycolic peel, resurface and brighten skin',    price: 1200, stock: 999, category: 'Skin',     productType: 'service', trackInventory: false, serviceDuration: 45,  staffRequired: 1 },
      { name: 'Swedish Massage 60min',   description: 'Full-body relaxation massage, 60 minutes',      price: 750,  stock: 999, category: 'Massage',  productType: 'service', trackInventory: false, serviceDuration: 60,  staffRequired: 1 },
      { name: 'Hot Stone Massage 90min', description: 'Deep relaxation with heated basalt stones',     price: 1200, stock: 999, category: 'Massage',  productType: 'service', trackInventory: false, serviceDuration: 90,  staffRequired: 1 },
      { name: 'Pamper Package — Basic',  description: 'Haircut + Manicure + Facial',                   price: 1200, stock: 999, category: 'Packages', productType: 'bundle',  trackInventory: false, serviceDuration: 150, staffRequired: 2 },
      { name: 'Full Spa Day',            description: 'Hair color + Mani + Pedi + Swedish massage',    price: 3200, stock: 999, category: 'Packages', productType: 'bundle',  trackInventory: false, serviceDuration: 300, staffRequired: 2 },
    ],
    customers: [
      { firstName: 'Clarissa', lastName: 'Ramos',     email: 'clarissa.r@example.com', phone: '+63-917-300-0001', tags: ['VIP', 'Regular'] },
      { firstName: 'Donna',    lastName: 'Espiritu',                                   phone: '+63-917-300-0002', tags: ['Regular'] },
      { firstName: 'Hannah',   lastName: 'Soriano',   email: 'hannah.s@example.com',  phone: '+63-917-300-0003', tags: ['VIP'] },
      { firstName: 'Iris',     lastName: 'Dela Vega',                                 phone: '+63-917-300-0004', tags: ['Regular'] },
    ],
    discounts: [
      { code: 'SPA15',       name: 'Spa 15% Off',     type: 'percentage', value: 15, minPurchaseAmount: 1000, description: 'Packages over ₱1,000' },
      { code: 'GROOMING',    name: 'Grooming Tuesday', type: 'fixed',      value: 100, description: 'Every Tuesday — ₱100 off any hair service' },
      { code: 'BRINGAFRIEND',name: 'Bring a Friend',   type: 'percentage', value: 10, description: 'Refer a friend, both get 10% off' },
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
    customers: [
      { firstName: 'Carlos',  lastName: 'Manalo',   email: 'carlos.m@example.com', phone: '+63-917-400-0001', tags: ['Regular'] },
      { firstName: 'Shiela',  lastName: 'Navarro',  email: 'shiela.n@example.com', phone: '+63-917-400-0002', tags: ['Regular'] },
      { firstName: 'Roberto', lastName: 'Castillo', phone: '+63-917-400-0003',                                 tags: ['Wholesale'] },
    ],
    discounts: [
      { code: 'BULK5',     name: 'Bulk Purchase 5%',       type: 'percentage', value: 5,  minPurchaseAmount: 500, description: 'On orders ₱500 and above' },
      { code: 'LOYALCARD', name: 'Loyalty Card Discount',  type: 'fixed',      value: 50, minPurchaseAmount: 300, description: 'For loyalty card holders' },
    ],
  },
};

// ── Route ────────────────────────────────────────────────────────────────────

/** GET — preview what will be seeded (no writes) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'owner']);
    const { slug } = await params;

    const tenant = await Tenant.findOne({ slug, isActive: true }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const settings = (tenant as any).settings; // eslint-disable-line @typescript-eslint/no-explicit-any
    const bizType: BizType = (settings?.businessType ?? 'general') as BizType;
    const config = SAMPLE_DATA[bizType] ?? SAMPLE_DATA.general;

    // Count what already exists
    const existingCategories = await Category.countDocuments({ tenantId: tenant._id });
    const existingProducts   = await Product.countDocuments({ tenantId: tenant._id });
    const existingCustomers  = await Customer.countDocuments({ tenantId: tenant._id });
    const existingDiscounts  = await Discount.countDocuments({ tenantId: tenant._id });

    return NextResponse.json({
      success: true,
      data: {
        businessType: bizType,
        preview: {
          categories: config.categories.length,
          products:   config.products.length,
          customers:  config.customers.length,
          discounts:  config.discounts.length,
        },
        existing: {
          categories: existingCategories,
          products:   existingProducts,
          customers:  existingCustomers,
          discounts:  existingDiscounts,
        },
        sample: {
          categories: config.categories.map(c => c.name),
          products:   config.products.map(p => ({ name: p.name, price: p.price, type: p.productType })),
          discounts:  config.discounts.map(d => ({ code: d.code, name: d.name, value: d.value, type: d.type })),
        },
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message?.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: 'Failed to load preview' }, { status: 500 });
  }
}

/** POST — install sample data */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'owner']);
    const { slug } = await params;

    const body = await request.json().catch(() => ({}));
    const skipExisting: boolean = body.skipExisting !== false; // default: true

    const tenant = await Tenant.findOne({ slug, isActive: true });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = tenant._id;
    const settings = (tenant as any).settings; // eslint-disable-line @typescript-eslint/no-explicit-any
    const bizType: BizType = (settings?.businessType ?? 'general') as BizType;
    const config = SAMPLE_DATA[bizType] ?? SAMPLE_DATA.general;

    const results = {
      categories: { created: 0, skipped: 0 },
      products:   { created: 0, skipped: 0 },
      customers:  { created: 0, skipped: 0 },
      discounts:  { created: 0, skipped: 0 },
    };

    // ── Categories ──────────────────────────────────────────────────────────
    const categoryMap: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const catDef of config.categories) {
      const existing = await Category.findOne({ tenantId, name: catDef.name });
      if (existing) {
        categoryMap[catDef.name] = existing._id;
        results.categories.skipped++;
      } else {
        const cat = await Category.create({ ...catDef, tenantId, isActive: true });
        categoryMap[catDef.name] = cat._id;
        results.categories.created++;
      }
    }

    // ── Products ────────────────────────────────────────────────────────────
    for (const prodDef of config.products) {
      const { category: catName, ...rest } = prodDef;
      const existing = await Product.findOne({ tenantId, name: rest.name });
      if (existing && skipExisting) {
        results.products.skipped++;
        continue;
      }

      await Product.create({
        ...rest,
        tenantId,
        categoryId: categoryMap[catName],
        category:   catName,
      });
      results.products.created++;
    }

    // ── Customers ───────────────────────────────────────────────────────────
    for (const cust of config.customers) {
      const existing = await Customer.findOne({ tenantId, firstName: cust.firstName, lastName: cust.lastName });
      if (existing && skipExisting) {
        results.customers.skipped++;
        continue;
      }
      await Customer.create({ ...cust, tenantId, isActive: true });
      results.customers.created++;
    }

    // ── Discounts ───────────────────────────────────────────────────────────
    const now     = new Date();
    const oneYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    for (const discDef of config.discounts) {
      const existing = await Discount.findOne({ tenantId, code: discDef.code.toUpperCase() });
      if (existing && skipExisting) {
        results.discounts.skipped++;
        continue;
      }
      await Discount.create({
        ...discDef,
        tenantId,
        code:       discDef.code.toUpperCase(),
        usageCount: 0,
        isActive:   true,
        validFrom:  now,
        validUntil: oneYear,
      });
      results.discounts.created++;
    }

    // ── Audit log ───────────────────────────────────────────────────────────
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenantId.toString(),
      metadata: { action: 'seed_sample_data', businessType: bizType, results },
    });

    return NextResponse.json({ success: true, data: { businessType: bizType, results } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message?.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    console.error('Seed sample data error:', error);
    return NextResponse.json({ success: false, error: 'Failed to seed sample data' }, { status: 500 });
  }
}
