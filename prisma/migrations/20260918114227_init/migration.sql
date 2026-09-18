-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'manager', 'cashier', 'viewer', 'super_admin');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('not_started', 'in_progress', 'complete');

-- CreateEnum
CREATE TYPE "DiscountCategory" AS ENUM ('general', 'senior', 'pwd', 'employee', 'promo');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('cash', 'card', 'digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'on_account');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('completed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('dine-in', 'takeout', 'delivery');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('pos', 'shopify', 'woocommerce');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethodSimple" AS ENUM ('cash', 'card', 'digital', 'check', 'other', 'on_account');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no-show');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "CashDrawerStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "CouponAppliesTo" AS ENUM ('all_plans', 'specific_plans');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'inactive', 'cancelled', 'suspended', 'trial', 'paused');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentType" AS ENUM ('card', 'bank', 'paypal', 'manual');

-- CreateEnum
CREATE TYPE "BillingHistoryStatus" AS ENUM ('paid', 'failed', 'pending', 'refunded');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('starter', 'pro', 'business', 'enterprise');

-- CreateEnum
CREATE TYPE "BillingEventType" AS ENUM ('invoice_created', 'payment_received', 'payment_failed', 'refund_issued', 'credit_applied', 'plan_changed', 'trial_started', 'trial_converted', 'trial_expired', 'subscription_cancelled', 'subscription_suspended', 'subscription_paused', 'subscription_resumed', 'manual_adjustment', 'invoice_generated', 'payment_overdue', 'late_fee_applied', 'reactivation_fee_applied', 'account_deactivated', 'account_reactivated');

-- CreateEnum
CREATE TYPE "EcommerceProvider" AS ENUM ('shopify', 'woocommerce');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('regular', 'bundle', 'service');

-- CreateEnum
CREATE TYPE "LaundryServiceType" AS ENUM ('wash', 'dry-clean', 'press', 'repair', 'other');

-- CreateEnum
CREATE TYPE "DrugSchedule" AS ENUM ('otc', 'rx', 'dangerous');

-- CreateEnum
CREATE TYPE "PtuStatus" AS ENUM ('pending', 'approved');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('sale', 'purchase', 'adjustment', 'return', 'damage', 'transfer');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('earn', 'redeem', 'adjust');

-- CreateEnum
CREATE TYPE "OfflineSyncStatus" AS ENUM ('pending', 'processing', 'synced', 'failed');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('open', 'occupied', 'check-requested');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('email', 'sms');

-- CreateEnum
CREATE TYPE "CampaignSegment" AS ENUM ('all', 'new', 'regular', 'vip', 'at_risk', 'lapsed');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('cash', 'card', 'digital', 'other');

-- CreateEnum
CREATE TYPE "TaxAppliesTo" AS ENUM ('all', 'products', 'services', 'categories');

