#!/usr/bin/env tsx
/**
 * LocalPro POS — Sample Data Seeder
 *
 * Seeds realistic sample data for every business type.
 * Creates a dedicated sample tenant for each type, or targets an existing one.
 *
 * Usage:
 *   npx tsx scripts/seed-sample-data.ts                         # seed all 5 business types
 *   npx tsx scripts/seed-sample-data.ts --type=retail           # one type only
 *   npx tsx scripts/seed-sample-data.ts --tenant=my-store       # seed into existing tenant
 *   npx tsx scripts/seed-sample-data.ts --force                 # re-seed even if data exists
 *   npm run seed:sample-data
 *
 * Exit codes:  0 = success,  1 = error
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import Tenant          from '../models/Tenant';
import User            from '../models/User';
import Branch          from '../models/Branch';
import Category        from '../models/Category';
import Product         from '../models/Product';
import Customer        from '../models/Customer';
import Discount        from '../models/Discount';
import Transaction     from '../models/Transaction';
import StockMovement   from '../models/StockMovement';
import CashDrawerSession from '../models/CashDrawerSession';
import Expense         from '../models/Expense';
import Attendance      from '../models/Attendance';
import { getDefaultTenantSettings } from '../lib/currency';
import { applyBusinessTypeDefaults } from '../lib/business-types';

// ── Config ──────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pos-system';
const FORCE       = process.argv.includes('--force');
const TYPE_ARG    = process.argv.find(a => a.startsWith('--type='))?.split('=')[1];
const TENANT_ARG  = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1];

// ── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', grey: '\x1b[90m', blue: '\x1b[34m',
};
const ok   = (m: string) => console.log(`  ${c.green}✔${c.reset}  ${m}`);
const skip = (m: string) => console.log(`  ${c.grey}–${c.reset}  ${c.grey}${m}${c.reset}`);
const warn = (m: string) => console.log(`  ${c.yellow}⚠${c.reset}  ${m}`);
const err  = (m: string) => console.log(`  ${c.red}✘${c.reset}  ${m}`);
const hdr  = (m: string) => console.log(`\n${c.bold}${c.cyan}${m}${c.reset}`);

// ════════════════════════════════════════════════════════════════════════════
//  Sample-data definitions per business type
// ════════════════════════════════════════════════════════════════════════════

type BizType = 'retail' | 'restaurant' | 'laundry' | 'service' | 'general';

interface SeedTenantConfig {
  slug:         string;
  name:         string;
  businessType: BizType;
  companyName:  string;
  email:        string;
  phone:        string;
  adminEmail:   string;
  adminPassword:string;
  categories:   { name: string; description: string }[];
  products:     Partial<mongoose.Document & Record<string, any>>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  customers:    { firstName: string; lastName: string; email?: string; phone?: string; tags?: string[] }[];
  discounts:    {
    code: string; name: string; type: 'percentage' | 'fixed';
    value: number; minPurchaseAmount?: number; description?: string;
  }[];
}

const SEED_CONFIGS: SeedTenantConfig[] = [
  // ── 1. RETAIL ────────────────────────────────────────────────────────────
  {
    slug:          'sample-retail',
    name:          'Sample Retail Store',
    businessType:  'retail',
    companyName:   'LocalPro Retail',
    email:         'admin@sample-retail.local',
    phone:         '+1-555-0101',
    adminEmail:    'admin@sample-retail.local',
    adminPassword: 'Retail123!',
    categories: [
      { name: 'Electronics',   description: 'Gadgets, accessories, and electronics' },
      { name: 'Clothing',      description: 'Apparel and fashion items' },
      { name: 'Accessories',   description: 'Bags, watches, and fashion accessories' },
      { name: 'Home & Living', description: 'Household items and decor' },
      { name: 'Bundles',       description: 'Value bundle deals' },
    ],
    products: [
      { name: 'Wireless Earbuds Pro',    description: 'Noise-cancelling BT 5.0 earbuds, 30h battery',     price: 2999,  stock: 50,  sku: 'ELEC-001', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'USB-C Fast Charger 65W',  description: '65W GaN charger, universal compatibility',          price: 899,   stock: 80,  sku: 'ELEC-002', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 15 },
      { name: 'Slim Power Bank 20000mAh',description: '20000mAh, dual USB-A + USB-C output',              price: 1499,  stock: 40,  sku: 'ELEC-003', category: 'Electronics',   productType: 'regular', trackInventory: true,  lowStockThreshold: 8  },
      { name: 'Classic White Tee',       description: 'Premium cotton, unisex, S–XL',                     price: 399,   stock: 120, sku: 'CLO-001',  category: 'Clothing',      productType: 'regular', trackInventory: true,  lowStockThreshold: 20,
        hasVariations: true,
        variations: [
          { size: 'S', sku: 'CLO-001-S', stock: 30 },
          { size: 'M', sku: 'CLO-001-M', stock: 40 },
          { size: 'L', sku: 'CLO-001-L', stock: 35 },
          { size: 'XL',sku: 'CLO-001-XL',stock: 15 },
        ],
      },
      { name: 'Denim Jacket',            description: 'Classic cut, 100% cotton denim',                   price: 1899,  stock: 30,  sku: 'CLO-002',  category: 'Clothing',      productType: 'regular', trackInventory: true,  lowStockThreshold: 5  },
      { name: 'Canvas Tote Bag',         description: 'Heavy-duty canvas, eco-friendly',                  price: 549,   stock: 60,  sku: 'ACC-001',  category: 'Accessories',   productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Minimalist Watch',        description: 'Stainless steel, leather strap, water-resistant',  price: 3499,  stock: 20,  sku: 'ACC-002',  category: 'Accessories',   productType: 'regular', trackInventory: true,  lowStockThreshold: 5  },
      { name: 'Scented Candle Set',      description: 'Set of 3 — lavender, vanilla, sandalwood',        price: 799,   stock: 45,  sku: 'HOME-001', category: 'Home & Living', productType: 'regular', trackInventory: true,  lowStockThreshold: 10 },
      { name: 'Ceramic Coffee Mug',      description: '350ml ceramic, dishwasher safe',                   price: 299,   stock: 100, sku: 'HOME-002', category: 'Home & Living', productType: 'regular', trackInventory: true,  lowStockThreshold: 20 },
      { name: 'Tech Starter Bundle',     description: 'Earbuds + USB-C charger combo deal',               price: 3699,  stock: 20,  sku: 'BUN-001',  category: 'Bundles',       productType: 'bundle',  trackInventory: false },
    ],
    customers: [
      { firstName: 'Maria',   lastName: 'Santos',    email: 'maria.s@email.com',   phone: '+63-917-000-0001', tags: ['VIP', 'Regular'] },
      { firstName: 'Juan',    lastName: 'dela Cruz', email: 'juan.dc@email.com',   phone: '+63-917-000-0002', tags: ['Regular'] },
      { firstName: 'Angela',  lastName: 'Reyes',     email: 'angela.r@email.com',  phone: '+63-917-000-0003', tags: ['Wholesale'] },
      { firstName: 'Ricardo', lastName: 'Lim',       email: 'ric.lim@email.com',   phone: '+63-917-000-0004', tags: ['VIP'] },
      { firstName: 'Sofia',   lastName: 'Tan',       email: 'sofia.t@email.com',   phone: '+63-917-000-0005', tags: ['Regular'] },
    ],
    discounts: [
      { code: 'WELCOME10',  name: 'Welcome 10% Off',         type: 'percentage', value: 10, description: 'First-time customer discount' },
      { code: 'SAVE100',    name: 'Save ₱100',               type: 'fixed',      value: 100, minPurchaseAmount: 800, description: 'Min. ₱800 purchase' },
      { code: 'VIP20',      name: 'VIP 20% Off',             type: 'percentage', value: 20, description: 'Exclusive VIP member discount' },
    ],
  },

  // ── 2. RESTAURANT ────────────────────────────────────────────────────────
  {
    slug:          'sample-restaurant',
    name:          'Sample Resto',
    businessType:  'restaurant',
    companyName:   'LocalPro Bistro',
    email:         'admin@sample-restaurant.local',
    phone:         '+1-555-0202',
    adminEmail:    'admin@sample-restaurant.local',
    adminPassword: 'Resto123!',
    categories: [
      { name: 'Appetizers',  description: 'Starters and sharing plates' },
      { name: 'Main Course', description: 'Signature main dishes' },
      { name: 'Desserts',    description: 'Sweet endings' },
      { name: 'Beverages',   description: 'Drinks — hot, cold, and blended' },
      { name: 'Set Meals',   description: 'Complete meal bundles' },
    ],
    products: [
      { name: 'Crispy Calamari',      description: 'Golden fried squid rings with aioli dip',          price: 285,  stock: 999, category: 'Appetizers',  productType: 'regular', trackInventory: false,
        allergens: ['seafood', 'gluten'],
        modifiers: [{ name: 'Sauce', options: [{ name: 'Aioli', price: 0 }, { name: 'Sweet Chili', price: 0 }, { name: 'Tartar', price: 0 }], required: true }],
      },
      { name: 'Chicken Wings (6pcs)',  description: 'Crispy wings, choose your sauce',                 price: 320,  stock: 999, category: 'Appetizers',  productType: 'regular', trackInventory: false,
        modifiers: [{ name: 'Sauce', options: [{ name: 'Buffalo', price: 0 }, { name: 'BBQ', price: 0 }, { name: 'Honey Garlic', price: 0 }, { name: 'Plain', price: 0 }], required: true }],
      },
      { name: 'Grilled Salmon',        description: '180g Atlantic salmon, seasonal vegetables, lemon butter', price: 680, stock: 999, category: 'Main Course', productType: 'regular', trackInventory: false,
        allergens: ['seafood', 'dairy'],
        nutritionInfo: { calories: 420, protein: 38, carbs: 12, fat: 24 },
      },
      { name: 'Pork Ribs Half Rack',   description: 'Slow-cooked BBQ ribs, coleslaw, corn bread',     price: 750,  stock: 999, category: 'Main Course', productType: 'regular', trackInventory: false },
      { name: 'Truffle Mushroom Pasta',description: 'Tagliatelle, wild mushrooms, truffle cream sauce',price: 480,  stock: 999, category: 'Main Course', productType: 'regular', trackInventory: false,
        allergens: ['gluten', 'dairy'],
        modifiers: [{ name: 'Protein Add-on', options: [{ name: 'None', price: 0 }, { name: 'Chicken', price: 80 }, { name: 'Shrimp', price: 120 }], required: false }],
      },
      { name: 'Wagyu Beef Burger',     description: '150g wagyu patty, brioche bun, truffle fries',   price: 595,  stock: 999, category: 'Main Course', productType: 'regular', trackInventory: false,
        allergens: ['gluten', 'dairy'],
      },
      { name: 'Chocolate Lava Cake',   description: 'Warm chocolate cake, vanilla ice cream',         price: 220,  stock: 999, category: 'Desserts',    productType: 'regular', trackInventory: false,
        allergens: ['gluten', 'dairy', 'eggs'],
      },
      { name: 'Mango Panna Cotta',     description: 'Silky panna cotta, fresh mango coulis',          price: 195,  stock: 999, category: 'Desserts',    productType: 'regular', trackInventory: false,
        allergens: ['dairy'],
      },
      { name: 'Artisan Lemonade',      description: 'Fresh-squeezed, rosemary syrup, 500ml',          price: 150,  stock: 999, category: 'Beverages',   productType: 'regular', trackInventory: false,
        modifiers: [{ name: 'Size', options: [{ name: 'Regular (500ml)', price: 0 }, { name: 'Large (750ml)', price: 50 }], required: true }],
      },
      { name: 'Pour-Over Coffee',      description: 'Single-origin, hand-poured, your choice of bean', price: 175, stock: 999, category: 'Beverages',   productType: 'regular', trackInventory: false,
        modifiers: [
          { name: 'Temperature', options: [{ name: 'Hot', price: 0 }, { name: 'Iced', price: 30 }], required: true },
          { name: 'Milk', options: [{ name: 'None', price: 0 }, { name: 'Whole Milk', price: 0 }, { name: 'Oat Milk', price: 40 }, { name: 'Almond Milk', price: 40 }], required: false },
        ],
      },
      { name: 'Lunch Set A',           description: 'Soup + any main + iced tea',                     price: 550,  stock: 999, category: 'Set Meals',   productType: 'bundle',  trackInventory: false },
      { name: 'Date Night for Two',    description: 'Shared appetizer + 2 mains + 1 dessert + 2 drinks', price: 1480, stock: 999, category: 'Set Meals', productType: 'bundle', trackInventory: false },
    ],
    customers: [
      { firstName: 'Elena',  lastName: 'Garcia',   email: 'elena.g@email.com',  phone: '+63-917-100-0001', tags: ['Regular'] },
      { firstName: 'Marco',  lastName: 'Bautista',                               phone: '+63-917-100-0002', tags: ['VIP', 'Regular'] },
      { firstName: 'Lena',   lastName: 'Ocampo',   email: 'lena.o@email.com',   phone: '+63-917-100-0003', tags: ['Regular'] },
      { firstName: 'Paolo',  lastName: 'Villanueva',email: 'paolo.v@email.com', phone: '+63-917-100-0004', tags: ['Staff'] },
    ],
    discounts: [
      { code: 'LUNCH15',    name: 'Lunch Promo 15%',  type: 'percentage', value: 15, minPurchaseAmount: 400, description: '11am–2pm Mon–Fri' },
      { code: 'BDAY',       name: 'Birthday Free Dessert', type: 'fixed', value: 220, description: 'Free chocolate lava cake on your birthday' },
      { code: 'TABLE10',    name: 'Table of 10+',     type: 'percentage', value: 10, minPurchaseAmount: 3000, description: 'Group dining discount' },
    ],
  },

  // ── 3. LAUNDRY ───────────────────────────────────────────────────────────
  {
    slug:          'sample-laundry',
    name:          'Sample Laundry',
    businessType:  'laundry',
    companyName:   'LocalPro Laundry',
    email:         'admin@sample-laundry.local',
    phone:         '+1-555-0303',
    adminEmail:    'admin@sample-laundry.local',
    adminPassword: 'Laundry123!',
    categories: [
      { name: 'Wash & Fold',   description: 'Regular laundry wash, dry, and fold service' },
      { name: 'Dry Cleaning',  description: 'Professional dry cleaning for delicate fabrics' },
      { name: 'Pressing',      description: 'Ironing and pressing service' },
      { name: 'Specialty',     description: 'Curtains, beddings, and specialty items' },
      { name: 'Express',       description: 'Same-day and rush service' },
    ],
    products: [
      { name: 'Wash & Fold (per kg)',    description: 'Machine wash, tumble dry, folded. Min. 3kg.',   price: 75,   stock: 999, category: 'Wash & Fold',  productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: true,  estimatedDuration: 480  },
      { name: 'Wash & Fold Bundle 10kg', description: '10kg wash & fold package, any day drop-off',   price: 650,  stock: 999, category: 'Wash & Fold',  productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: false, estimatedDuration: 480  },
      { name: 'Dry Clean — Polo Shirt',  description: 'Professional dry clean, pressed and hanger',   price: 180,  stock: 999, category: 'Dry Cleaning', productType: 'service', trackInventory: false, serviceType: 'dry-clean', weightBased: false, estimatedDuration: 1440 },
      { name: 'Dry Clean — Suit (2pc)',  description: 'Jacket + pants, professionally cleaned',       price: 520,  stock: 999, category: 'Dry Cleaning', productType: 'service', trackInventory: false, serviceType: 'dry-clean', weightBased: false, estimatedDuration: 1440 },
      { name: 'Dry Clean — Dress',       description: 'Evening/formal dress, gentle care',            price: 380,  stock: 999, category: 'Dry Cleaning', productType: 'service', trackInventory: false, serviceType: 'dry-clean', weightBased: false, estimatedDuration: 1440 },
      { name: 'Press — Polo / Shirt',    description: 'Steam iron, hanger finish',                    price: 45,   stock: 999, category: 'Pressing',     productType: 'service', trackInventory: false, serviceType: 'press',     weightBased: false, estimatedDuration: 120  },
      { name: 'Press — Pants / Slacks',  description: 'Creased finish, steam iron',                   price: 55,   stock: 999, category: 'Pressing',     productType: 'service', trackInventory: false, serviceType: 'press',     weightBased: false, estimatedDuration: 120  },
      { name: 'Comforter / Duvet',       description: 'Full wash & dry for comforters up to queen',   price: 450,  stock: 999, category: 'Specialty',    productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: false, estimatedDuration: 720, pickupDelivery: false },
      { name: 'Curtain Set (per pair)',   description: 'Machine wash + press, ready-to-hang',         price: 350,  stock: 999, category: 'Specialty',    productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: false, estimatedDuration: 720  },
      { name: 'Express Same-Day (per kg)',description: 'Delivered by 6pm if dropped by 9am',          price: 120,  stock: 999, category: 'Express',      productType: 'service', trackInventory: false, serviceType: 'wash',      weightBased: true,  estimatedDuration: 480, pickupDelivery: true },
    ],
    customers: [
      { firstName: 'Rosario', lastName: 'Mendez',  phone: '+63-917-200-0001', tags: ['Regular'] },
      { firstName: 'Dante',   lastName: 'Cruz',    phone: '+63-917-200-0002', email: 'dante.c@email.com', tags: ['Regular', 'VIP'] },
      { firstName: 'Ligaya',  lastName: 'Flores',  phone: '+63-917-200-0003', tags: ['Regular'] },
      { firstName: 'Bernard', lastName: 'Pascual', phone: '+63-917-200-0004', email: 'ben.p@email.com', tags: ['Regular'] },
    ],
    discounts: [
      { code: 'FIRSTWASH',  name: '1st Visit 20% Off', type: 'percentage', value: 20, description: 'New customer welcome offer' },
      { code: 'MONTHLY',    name: 'Monthly Bundle -10%', type: 'percentage', value: 10, minPurchaseAmount: 500, description: 'Regular monthly customers' },
    ],
  },

  // ── 4. SERVICE (Salon / Spa) ─────────────────────────────────────────────
  {
    slug:          'sample-service',
    name:          'Sample Salon & Spa',
    businessType:  'service',
    companyName:   'LocalPro Salon & Spa',
    email:         'admin@sample-service.local',
    phone:         '+1-555-0404',
    adminEmail:    'admin@sample-service.local',
    adminPassword: 'Service123!',
    categories: [
      { name: 'Hair',       description: 'Cuts, color, treatments, and styling' },
      { name: 'Nails',      description: 'Manicure, pedicure, and nail art' },
      { name: 'Skin',       description: 'Facials, peels, and skin treatments' },
      { name: 'Massage',    description: 'Body massage and relaxation therapies' },
      { name: 'Packages',   description: 'Curated service bundles' },
    ],
    products: [
      { name: 'Haircut — Ladies',       description: 'Shampoo, cut, blow-dry and style',               price: 380,  stock: 999, category: 'Hair',      productType: 'service', trackInventory: false, serviceDuration: 60,  staffRequired: 1 },
      { name: 'Haircut — Men\'s',        description: 'Classic cut, shampoo and style',                price: 220,  stock: 999, category: 'Hair',      productType: 'service', trackInventory: false, serviceDuration: 30,  staffRequired: 1 },
      { name: 'Hair Color — Full',       description: 'Full head color, includes toning + treatment',  price: 1500, stock: 999, category: 'Hair',      productType: 'service', trackInventory: false, serviceDuration: 120, staffRequired: 1 },
      { name: 'Keratin Treatment',       description: 'Brazilian keratin smoothing, lasts 3–5 months', price: 3500, stock: 999, category: 'Hair',      productType: 'service', trackInventory: false, serviceDuration: 180, staffRequired: 1 },
      { name: 'Classic Manicure',        description: 'Nail shaping, cuticle care, polish',            price: 200,  stock: 999, category: 'Nails',     productType: 'service', trackInventory: false, serviceDuration: 45,  staffRequired: 1 },
      { name: 'Gel Pedicure',            description: 'Full pedicure with gel polish, 3-week wear',    price: 450,  stock: 999, category: 'Nails',     productType: 'service', trackInventory: false, serviceDuration: 60,  staffRequired: 1 },
      { name: 'Hydrating Facial',        description: '60-min deep hydration facial, all skin types',  price: 850,  stock: 999, category: 'Skin',      productType: 'service', trackInventory: false, serviceDuration: 60,  staffRequired: 1 },
      { name: 'Chemical Peel',           description: 'Glycolic peel, resurface and brighten skin',    price: 1200, stock: 999, category: 'Skin',      productType: 'service', trackInventory: false, serviceDuration: 45,  staffRequired: 1 },
      { name: 'Swedish Massage 60min',   description: 'Full-body relaxation massage, 60 minutes',      price: 750,  stock: 999, category: 'Massage',   productType: 'service', trackInventory: false, serviceDuration: 60,  staffRequired: 1 },
      { name: 'Hot Stone Massage 90min', description: 'Deep relaxation with heated basalt stones',     price: 1200, stock: 999, category: 'Massage',   productType: 'service', trackInventory: false, serviceDuration: 90,  staffRequired: 1 },
      { name: 'Pamper Package — Basic',  description: 'Haircut + Manicure + Facial',                   price: 1200, stock: 999, category: 'Packages',  productType: 'bundle',  trackInventory: false, serviceDuration: 150, staffRequired: 2 },
      { name: 'Full Spa Day',            description: 'Hair color + Mani + Pedi + Swedish massage',    price: 3200, stock: 999, category: 'Packages',  productType: 'bundle',  trackInventory: false, serviceDuration: 300, staffRequired: 2 },
    ],
    customers: [
      { firstName: 'Clarissa', lastName: 'Ramos',    email: 'clarissa.r@email.com', phone: '+63-917-300-0001', tags: ['VIP', 'Regular'] },
      { firstName: 'Donna',    lastName: 'Espiritu',                                phone: '+63-917-300-0002', tags: ['Regular'] },
      { firstName: 'Greta',    lastName: 'Valencia',  email: 'greta.v@email.com',   phone: '+63-917-300-0003', tags: ['Regular'] },
      { firstName: 'Hannah',   lastName: 'Soriano',   email: 'hannah.s@email.com',  phone: '+63-917-300-0004', tags: ['VIP'] },
      { firstName: 'Iris',     lastName: 'Dela Vega',                               phone: '+63-917-300-0005', tags: ['Regular'] },
    ],
    discounts: [
      { code: 'SPA15',      name: 'Spa 15% Off',         type: 'percentage', value: 15, minPurchaseAmount: 1000, description: 'Packages and treatments over ₱1,000' },
      { code: 'GROOMING',   name: 'Grooming Tuesday',    type: 'fixed',      value: 100, description: 'Every Tuesday — ₱100 off any hair service' },
      { code: 'BRINGAFRIEND', name: 'Bring a Friend',    type: 'percentage', value: 10, description: 'Refer a friend, both get 10% off' },
    ],
  },

  // ── 5. GENERAL ───────────────────────────────────────────────────────────
  {
    slug:          'sample-general',
    name:          'Sample General Store',
    businessType:  'general',
    companyName:   'LocalPro General',
    email:         'admin@sample-general.local',
    phone:         '+1-555-0505',
    adminEmail:    'admin@sample-general.local',
    adminPassword: 'General123!',
    categories: [
      { name: 'Office Supplies', description: 'Stationery, consumables, and office essentials' },
      { name: 'Snacks & Drinks',  description: 'Quick bites and beverages' },
      { name: 'Cleaning',         description: 'Cleaning products and supplies' },
      { name: 'Services',         description: 'Miscellaneous services offered' },
      { name: 'Combos',           description: 'Popular product combos' },
    ],
    products: [
      { name: 'Ballpen (Blue) — 12pcs',  description: 'Reliable medium-tip ballpen, blue ink, box of 12', price: 89,   stock: 200, sku: 'OFF-001', category: 'Office Supplies', productType: 'regular', trackInventory: true, lowStockThreshold: 20 },
      { name: 'A4 Paper Ream 500 sheets',description: '80gsm A4 printing paper, 500 sheets',             price: 199,  stock: 100, sku: 'OFF-002', category: 'Office Supplies', productType: 'regular', trackInventory: true, lowStockThreshold: 10 },
      { name: 'Stapler (Standard)',       description: 'Desktop stapler with 1000pc staples included',   price: 149,  stock: 50,  sku: 'OFF-003', category: 'Office Supplies', productType: 'regular', trackInventory: true, lowStockThreshold: 5  },
      { name: 'Sticky Notes 3x3 (5pk)',  description: 'Yellow canary sticky notes, 100 sheets each',    price: 75,   stock: 150, sku: 'OFF-004', category: 'Office Supplies', productType: 'regular', trackInventory: true, lowStockThreshold: 15 },
      { name: 'Bottled Water 500ml',      description: 'Purified drinking water',                        price: 20,   stock: 500, sku: 'DRK-001', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true, lowStockThreshold: 50 },
      { name: 'Instant Coffee Sachet',    description: '3-in-1 instant coffee, 20g sachet',              price: 15,   stock: 300, sku: 'DRK-002', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true, lowStockThreshold: 50 },
      { name: 'Mixed Nuts Snack Pack',    description: '30g mixed roasted nuts, single serving',         price: 45,   stock: 120, sku: 'SNK-001', category: 'Snacks & Drinks', productType: 'regular', trackInventory: true, lowStockThreshold: 20 },
      { name: 'All-Purpose Cleaner 1L',   description: 'Disinfectant cleaner, citrus scent',             price: 115,  stock: 80,  sku: 'CLN-001', category: 'Cleaning',        productType: 'regular', trackInventory: true, lowStockThreshold: 10 },
      { name: 'Trash Bags (M) — 10pcs',  description: 'Medium garbage bags, black, tie-top closure',    price: 55,   stock: 120, sku: 'CLN-002', category: 'Cleaning',        productType: 'regular', trackInventory: true, lowStockThreshold: 15 },
      { name: 'Lamination Service (A4)', description: 'Hot lamination, A4 size, same-day',              price: 25,   stock: 999, sku: 'SVC-001', category: 'Services',        productType: 'service', trackInventory: false },
      { name: 'Photocopying (per page)', description: 'Black & white photocopy, A4',                    price: 3,    stock: 999, sku: 'SVC-002', category: 'Services',        productType: 'service', trackInventory: false },
      { name: 'Office Starter Pack',     description: 'Ballpen box + ream + sticky notes + stapler',    price: 499,  stock: 30,  sku: 'COM-001', category: 'Combos',          productType: 'bundle',  trackInventory: true, lowStockThreshold: 5  },
    ],
    customers: [
      { firstName: 'Carlos',   lastName: 'Manalo',   email: 'carlos.m@email.com',  phone: '+63-917-400-0001', tags: ['Regular'] },
      { firstName: 'Shiela',   lastName: 'Navarro',  email: 'shiela.n@email.com',  phone: '+63-917-400-0002', tags: ['Regular'] },
      { firstName: 'Roberto',  lastName: 'Castillo', phone: '+63-917-400-0003',                               tags: ['Wholesale'] },
    ],
    discounts: [
      { code: 'BULK5',     name: 'Bulk Purchase 5%',  type: 'percentage', value: 5,  minPurchaseAmount: 500, description: 'On orders ₱500 and above' },
      { code: 'LOYALCARD', name: 'Loyalty Card Discount', type: 'fixed', value: 50, minPurchaseAmount: 300, description: 'For loyalty card holders' },
    ],
  },
];

// ════════════════════════════════════════════════════════════════════════════
//  Seeder Functions
// ════════════════════════════════════════════════════════════════════════════

async function seedTenant(cfg: SeedTenantConfig, existingTenantId?: mongoose.Types.ObjectId) {
  hdr(`▶  ${cfg.businessType.toUpperCase()}  —  ${cfg.companyName}`);

  let tenantId: mongoose.Types.ObjectId;

  // ── Tenant ───────────────────────────────────────────────────────────────
  if (existingTenantId) {
    tenantId = existingTenantId;
    ok(`Using existing tenant  (${cfg.slug})`);
  } else {
    const existing = await Tenant.findOne({ slug: cfg.slug });
    if (existing) {
      if (!FORCE) {
        skip(`Tenant "${cfg.slug}" already exists — skipping (use --force to re-seed)`);
        return;
      }
      tenantId = existing._id as mongoose.Types.ObjectId;
      warn(`Tenant "${cfg.slug}" exists — will overwrite data (--force)`);
    } else {
      const baseSettings = getDefaultTenantSettings();
      const settings = applyBusinessTypeDefaults(
        {
          ...baseSettings,
          companyName: cfg.companyName,
          email:       cfg.email,
          phone:       cfg.phone,
          businessType: cfg.businessType,
        },
        cfg.businessType,
      );

      const tenant = await Tenant.create({
        slug:     cfg.slug,
        name:     cfg.name,
        isActive: true,
        settings,
      });
      tenantId = tenant._id as mongoose.Types.ObjectId;
      ok(`Created tenant  "${cfg.slug}"`);
    }
  }

  // ── Admin User ───────────────────────────────────────────────────────────
  const existingAdmin = await User.findOne({ email: cfg.adminEmail.toLowerCase(), tenantId });
  if (!existingAdmin) {
    await User.create({
      email:    cfg.adminEmail.toLowerCase(),
      password: cfg.adminPassword,
      name:     'Admin',
      role:     'admin',
      tenantId,
      isActive: true,
    });
    ok(`Created admin user  ${cfg.adminEmail}`);
  } else {
    skip(`Admin user already exists  (${cfg.adminEmail})`);
  }

  // ── Branch ───────────────────────────────────────────────────────────────
  const existingBranch = await Branch.findOne({ tenantId });
  if (!existingBranch) {
    await Branch.create({
      tenantId,
      name:   'Main Branch',
      code:   'BR001',
      isActive: true,
    });
    ok('Created branch  "Main Branch"');
  } else {
    skip('Branch already exists');
  }

  // ── Categories ───────────────────────────────────────────────────────────
  const categoryMap: Record<string, mongoose.Types.ObjectId> = {};
  let catCreated = 0;

  for (const catDef of cfg.categories) {
    const existing = await Category.findOne({ tenantId, name: catDef.name });
    if (existing) {
      categoryMap[catDef.name] = existing._id as mongoose.Types.ObjectId;
    } else {
      const cat = await Category.create({ ...catDef, tenantId, isActive: true });
      categoryMap[catDef.name] = cat._id as mongoose.Types.ObjectId;
      catCreated++;
    }
  }
  ok(`Categories  — ${catCreated} created, ${cfg.categories.length - catCreated} already existed`);

  // ── Products ─────────────────────────────────────────────────────────────
  let prodCreated = 0;
  for (const prodDef of cfg.products) {
    const catName = prodDef.category as string;
    const { category: _catName, ...rest } = prodDef;

    const existingProd = await Product.findOne({ tenantId, name: rest.name });
    if (existingProd && !FORCE) continue;
    if (existingProd && FORCE) await Product.deleteOne({ _id: existingProd._id });

    await Product.create({
      ...rest,
      tenantId,
      categoryId: categoryMap[catName],
      category:   catName,
    });
    prodCreated++;
  }
  ok(`Products    — ${prodCreated} created`);

  // ── Customers ────────────────────────────────────────────────────────────
  let custCreated = 0;
  for (const cust of cfg.customers) {
    const existing = await Customer.findOne({
      tenantId,
      firstName: cust.firstName,
      lastName:  cust.lastName,
    });
    if (existing && !FORCE) continue;
    if (existing && FORCE) await Customer.deleteOne({ _id: existing._id });

    await Customer.create({ ...cust, tenantId, isActive: true });
    custCreated++;
  }
  ok(`Customers   — ${custCreated} created`);

  // ── Discounts ────────────────────────────────────────────────────────────
  let discCreated = 0;
  const now     = new Date();
  const oneYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  for (const discDef of cfg.discounts) {
    const existing = await Discount.findOne({ tenantId, code: discDef.code.toUpperCase() });
    if (existing && !FORCE) continue;
    if (existing && FORCE) await Discount.deleteOne({ _id: existing._id });

    await Discount.create({
      ...discDef,
      tenantId,
      code:       discDef.code.toUpperCase(),
      usageCount: 0,
      isActive:   true,
      validFrom:  now,
      validUntil: oneYear,
    });
    discCreated++;
  }
  ok(`Discounts   — ${discCreated} created`);

  // ── Gather seeded IDs for relational data ────────────────────────────────
  const branch = await Branch.findOne({ tenantId });
  const branchId = branch?._id as mongoose.Types.ObjectId | undefined;
  const adminUser = await User.findOne({ tenantId });
  const userId = adminUser?._id as mongoose.Types.ObjectId;
  const allProducts = await Product.find({ tenantId }).lean();
  const trackedProducts = allProducts.filter((p: any) => p.trackInventory); // eslint-disable-line @typescript-eslint/no-explicit-any

  // ── Transactions ─────────────────────────────────────────────────────────
  const existingTxCount = await Transaction.countDocuments({ tenantId });
  if (existingTxCount > 0 && !FORCE) {
    skip(`Transactions  — ${existingTxCount} already exist`);
  } else {
    if (FORCE) await Transaction.deleteMany({ tenantId });

    const paymentMethods: ('cash' | 'card' | 'digital')[] = ['cash', 'card', 'digital'];
    const now = new Date();
    let txCreated = 0;

    // Generate 15 transactions spread over the last 30 days
    for (let i = 0; i < 15; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const txDate = new Date(now);
      txDate.setDate(txDate.getDate() - daysAgo);
      txDate.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60));

      // Pick 1–3 random products
      const itemCount = 1 + Math.floor(Math.random() * 3);
      const picked = [...allProducts].sort(() => 0.5 - Math.random()).slice(0, Math.min(itemCount, allProducts.length));
      if (picked.length === 0) break;

      const items = picked.map((p: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const qty = 1 + Math.floor(Math.random() * 3);
        const price = p.price as number;
        return {
          productId: p._id,
          name:      p.name,
          price,
          quantity:  qty,
          total:     price * qty,
        };
      });

      const subtotal = items.reduce((s: number, it: any) => s + it.total, 0); // eslint-disable-line @typescript-eslint/no-explicit-any
      const tax      = Math.round(subtotal * 0.12 * 100) / 100;
      const total    = Math.round((subtotal + tax) * 100) / 100;
      const payment  = paymentMethods[i % 3];

      await Transaction.create({
        tenantId,
        branchId,
        items,
        subtotal,
        tax,
        discount: 0,
        total,
        paymentMethod: payment,
        amountPaid:    total,
        change:        0,
        status:        'completed',
        userId,
        createdAt:     txDate,
      });
      txCreated++;
    }
    ok(`Transactions  — ${txCreated} created`);
  }

  // ── Stock Movements ───────────────────────────────────────────────────────
  const existingSmCount = await StockMovement.countDocuments({ tenantId });
  if (existingSmCount > 0 && !FORCE) {
    skip(`Stock Movements — ${existingSmCount} already exist`);
  } else {
    if (FORCE) await StockMovement.deleteMany({ tenantId });
    let smCreated = 0;

    for (const p of trackedProducts as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const initialStock = (p.stock as number) || 50;

      // Opening purchase movement
      await StockMovement.create({
        productId:     p._id,
        tenantId,
        branchId,
        type:          'purchase',
        quantity:      initialStock,
        previousStock: 0,
        newStock:      initialStock,
        reason:        'Initial stock purchase',
        userId,
      });
      smCreated++;

      // A few sale reductions
      const salesQty = 1 + Math.floor(Math.random() * 5);
      await StockMovement.create({
        productId:     p._id,
        tenantId,
        branchId,
        type:          'sale',
        quantity:      salesQty,
        previousStock: initialStock,
        newStock:      initialStock - salesQty,
        reason:        'Sample sale',
        userId,
      });
      smCreated++;
    }
    ok(`Stock Movements — ${smCreated} created`);
  }

  // ── Cash Drawer Sessions ──────────────────────────────────────────────────
  const existingCdCount = await CashDrawerSession.countDocuments({ tenantId });
  if (existingCdCount > 0 && !FORCE) {
    skip(`Cash Drawer   — ${existingCdCount} sessions already exist`);
  } else {
    if (FORCE) await CashDrawerSession.deleteMany({ tenantId });
    const today = new Date();

    // Last 5 days — closed sessions + 1 open today
    for (let d = 4; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(day.getDate() - d);
      const openedAt  = new Date(day.setHours(8, 0, 0, 0));
      const closedAt  = d === 0 ? undefined : new Date(new Date(openedAt).setHours(18, 0, 0, 0));
      const opening   = 1000 + Math.round(Math.random() * 1000);
      const cashSales = 500  + Math.round(Math.random() * 2000);
      const closing   = closedAt ? opening + cashSales - Math.round(Math.random() * 200) : undefined;

      await CashDrawerSession.create({
        tenantId,
        branchId,
        userId,
        openingAmount:  opening,
        closingAmount:  closing,
        cashSales,
        openedAt,
        closedAt,
        status: closedAt ? 'closed' : 'open',
      });
    }
    ok(`Cash Drawer   — 5 sessions created (4 closed, 1 open)`);
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  const existingExpCount = await Expense.countDocuments({ tenantId });
  if (existingExpCount > 0 && !FORCE) {
    skip(`Expenses      — ${existingExpCount} already exist`);
  } else {
    if (FORCE) await Expense.deleteMany({ tenantId });
    const expenseTemplates = [
      { name: 'Electricity Bill',   description: 'Monthly electricity utility bill',   amount: 4500, category: 'Utilities',  paymentMethod: 'digital' as const },
      { name: 'Water Bill',         description: 'Monthly water utility',               amount: 850,  category: 'Utilities',  paymentMethod: 'cash'    as const },
      { name: 'Internet & Phone',   description: 'Monthly internet and landline',       amount: 2200, category: 'Utilities',  paymentMethod: 'digital' as const },
      { name: 'Cleaning Supplies',  description: 'Monthly cleaning consumables',        amount: 650,  category: 'Supplies',   paymentMethod: 'cash'    as const },
      { name: 'Staff Meal Allowance', description: 'Weekly staff meal allowance',       amount: 1200, category: 'Staff',      paymentMethod: 'cash'    as const },
      { name: 'Equipment Repair',   description: 'POS terminal maintenance service',    amount: 1800, category: 'Maintenance', paymentMethod: 'card'   as const },
    ];
    const baseDate = new Date();
    for (let i = 0; i < expenseTemplates.length; i++) {
      const expDate = new Date(baseDate);
      expDate.setDate(expDate.getDate() - i * 5);
      await Expense.create({
        ...expenseTemplates[i],
        tenantId,
        branchId,
        userId,
        date: expDate,
      });
    }
    ok(`Expenses      — ${expenseTemplates.length} created`);
  }

  // ── Attendance ────────────────────────────────────────────────────────────
  const existingAttCount = await Attendance.countDocuments({ tenantId });
  if (existingAttCount > 0 && !FORCE) {
    skip(`Attendance    — ${existingAttCount} records already exist`);
  } else {
    if (FORCE) await Attendance.deleteMany({ tenantId });
    const today = new Date();
    let attCreated = 0;

    for (let d = 13; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(day.getDate() - d);
      // Skip weekends
      if (day.getDay() === 0 || day.getDay() === 6) continue;

      const clockIn  = new Date(day.setHours(8, Math.floor(Math.random() * 15), 0, 0));
      const clockOut = d === 0
        ? undefined
        : new Date(new Date(clockIn).setHours(17, Math.floor(Math.random() * 30), 0, 0));
      const totalHours = clockOut
        ? Math.round(((clockOut.getTime() - clockIn.getTime()) / 3600000) * 10) / 10
        : undefined;

      await Attendance.create({
        userId,
        tenantId,
        clockIn,
        clockOut,
        totalHours,
        overtime: totalHours && totalHours > 8 ? totalHours - 8 : 0,
      });
      attCreated++;
    }
    ok(`Attendance    — ${attCreated} records created`);
  }

  console.log(`  ${c.grey}Login: ${cfg.adminEmail}  /  ${cfg.adminPassword}${c.reset}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  Main
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════╗`);
  console.log(`║   LocalPro POS — Sample Data Seeder     ║`);
  console.log(`╚══════════════════════════════════════════╝${c.reset}`);

  await mongoose.connect(MONGODB_URI);
  ok('Connected to MongoDB');

  // Filter to specific type if requested
  let configs = SEED_CONFIGS;
  if (TYPE_ARG) {
    const matched = SEED_CONFIGS.filter(c => c.businessType === TYPE_ARG);
    if (matched.length === 0) {
      err(`Unknown business type "${TYPE_ARG}". Valid: retail, restaurant, laundry, service, general`);
      process.exit(1);
    }
    configs = matched;
  }

  // Target an existing tenant if requested
  if (TENANT_ARG) {
    const tenant = await Tenant.findOne({ slug: TENANT_ARG });
    if (!tenant) {
      err(`Tenant "${TENANT_ARG}" not found`);
      process.exit(1);
    }
    const tenantSettings = (tenant as any).settings; // eslint-disable-line @typescript-eslint/no-explicit-any
    const bizType = (tenantSettings?.businessType ?? 'general') as BizType;
    const matchedCfg = SEED_CONFIGS.find(c => c.businessType === bizType);
    if (!matchedCfg) {
      err(`No seed config for business type "${bizType}"`);
      process.exit(1);
    }
    await seedTenant(
      { ...matchedCfg, slug: TENANT_ARG, name: tenant.name },
      tenant._id as mongoose.Types.ObjectId,
    );
  } else {
    for (const cfg of configs) {
      await seedTenant(cfg);
    }
  }

  console.log(`\n${c.bold}${c.green}✔  All done!${c.reset}\n`);
  await mongoose.disconnect();
}

main().catch(e => {
  err(String(e));
  process.exit(1);
});
