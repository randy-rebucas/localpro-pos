/**
 * Script to create a default tenant
 * Run with: npx tsx scripts/create-default-tenant.ts
 */
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local file (Next.js convention)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env') });


import mongoose from 'mongoose';
import Tenant from '../models/Tenant';
import User from '../models/User';
import bcrypt from 'bcryptjs';

const plans = [
    { plan: 'starter', price: 999 },
    { plan: 'pro', price: 1999 },
    { plan: 'business', price: 3999 },
    { plan: 'enterprise', price: 0 }, // Custom pricing
];

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/1pos';

async function seed() {
    await mongoose.connect(MONGODB_URI);
    console.log('Seeding...');
    // Update all tenants: if missing or invalid subscription fields, set to starter plan with 1-day trial
    const now = new Date();
    const trialEnds = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const allTenants = await Tenant.find();
    for (const tenant of allTenants) {
        let updated = false;
        if (!tenant.subscriptionPlan || !['starter','pro','business','enterprise'].includes(tenant.subscriptionPlan)) {
            tenant.subscriptionPlan = 'starter';
            tenant.subscriptionStatus = 'trial';
            tenant.subscriptionTrialEndsAt = trialEnds;
            tenant.subscriptionEndsAt = undefined;
            updated = true;
        }
        // Set price based on plan
        const planObj = plans.find(p => p.plan === tenant.subscriptionPlan);
        if (planObj && tenant.subscriptionPrice !== planObj.price) {
            tenant.subscriptionPrice = planObj.price;
            updated = true;
        }
        if (updated) {
            await tenant.save();
            console.log(`Updated tenant ${tenant.slug} to plan ${tenant.subscriptionPlan}.`);
        }
    }

    // Ensure static super-admin tenant and user exist
    let adminTenant = await Tenant.findOne({ slug: 'admin' });
    if (!adminTenant) {
        adminTenant = await Tenant.create({
            slug: 'admin',
            name: 'Super Admin',
            subdomain: 'admin',
            isActive: true,
            settings: {
                currency: 'USD',
                timezone: 'UTC',
                language: 'en',
                primaryColor: '#111827',
            },
            subscriptionPlan: 'enterprise',
            subscriptionStatus: 'active',
        });
        console.log('Created admin tenant');
    }
    const adminEmail = 'admin@1pos.local';
    const adminPassword = 'AdminSuperSecret2026!';
    let adminUser = await User.findOne({ email: adminEmail, tenantId: adminTenant._id });
    if (!adminUser) {
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        adminUser = await User.create({
            tenantId: adminTenant._id,
            email: adminEmail,
            name: 'Super Admin',
            role: 'owner',
            password: passwordHash,
            isActive: true,
        });
        console.log('Created static admin user:', adminEmail);
    }

    await mongoose.disconnect();
    console.log('Seeding complete.');
}

seed().catch((err) => {
    console.error(err);
    process.exit(1);
});