-- CreateEnum
CREATE TYPE "CustomerBalancePaymentMethod" AS ENUM ('cash', 'card', 'digital', 'check', 'other');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "subdomain" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "createdById" TEXT,
    "grandTotalSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotalTransactionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currencySymbol" TEXT,
    "currencyPosition" TEXT NOT NULL DEFAULT 'before',
    "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "timeFormat" TEXT NOT NULL DEFAULT '12h',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "language" TEXT NOT NULL DEFAULT 'en',
    "decimalSeparator" TEXT NOT NULL DEFAULT '.',
    "thousandsSeparator" TEXT NOT NULL DEFAULT ',',
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "companyName" TEXT,
    "logo" TEXT,
    "favicon" TEXT,
    "primaryColor" TEXT DEFAULT '#35979c',
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "backgroundColor" TEXT,
    "textColor" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZipCode" TEXT,
    "addressCountry" TEXT,
    "website" TEXT,
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "receiptShowLogo" BOOLEAN NOT NULL DEFAULT true,
    "receiptShowAddress" BOOLEAN NOT NULL DEFAULT true,
    "receiptShowPhone" BOOLEAN NOT NULL DEFAULT false,
    "receiptShowEmail" BOOLEAN NOT NULL DEFAULT false,
    "receiptDefaultTemplateId" TEXT,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxLabel" TEXT NOT NULL DEFAULT 'Tax',
    "businessType" TEXT,
    "taxId" TEXT,
    "registrationNumber" TEXT,
    "birTin" TEXT,
    "birPtuNumber" TEXT,
    "birPtuIssuedDate" TIMESTAMP(3),
    "birPtuExpiryDate" TIMESTAMP(3),
    "birMinNumber" TEXT,
    "birBusinessStyle" TEXT,
    "birSystemProvider" TEXT,
    "birTerminalSN" TEXT,
    "birAccreditationNo" TEXT,
    "birAccreditationDate" TIMESTAMP(3),
    "birAccreditationValidUntil" TIMESTAMP(3),
    "birEsalesPushUrl" TEXT,
    "mayorsPermitNumber" TEXT,
    "mayorsPermitExpiry" TIMESTAMP(3),
    "barangayClearanceNumber" TEXT,
    "barangayClearanceExpiry" TIMESTAMP(3),
    "dtiSecRegistration" TEXT,
    "birCertificateOfRegistration" TEXT,
    "fireSafetyInspectionCertificate" TEXT,
    "fsicExpiry" TIMESTAMP(3),
    "sanitaryPermitNumber" TEXT,
    "sanitaryPermitExpiry" TIMESTAMP(3),
    "fdaFoodBusinessLicense" TEXT,
    "fdaFblExpiry" TIMESTAMP(3),
    "foodSafetyCertificateNumber" TEXT,
    "foodSafetyCertificateExpiry" TIMESTAMP(3),
    "foodHandlersCertified" BOOLEAN NOT NULL DEFAULT false,
    "numberOfCertifiedHandlers" INTEGER,
    "healthCertificateExpiry" TIMESTAMP(3),
    "kitchenSanitationCompliant" BOOLEAN NOT NULL DEFAULT false,
    "dtiBusinessNameRegistration" TEXT,
    "priceTaggingCompliant" BOOLEAN NOT NULL DEFAULT false,
    "weightsAndMeasuresCompliant" BOOLEAN NOT NULL DEFAULT false,
    "btiAccreditation" TEXT,
    "productLabelsCompliant" BOOLEAN NOT NULL DEFAULT false,
    "environmentalComplianceCertificate" TEXT,
    "eccExpiry" TIMESTAMP(3),
    "wastewaterDischargePermit" TEXT,
    "wastewaterPermitExpiry" TIMESTAMP(3),
    "solidWasteManagementPlan" BOOLEAN NOT NULL DEFAULT false,
    "serviceDohAccreditation" TEXT,
    "serviceDohAccreditationExpiry" TIMESTAMP(3),
    "pharmacistName" TEXT,
    "pharmacistPRCNumber" TEXT,
    "pharmacistPTRNumber" TEXT,
    "fdaLTO" TEXT,
    "fdaLTOExpiryDate" TIMESTAMP(3),
    "pharmacyDohAccreditation" TEXT,
    "pdeaLicense" TEXT,
    "pdeaLicenseExpiry" TIMESTAMP(3),
    "requirePrescriptionForRx" BOOLEAN NOT NULL DEFAULT true,
    "trackExpiryDates" BOOLEAN NOT NULL DEFAULT true,
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 90,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "lowStockAlert" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "smsNotifications" BOOLEAN NOT NULL DEFAULT false,
    "attendanceNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "attendanceExpectedStartTime" TEXT NOT NULL DEFAULT '09:00',
    "attendanceMaxHoursWithoutClockOut" INTEGER NOT NULL DEFAULT 12,
    "enableInventory" BOOLEAN NOT NULL DEFAULT true,
    "enableCategories" BOOLEAN NOT NULL DEFAULT true,
    "enableDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "enableLoyaltyProgram" BOOLEAN NOT NULL DEFAULT false,
    "enableCustomerManagement" BOOLEAN NOT NULL DEFAULT false,
    "enableOnAccountSales" BOOLEAN NOT NULL DEFAULT false,
    "autoOpenDrawerOnShiftStart" BOOLEAN NOT NULL DEFAULT false,
    "autoOpenDrawerOnShiftEnd" BOOLEAN NOT NULL DEFAULT false,
    "enableBookingScheduling" BOOLEAN NOT NULL DEFAULT false,
    "enableTableManagement" BOOLEAN NOT NULL DEFAULT false,
    "ecommerceShopifyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ecommerceWooCommerceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "printerType" TEXT,
    "printerProfile" TEXT,
    "printerVendorId" INTEGER,
    "printerProductId" INTEGER,
    "printerIpAddress" TEXT,
    "printerPortNumber" INTEGER,
    "barcodeScannerType" TEXT,
    "barcodeScannerEnabled" BOOLEAN,
    "qrReaderEnabled" BOOLEAN,
    "qrReaderCameraId" TEXT,
    "cashDrawerEnabled" BOOLEAN,
    "cashDrawerConnectedToPrinter" BOOLEAN,
    "touchscreenEnabled" BOOLEAN,
    "multiCurrencyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "displayCurrencies" TEXT[],
    "exchangeRateSource" TEXT NOT NULL DEFAULT 'manual',
    "exchangeRateApiKey" TEXT,
    "exchangeRateLastUpdated" TIMESTAMP(3),
    "emailBookingConfirmationTemplate" TEXT,
    "emailBookingReminderTemplate" TEXT,
    "emailBookingCancellationTemplate" TEXT,
    "emailLowStockAlertTemplate" TEXT,
    "emailAttendanceAlertTemplate" TEXT,
    "smsBookingConfirmationTemplate" TEXT,
    "smsBookingReminderTemplate" TEXT,
    "smsBookingCancellationTemplate" TEXT,
    "smsLowStockAlertTemplate" TEXT,
    "fontFamily" TEXT,
    "fontSource" TEXT NOT NULL DEFAULT 'system',
    "googleFontUrl" TEXT,
    "customFontUrl" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "customThemeCss" TEXT,
    "borderRadius" TEXT NOT NULL DEFAULT 'md',
    "customBorderRadius" TEXT,
    "businessHoursTimezone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tenant_role_permission_overrides" (
    "tenantId" TEXT NOT NULL,
    "overrides" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_role_permission_overrides_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tenant_practitioner_licenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT,
    "licenseType" TEXT,
    "prcNumber" TEXT,
    "ptrNumber" TEXT,
    "licenseExpiry" TIMESTAMP(3),

    CONSTRAINT "tenant_practitioner_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_exchange_rates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "tenant_exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_theme_variables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "tenant_theme_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_receipt_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_receipt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_business_hours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT,
    "closeTime" TEXT,

    CONSTRAINT "tenant_business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_business_hour_breaks" (
    "id" TEXT NOT NULL,
    "businessHourId" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,

    CONSTRAINT "tenant_business_hour_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_special_hours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT,
    "closeTime" TEXT,
    "note" TEXT,

    CONSTRAINT "tenant_special_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_holidays" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'single',
    "recurringPattern" TEXT,
    "recurringDayOfMonth" INTEGER,
    "recurringDayOfWeek" INTEGER,
    "recurringMonth" INTEGER,
    "isBusinessClosed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'cashier',
    "tenantId" TEXT,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "qrToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "managerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "label" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "ptuNumber" TEXT,
    "ptuStatus" "PtuStatus" NOT NULL DEFAULT 'pending',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(18,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT,
    "barcode" TEXT,
    "category" TEXT,
    "categoryId" TEXT,
    "image" TEXT,
    "productType" "ProductType" NOT NULL DEFAULT 'regular',
    "hasVariations" BOOLEAN NOT NULL DEFAULT false,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "zeroRated" BOOLEAN NOT NULL DEFAULT false,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "allowOutOfStockSales" BOOLEAN NOT NULL DEFAULT false,
    "lowStockThreshold" INTEGER,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "type" TEXT,
    "sku" TEXT,
    "price" DECIMAL(18,2),
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_branch_stock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_branch_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_modifiers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_modifier_options" (
    "id" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "product_modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_restaurant_details" (
    "productId" TEXT NOT NULL,
    "allergens" TEXT[],
    "calories" INTEGER,
    "protein" DECIMAL(8,2),
    "carbs" DECIMAL(8,2),
    "fat" DECIMAL(8,2),

    CONSTRAINT "product_restaurant_details_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "product_laundry_details" (
    "productId" TEXT NOT NULL,
    "serviceType" "LaundryServiceType",
    "weightBased" BOOLEAN NOT NULL DEFAULT false,
    "pickupDelivery" BOOLEAN NOT NULL DEFAULT false,
    "estimatedDuration" INTEGER,

    CONSTRAINT "product_laundry_details_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "product_service_details" (
    "productId" TEXT NOT NULL,
    "serviceDuration" INTEGER,
    "staffRequired" INTEGER NOT NULL DEFAULT 1,
    "equipmentRequired" TEXT[],

    CONSTRAINT "product_service_details_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "product_pharmacy_details" (
    "productId" TEXT NOT NULL,
    "genericName" TEXT,
    "manufacturer" TEXT,
    "prn" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "drugSchedule" "DrugSchedule",
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
    "storageConditions" TEXT,
    "activeIngredient" TEXT,
    "dosageStrength" TEXT,
    "dosageForm" TEXT,

    CONSTRAINT "product_pharmacy_details_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "product_bundles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(18,2) NOT NULL,
    "sku" TEXT,
    "categoryId" TEXT,
    "image" TEXT,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_bundle_items" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "variationSize" TEXT,
    "variationColor" TEXT,
    "variationType" TEXT,

    CONSTRAINT "product_bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_channel_listings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "provider" "EcommerceProvider" NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "externalVariantId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "sku" TEXT,
    "variationSize" TEXT,
    "variationColor" TEXT,
    "variationType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_channel_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_ecommerce_integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "EcommerceProvider" NOT NULL,
    "shopDomain" TEXT,
    "siteUrl" TEXT,
    "credentialsEncrypted" TEXT NOT NULL,
    "webhookSecretEncrypted" TEXT,
    "scopes" TEXT[],
    "shopifyLocationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "defaultBranchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ecommerce_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "notes" TEXT,
    "tags" TEXT[],
    "totalSpent" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastPurchaseDate" TIMESTAMP(3),
    "loyaltyPointsBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "accountBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(18,2),
    "shopifyCustomerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_otps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_balance_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "CustomerBalancePaymentMethod" NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_balance_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "segment" "CampaignSegment" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(18,2) NOT NULL,
    "appliesTo" "CouponAppliesTo" NOT NULL DEFAULT 'all_plans',
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_plans" (
    "couponId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "coupon_plans_pkey" PRIMARY KEY ("couponId","planId")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "description" TEXT,
    "priceMonthly" DECIMAL(18,2) NOT NULL,
    "priceSetupFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "priceCurrency" TEXT NOT NULL DEFAULT 'PHP',
    "reactivationFee" DECIMAL(18,2) NOT NULL DEFAULT 500,
    "maxUsers" INTEGER NOT NULL,
    "maxBranches" INTEGER NOT NULL,
    "maxProducts" INTEGER NOT NULL,
    "maxTransactions" INTEGER NOT NULL,
    "enableInventory" BOOLEAN NOT NULL DEFAULT true,
    "enableCategories" BOOLEAN NOT NULL DEFAULT true,
    "enableDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "enableLoyaltyProgram" BOOLEAN NOT NULL DEFAULT false,
    "enableCustomerManagement" BOOLEAN NOT NULL DEFAULT false,
    "enableBookingScheduling" BOOLEAN NOT NULL DEFAULT false,
    "enableTableManagement" BOOLEAN NOT NULL DEFAULT false,
    "enableReports" BOOLEAN NOT NULL DEFAULT true,
    "enableMultiBranch" BOOLEAN NOT NULL DEFAULT false,
    "enableHardwareIntegration" BOOLEAN NOT NULL DEFAULT false,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "customIntegrations" BOOLEAN NOT NULL DEFAULT false,
    "dedicatedAccountManager" BOOLEAN NOT NULL DEFAULT false,
    "birPtuAssistance" BOOLEAN NOT NULL DEFAULT false,
    "birReceiptFormatting" BOOLEAN NOT NULL DEFAULT false,
    "birDocumentation" BOOLEAN NOT NULL DEFAULT false,
    "birCasReporting" BOOLEAN NOT NULL DEFAULT false,
    "birAuditTrailSystem" BOOLEAN NOT NULL DEFAULT false,
    "birMonthlySupport" BOOLEAN NOT NULL DEFAULT false,
    "pharmacyComplianceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionManagement" BOOLEAN NOT NULL DEFAULT false,
    "expiryTracking" BOOLEAN NOT NULL DEFAULT false,
    "pdeaReporting" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "availableToNewTenants" BOOLEAN NOT NULL DEFAULT true,
    "yearlyDiscount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "trialEndDate" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3),
    "lastBillingDate" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "pauseEndsAt" TIMESTAMP(3),
    "gracePeriodEndDate" TIMESTAMP(3),
    "trialConvertedAt" TIMESTAMP(3),
    "paymentOverdue" BOOLEAN NOT NULL DEFAULT false,
    "outstandingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastInvoiceGeneratedAt" TIMESTAMP(3),
    "lateFeeAppliedAt" TIMESTAMP(3),
    "reactivationFeeAppliedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "paymentType" "SubscriptionPaymentType",
    "paymentLast4" TEXT,
    "paymentExpiryMonth" INTEGER,
    "paymentExpiryYear" INTEGER,
    "paymentProvider" TEXT,
    "usageCurrentUsers" INTEGER NOT NULL DEFAULT 0,
    "usageCurrentBranches" INTEGER NOT NULL DEFAULT 1,
    "usageCurrentProducts" INTEGER NOT NULL DEFAULT 0,
    "usageCurrentTransactions" INTEGER NOT NULL DEFAULT 0,
    "usageLastResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isTrial" BOOLEAN NOT NULL DEFAULT true,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_billing_history" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "BillingHistoryStatus" NOT NULL,
    "transactionId" TEXT,
    "invoiceUrl" TEXT,

    CONSTRAINT "subscription_billing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_actions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "description" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" "BillingEventType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "description" TEXT,
    "notes" TEXT,
    "transactionId" TEXT,
    "invoiceUrl" TEXT,
    "recordedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawer_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openingAmount" DECIMAL(18,2) NOT NULL,
    "closingAmount" DECIMAL(18,2),
    "expectedAmount" DECIMAL(18,2),
    "shortage" DECIMAL(18,2),
    "overage" DECIMAL(18,2),
    "openingTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingTime" TIMESTAMP(3),
    "status" "CashDrawerStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "totalVAT" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDiscounts" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_drawer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "category" "DiscountCategory" NOT NULL DEFAULT 'general',
    "requiresIdVerification" BOOLEAN NOT NULL DEFAULT false,
    "minPurchaseAmount" DECIMAL(18,2),
    "maxDiscountAmount" DECIMAL(18,2),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL,
    "receipt" TEXT,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "transactionId" TEXT,
    "customerId" TEXT,
    "snapshotName" TEXT,
    "snapshotEmail" TEXT,
    "snapshotPhone" TEXT,
    "snapshotAddressStreet" TEXT,
    "snapshotAddressCity" TEXT,
    "snapshotAddressState" TEXT,
    "snapshotAddressZipCode" TEXT,
    "snapshotAddressCountry" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2),
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentTerms" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(18,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_configs" (
    "tenantId" TEXT NOT NULL,
    "pointsPerPeso" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "pesoPerPoint" DECIMAL(10,4) NOT NULL DEFAULT 0.10,
    "minRedemption" INTEGER NOT NULL DEFAULT 100,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_configs_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "transactionId" TEXT,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" DECIMAL(18,2) NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "deviceId" TEXT NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountCode" TEXT,
    "discountCategory" "DiscountCategory",
    "discountAmount" DECIMAL(18,2),
    "taxExemptAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "cashReceived" DECIMAL(18,2),
    "change" DECIMAL(18,2),
    "customerId" TEXT,
    "userId" TEXT,
    "notes" TEXT,
    "offlineCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncStatus" "OfflineSyncStatus" NOT NULL DEFAULT 'pending',
    "syncedTransactionId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "syncError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_transaction_items" (
    "id" TEXT NOT NULL,
    "offlineTransactionId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "offline_transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "method" "PaymentMethodSimple" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "detailsCardLast4" TEXT,
    "detailsCardType" TEXT,
    "detailsCardBrand" TEXT,
    "detailsGatewayTxnId" TEXT,
    "detailsProvider" TEXT,
    "detailsCashReceived" DECIMAL(18,2),
    "detailsChange" DECIMAL(18,2),
    "detailsCheckNumber" TEXT,
    "detailsNotes" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prescriptionNumber" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientAge" INTEGER,
    "doctorName" TEXT NOT NULL,
    "doctorPRCNumber" TEXT NOT NULL,
    "doctorClinic" TEXT,
    "issuedDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "scannedCopy" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "productId" TEXT,
    "drugName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "instructions" TEXT,
    "dispensed" BOOLEAN NOT NULL DEFAULT false,
    "dispensedAt" TIMESTAMP(3),
    "dispensedById" TEXT,
    "dispensedTransactionId" TEXT,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_booking_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "serviceName" TEXT NOT NULL,
    "serviceDescription" TEXT,
    "staffId" TEXT,
    "staffName" TEXT,
    "duration" INTEGER NOT NULL,
    "startTimeHour" INTEGER NOT NULL,
    "startTimeMinute" INTEGER NOT NULL,
    "recurrenceType" "RecurrenceType" NOT NULL,
    "daysOfWeek" INTEGER[],
    "dayOfMonth" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_booking_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_carts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Saved Cart',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountCode" TEXT,
    "discountAmount" DECIMAL(18,2),
    "total" DECIMAL(18,2) NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_cart_items" (
    "id" TEXT NOT NULL,
    "savedCartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,

    CONSTRAINT "saved_cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "variationSize" TEXT,
    "variationColor" TEXT,
    "variationType" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "reason" TEXT,
    "transactionId" TEXT,
    "userId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "cart" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" JSONB,
    "taxAmount" DECIMAL(18,2),
    "taxRate" DECIMAL(5,2),
    "taxLabel" TEXT,
    "tip" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'logout',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_revocations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revokedBefore" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_revocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Tax',
    "appliesTo" "TaxAppliesTo" NOT NULL DEFAULT 'all',
    "regionCountry" TEXT,
    "regionState" TEXT,
    "regionCity" TEXT,
    "regionZipCodes" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rule_categories" (
    "taxRuleId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "tax_rule_categories_pkey" PRIMARY KEY ("taxRuleId","categoryId")
);

-- CreateTable
CREATE TABLE "tax_rule_products" (
    "taxRuleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "tax_rule_products_pkey" PRIMARY KEY ("taxRuleId","productId")
);

-- CreateTable
CREATE TABLE "pos_tables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "status" "TableStatus" NOT NULL DEFAULT 'open',
    "currentOrderId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "z_readings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "beginningGT" DECIMAL(18,2) NOT NULL,
    "endingGT" DECIMAL(18,2) NOT NULL,
    "grossSales" DECIMAL(18,2) NOT NULL,
    "vatableSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatExemptSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "zeroRatedSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "voidCount" INTEGER NOT NULL DEFAULT 0,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "z_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "breakStart" TIMESTAMP(3),
    "breakEnd" TIMESTAMP(3),
    "totalHours" DECIMAL(6,2),
    "notes" TEXT,
    "locationLatitude" DECIMAL(9,6),
    "locationLongitude" DECIMAL(9,6),
    "locationAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "serviceName" TEXT NOT NULL,
    "serviceDescription" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "staffId" TEXT,
    "staffName" TEXT,
    "notes" TEXT,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "confirmationSent" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountCode" TEXT,
    "discountCategory" "DiscountCategory",
    "discountAmount" DECIMAL(18,2),
    "scPwdName" TEXT,
    "scPwdId" TEXT,
    "taxExemptAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "zeroRatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "paymentMethod" "PaymentMethodType" NOT NULL,
    "paymentProvider" TEXT,
    "paymentReference" TEXT,
    "bnplInstallments" INTEGER,
    "cashReceived" DECIMAL(18,2),
    "change" DECIMAL(18,2),
    "status" "TransactionStatus" NOT NULL DEFAULT 'completed',
    "customerId" TEXT,
    "loyaltyPointsEarned" DECIMAL(18,2),
    "loyaltyPointsRedeemed" DECIMAL(18,2),
    "userId" TEXT,
    "deviceId" TEXT,
    "terminalId" TEXT,
    "deviceSerialNumber" TEXT,
    "receiptNumber" TEXT,
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "displayCurrency" TEXT,
    "displayTotal" DECIMAL(18,2),
    "orderType" "OrderType",
    "tableNumber" TEXT,
    "tableId" TEXT,
    "splitCount" INTEGER,
    "salesChannel" "SalesChannel",
    "externalOrderId" TEXT,
    "channelSyncKey" TEXT,
    "channelImportedAt" TIMESTAMP(3),
    "shopifyFulfilledAt" TIMESTAMP(3),
    "shopifyFulfillmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_items" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productId" TEXT,
    "variationId" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "prescriptionId" TEXT,

    CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_item_modifiers" (
    "id" TEXT NOT NULL,
    "transactionItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chosenOption" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "transaction_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_split_payments" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "guestIndex" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,

    CONSTRAINT "transaction_split_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archived_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archived_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE INDEX "tenant_practitioner_licenses_tenantId_idx" ON "tenant_practitioner_licenses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_exchange_rates_tenantId_currencyCode_key" ON "tenant_exchange_rates"("tenantId", "currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_theme_variables_tenantId_name_key" ON "tenant_theme_variables"("tenantId", "name");

-- CreateIndex
CREATE INDEX "tenant_receipt_templates_tenantId_idx" ON "tenant_receipt_templates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_business_hours_tenantId_dayOfWeek_key" ON "tenant_business_hours"("tenantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "tenant_business_hour_breaks_businessHourId_idx" ON "tenant_business_hour_breaks"("businessHourId");

-- CreateIndex
CREATE INDEX "tenant_special_hours_tenantId_date_idx" ON "tenant_special_hours"("tenantId", "date");

-- CreateIndex
CREATE INDEX "tenant_holidays_tenantId_idx" ON "tenant_holidays"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_qrToken_key" ON "users"("qrToken");

-- CreateIndex
CREATE INDEX "users_tenantId_role_isActive_idx" ON "users"("tenantId", "role", "isActive");

-- CreateIndex
CREATE INDEX "users_tenantId_branchId_isActive_idx" ON "users"("tenantId", "branchId", "isActive");

-- CreateIndex
CREATE INDEX "addresses_userId_tenantId_idx" ON "addresses"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "branches_tenantId_isActive_idx" ON "branches"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_code_key" ON "branches"("tenantId", "code");

-- CreateIndex
CREATE INDEX "devices_tenantId_isActive_idx" ON "devices"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenantId_terminalId_key" ON "devices"("tenantId", "terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenantId_serialNumber_key" ON "devices"("tenantId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_name_key" ON "categories"("tenantId", "name");

-- CreateIndex
CREATE INDEX "products_tenantId_productType_trackInventory_idx" ON "products"("tenantId", "productType", "trackInventory");

-- CreateIndex
CREATE INDEX "products_tenantId_hasVariations_idx" ON "products"("tenantId", "hasVariations");

-- CreateIndex
CREATE INDEX "products_tenantId_pinned_createdAt_idx" ON "products"("tenantId", "pinned", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_sku_key" ON "products"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_barcode_key" ON "products"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "product_variations_productId_idx" ON "product_variations"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_branch_stock_productId_branchId_key" ON "product_branch_stock"("productId", "branchId");

-- CreateIndex
CREATE INDEX "product_modifiers_productId_idx" ON "product_modifiers"("productId");

-- CreateIndex
CREATE INDEX "product_modifier_options_modifierId_idx" ON "product_modifier_options"("modifierId");

-- CreateIndex
CREATE INDEX "product_pharmacy_details_expiryDate_idx" ON "product_pharmacy_details"("expiryDate");

-- CreateIndex
CREATE INDEX "product_pharmacy_details_drugSchedule_idx" ON "product_pharmacy_details"("drugSchedule");

-- CreateIndex
CREATE INDEX "product_bundles_tenantId_isActive_idx" ON "product_bundles"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "product_bundles_tenantId_sku_key" ON "product_bundles"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "product_bundle_items_bundleId_idx" ON "product_bundle_items"("bundleId");

-- CreateIndex
CREATE INDEX "product_bundle_items_productId_idx" ON "product_bundle_items"("productId");

-- CreateIndex
CREATE INDEX "product_channel_listings_tenantId_productId_provider_idx" ON "product_channel_listings"("tenantId", "productId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "product_channel_listings_tenantId_provider_externalVariantI_key" ON "product_channel_listings"("tenantId", "provider", "externalVariantId");

-- CreateIndex
CREATE INDEX "tenant_ecommerce_integrations_shopDomain_idx" ON "tenant_ecommerce_integrations"("shopDomain");

-- CreateIndex
CREATE INDEX "tenant_ecommerce_integrations_siteUrl_tenantId_idx" ON "tenant_ecommerce_integrations"("siteUrl", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_ecommerce_integrations_tenantId_provider_key" ON "tenant_ecommerce_integrations"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "customers_tenantId_phone_idx" ON "customers"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "customers_tenantId_isActive_idx" ON "customers"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "customers_tenantId_shopifyCustomerId_idx" ON "customers"("tenantId", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "customers_tenantId_tags_idx" ON "customers"("tenantId", "tags");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_email_key" ON "customers"("tenantId", "email");

-- CreateIndex
CREATE INDEX "customer_addresses_customerId_idx" ON "customer_addresses"("customerId");

-- CreateIndex
CREATE INDEX "customer_otps_tenantId_phone_idx" ON "customer_otps"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "customer_otps_tenantId_phone_verified_idx" ON "customer_otps"("tenantId", "phone", "verified");

-- CreateIndex
CREATE INDEX "customer_otps_expiresAt_idx" ON "customer_otps"("expiresAt");

-- CreateIndex
CREATE INDEX "customer_balance_payments_tenantId_customerId_createdAt_idx" ON "customer_balance_payments"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_balance_payments_tenantId_idempotencyKey_key" ON "customer_balance_payments"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "campaigns_tenantId_status_createdAt_idx" ON "campaigns"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_isActive_validFrom_validUntil_idx" ON "coupons"("isActive", "validFrom", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_tier_key" ON "subscription_plans"("tier");

-- CreateIndex
CREATE INDEX "subscription_plans_isActive_idx" ON "subscription_plans"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_planId_status_idx" ON "subscriptions"("planId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_status_nextBillingDate_idx" ON "subscriptions"("tenantId", "status", "nextBillingDate");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_isActive_idx" ON "subscriptions"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "subscription_billing_history_subscriptionId_date_idx" ON "subscription_billing_history"("subscriptionId", "date");

-- CreateIndex
CREATE INDEX "super_admin_actions_adminUserId_createdAt_idx" ON "super_admin_actions"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "super_admin_actions_createdAt_idx" ON "super_admin_actions"("createdAt");

-- CreateIndex
CREATE INDEX "super_admin_actions_targetType_targetId_idx" ON "super_admin_actions"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "billing_events_tenantId_createdAt_idx" ON "billing_events"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_tenantId_transactionId_key" ON "billing_events"("tenantId", "transactionId");

-- CreateIndex
CREATE INDEX "feature_flag_overrides_expiresAt_idx" ON "feature_flag_overrides"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_overrides_tenantId_feature_key" ON "feature_flag_overrides"("tenantId", "feature");

-- CreateIndex
CREATE INDEX "cash_drawer_sessions_tenantId_openingTime_idx" ON "cash_drawer_sessions"("tenantId", "openingTime");

-- CreateIndex
CREATE INDEX "discounts_tenantId_isActive_validFrom_validUntil_idx" ON "discounts"("tenantId", "isActive", "validFrom", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_tenantId_code_key" ON "discounts"("tenantId", "code");

-- CreateIndex
CREATE INDEX "expenses_tenantId_date_idx" ON "expenses"("tenantId", "date");

-- CreateIndex
CREATE INDEX "expenses_tenantId_name_idx" ON "expenses"("tenantId", "name");

-- CreateIndex
CREATE INDEX "expenses_tenantId_isActive_idx" ON "expenses"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "files_tenantId_uploadedAt_idx" ON "files"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "invoices_tenantId_status_dueDate_idx" ON "invoices"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "invoices_tenantId_customerId_idx" ON "invoices"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_transactionId_idx" ON "invoices"("tenantId", "transactionId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_isActive_idx" ON "invoices"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key" ON "invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenantId_customerId_createdAt_idx" ON "loyalty_transactions"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenantId_transactionId_idx" ON "loyalty_transactions"("tenantId", "transactionId");

-- CreateIndex
CREATE INDEX "offline_transactions_tenantId_syncStatus_idx" ON "offline_transactions"("tenantId", "syncStatus");

-- CreateIndex
CREATE INDEX "offline_transactions_tenantId_deviceId_offlineCreatedAt_idx" ON "offline_transactions"("tenantId", "deviceId", "offlineCreatedAt");

-- CreateIndex
CREATE INDEX "offline_transactions_tenantId_createdAt_idx" ON "offline_transactions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "offline_transaction_items_offlineTransactionId_idx" ON "offline_transaction_items"("offlineTransactionId");

-- CreateIndex
CREATE INDEX "payments_tenantId_transactionId_idx" ON "payments"("tenantId", "transactionId");

-- CreateIndex
CREATE INDEX "payments_tenantId_status_createdAt_idx" ON "payments"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "payments_tenantId_method_createdAt_idx" ON "payments"("tenantId", "method", "createdAt");

-- CreateIndex
CREATE INDEX "payments_tenantId_status_method_createdAt_idx" ON "payments"("tenantId", "status", "method", "createdAt");

-- CreateIndex
CREATE INDEX "payments_processedById_createdAt_idx" ON "payments"("processedById", "createdAt");

-- CreateIndex
CREATE INDEX "payments_tenantId_isActive_idx" ON "payments"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "prescriptions_tenantId_createdAt_idx" ON "prescriptions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "prescriptions_tenantId_status_createdAt_idx" ON "prescriptions"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "prescriptions_tenantId_validUntil_idx" ON "prescriptions"("tenantId", "validUntil");

-- CreateIndex
CREATE INDEX "prescriptions_tenantId_patientName_idx" ON "prescriptions"("tenantId", "patientName");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_tenantId_prescriptionNumber_key" ON "prescriptions"("tenantId", "prescriptionNumber");

-- CreateIndex
CREATE INDEX "prescription_items_prescriptionId_idx" ON "prescription_items"("prescriptionId");

-- CreateIndex
CREATE INDEX "recurring_booking_templates_tenantId_isActive_idx" ON "recurring_booking_templates"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "recurring_booking_templates_tenantId_staffId_isActive_idx" ON "recurring_booking_templates"("tenantId", "staffId", "isActive");

-- CreateIndex
CREATE INDEX "recurring_booking_templates_tenantId_recurrenceType_isActiv_idx" ON "recurring_booking_templates"("tenantId", "recurrenceType", "isActive");

-- CreateIndex
CREATE INDEX "saved_carts_tenantId_userId_createdAt_idx" ON "saved_carts"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "saved_carts_tenantId_name_idx" ON "saved_carts"("tenantId", "name");

-- CreateIndex
CREATE INDEX "saved_cart_items_savedCartId_idx" ON "saved_cart_items"("savedCartId");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_productId_createdAt_idx" ON "stock_movements"("tenantId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_branchId_productId_createdAt_idx" ON "stock_movements"("tenantId", "branchId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_type_createdAt_idx" ON "stock_movements"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_transactionId_idx" ON "stock_movements"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "counters_tenantId_key_key" ON "counters"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sessions_sessionId_key" ON "pos_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "pos_sessions_tenant_idx" ON "pos_sessions"("tenant");

-- CreateIndex
CREATE INDEX "pos_sessions_expiresAt_idx" ON "pos_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "revoked_tokens_tokenHash_key" ON "revoked_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "revoked_tokens_expiresAt_idx" ON "revoked_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_revocations_userId_key" ON "user_revocations"("userId");

-- CreateIndex
CREATE INDEX "tax_rules_tenantId_isActive_priority_idx" ON "tax_rules"("tenantId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "tax_rules_tenantId_appliesTo_isActive_idx" ON "tax_rules"("tenantId", "appliesTo", "isActive");

-- CreateIndex
CREATE INDEX "pos_tables_tenantId_isActive_status_idx" ON "pos_tables"("tenantId", "isActive", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos_tables_tenantId_name_key" ON "pos_tables"("tenantId", "name");

-- CreateIndex
CREATE INDEX "z_readings_tenantId_businessDate_idx" ON "z_readings"("tenantId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "z_readings_tenantId_branchId_businessDate_key" ON "z_readings"("tenantId", "branchId", "businessDate");

-- CreateIndex
CREATE INDEX "attendances_tenantId_userId_clockIn_idx" ON "attendances"("tenantId", "userId", "clockIn");

-- CreateIndex
CREATE INDEX "attendances_tenantId_clockIn_idx" ON "attendances"("tenantId", "clockIn");

-- CreateIndex
CREATE INDEX "attendances_tenantId_isActive_idx" ON "attendances"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "bookings_tenantId_startTime_idx" ON "bookings"("tenantId", "startTime");

-- CreateIndex
CREATE INDEX "bookings_tenantId_staffId_startTime_idx" ON "bookings"("tenantId", "staffId", "startTime");

-- CreateIndex
CREATE INDEX "bookings_startTime_endTime_idx" ON "bookings"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "bookings_tenantId_status_createdAt_idx" ON "bookings"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_tenantId_createdAt_idx" ON "transactions"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_tenantId_branchId_createdAt_idx" ON "transactions"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_tenantId_status_idx" ON "transactions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "transactions_tenantId_isActive_createdAt_idx" ON "transactions"("tenantId", "isActive", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tenantId_receiptNumber_key" ON "transactions"("tenantId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tenantId_idempotencyKey_key" ON "transactions"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tenantId_channelSyncKey_key" ON "transactions"("tenantId", "channelSyncKey");

-- CreateIndex
CREATE INDEX "transaction_items_transactionId_idx" ON "transaction_items"("transactionId");

-- CreateIndex
CREATE INDEX "transaction_items_productId_idx" ON "transaction_items"("productId");

-- CreateIndex
CREATE INDEX "transaction_item_modifiers_transactionItemId_idx" ON "transaction_item_modifiers"("transactionItemId");

-- CreateIndex
CREATE INDEX "transaction_split_payments_transactionId_idx" ON "transaction_split_payments"("transactionId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_userId_createdAt_idx" ON "audit_logs"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entityType_entityId_idx" ON "audit_logs"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "archived_audit_logs_tenantId_createdAt_idx" ON "archived_audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "archived_audit_logs_tenantId_entityType_entityId_idx" ON "archived_audit_logs"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "archived_audit_logs_tenantId_archivedAt_idx" ON "archived_audit_logs"("tenantId", "archivedAt");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_practitioner_licenses" ADD CONSTRAINT "tenant_practitioner_licenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_exchange_rates" ADD CONSTRAINT "tenant_exchange_rates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_theme_variables" ADD CONSTRAINT "tenant_theme_variables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_receipt_templates" ADD CONSTRAINT "tenant_receipt_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_business_hours" ADD CONSTRAINT "tenant_business_hours_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_business_hour_breaks" ADD CONSTRAINT "tenant_business_hour_breaks_businessHourId_fkey" FOREIGN KEY ("businessHourId") REFERENCES "tenant_business_hours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_special_hours" ADD CONSTRAINT "tenant_special_hours_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_holidays" ADD CONSTRAINT "tenant_holidays_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variations" ADD CONSTRAINT "product_variations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_branch_stock" ADD CONSTRAINT "product_branch_stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_modifiers" ADD CONSTRAINT "product_modifiers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_modifier_options" ADD CONSTRAINT "product_modifier_options_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "product_modifiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_restaurant_details" ADD CONSTRAINT "product_restaurant_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_laundry_details" ADD CONSTRAINT "product_laundry_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_service_details" ADD CONSTRAINT "product_service_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_pharmacy_details" ADD CONSTRAINT "product_pharmacy_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "product_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channel_listings" ADD CONSTRAINT "product_channel_listings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channel_listings" ADD CONSTRAINT "product_channel_listings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ecommerce_integrations" ADD CONSTRAINT "tenant_ecommerce_integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ecommerce_integrations" ADD CONSTRAINT "tenant_ecommerce_integrations_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_plans" ADD CONSTRAINT "coupon_plans_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_plans" ADD CONSTRAINT "coupon_plans_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_billing_history" ADD CONSTRAINT "subscription_billing_history_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_actions" ADD CONSTRAINT "super_admin_actions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_configs" ADD CONSTRAINT "loyalty_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_syncedTransactionId_fkey" FOREIGN KEY ("syncedTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transaction_items" ADD CONSTRAINT "offline_transaction_items_offlineTransactionId_fkey" FOREIGN KEY ("offlineTransactionId") REFERENCES "offline_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transaction_items" ADD CONSTRAINT "offline_transaction_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_dispensedTransactionId_fkey" FOREIGN KEY ("dispensedTransactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_booking_templates" ADD CONSTRAINT "recurring_booking_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_booking_templates" ADD CONSTRAINT "recurring_booking_templates_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_carts" ADD CONSTRAINT "saved_carts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_carts" ADD CONSTRAINT "saved_carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_cart_items" ADD CONSTRAINT "saved_cart_items_savedCartId_fkey" FOREIGN KEY ("savedCartId") REFERENCES "saved_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_cart_items" ADD CONSTRAINT "saved_cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rule_categories" ADD CONSTRAINT "tax_rule_categories_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "tax_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rule_categories" ADD CONSTRAINT "tax_rule_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rule_products" ADD CONSTRAINT "tax_rule_products_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "tax_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rule_products" ADD CONSTRAINT "tax_rule_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_tables" ADD CONSTRAINT "pos_tables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_tables" ADD CONSTRAINT "pos_tables_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_tables" ADD CONSTRAINT "pos_tables_currentOrderId_fkey" FOREIGN KEY ("currentOrderId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "pos_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "product_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_item_modifiers" ADD CONSTRAINT "transaction_item_modifiers_transactionItemId_fkey" FOREIGN KEY ("transactionItemId") REFERENCES "transaction_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_split_payments" ADD CONSTRAINT "transaction_split_payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archived_audit_logs" ADD CONSTRAINT "archived_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archived_audit_logs" ADD CONSTRAINT "archived_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
