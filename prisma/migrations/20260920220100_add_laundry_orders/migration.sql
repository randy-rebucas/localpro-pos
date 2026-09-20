-- CreateEnum
CREATE TYPE "LaundryOrderStatus" AS ENUM ('booked', 'picked_up', 'received', 'sorting', 'washing', 'drying', 'folding', 'ready', 'out_for_delivery', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "LaundryPricingMethod" AS ENUM ('weight', 'item');

-- AlterTable
ALTER TABLE "product_laundry_details" ADD COLUMN     "pricePerUnit" DECIMAL(18,2),
ADD COLUMN     "weightUnit" TEXT;

-- CreateTable
CREATE TABLE "laundry_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "transactionId" TEXT,
    "customerId" TEXT,
    "status" "LaundryOrderStatus" NOT NULL DEFAULT 'booked',
    "pricingMethod" "LaundryPricingMethod" NOT NULL DEFAULT 'item',
    "totalWeightKg" DECIMAL(10,2),
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pickupDeliveryOrderId" TEXT,
    "dropoffDeliveryOrderId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "sortedAt" TIMESTAMP(3),
    "washedAt" TIMESTAMP(3),
    "driedAt" TIMESTAMP(3),
    "foldedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laundry_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laundry_order_items" (
    "id" TEXT NOT NULL,
    "laundryOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "tagNumber" TEXT,
    "qrCode" TEXT,
    "weightKg" DECIMAL(10,2),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "condition" TEXT,
    "notes" TEXT,

    CONSTRAINT "laundry_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "laundry_orders_tenantId_status_idx" ON "laundry_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "laundry_orders_tenantId_branchId_idx" ON "laundry_orders"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "laundry_orders_tenantId_customerId_idx" ON "laundry_orders"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "laundry_order_items_laundryOrderId_idx" ON "laundry_order_items"("laundryOrderId");

-- CreateIndex
CREATE INDEX "laundry_order_items_productId_idx" ON "laundry_order_items"("productId");

-- CreateIndex
CREATE INDEX "laundry_order_items_tagNumber_idx" ON "laundry_order_items"("tagNumber");

-- AddForeignKey
ALTER TABLE "laundry_orders" ADD CONSTRAINT "laundry_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_orders" ADD CONSTRAINT "laundry_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_orders" ADD CONSTRAINT "laundry_orders_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_orders" ADD CONSTRAINT "laundry_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_orders" ADD CONSTRAINT "laundry_orders_pickupDeliveryOrderId_fkey" FOREIGN KEY ("pickupDeliveryOrderId") REFERENCES "delivery_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_orders" ADD CONSTRAINT "laundry_orders_dropoffDeliveryOrderId_fkey" FOREIGN KEY ("dropoffDeliveryOrderId") REFERENCES "delivery_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_order_items" ADD CONSTRAINT "laundry_order_items_laundryOrderId_fkey" FOREIGN KEY ("laundryOrderId") REFERENCES "laundry_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_order_items" ADD CONSTRAINT "laundry_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
