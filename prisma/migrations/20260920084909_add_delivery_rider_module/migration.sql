-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('pickup', 'delivery');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'rider';

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "enableDelivery" BOOLEAN;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "riderCurrentLatitude" DECIMAL(9,6),
ADD COLUMN     "riderCurrentLongitude" DECIMAL(9,6),
ADD COLUMN     "riderLicenseNumber" TEXT,
ADD COLUMN     "riderLocationUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "riderVehicleType" TEXT;

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "transactionId" TEXT,
    "customerId" TEXT,
    "addressStreet" TEXT NOT NULL,
    "addressCity" TEXT NOT NULL,
    "addressState" TEXT,
    "addressZipCode" TEXT,
    "addressCountry" TEXT NOT NULL,
    "addressLatitude" DECIMAL(9,6),
    "addressLongitude" DECIMAL(9,6),
    "riderId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "type" "DeliveryType" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "failureReason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_orders_tenantId_status_idx" ON "delivery_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "delivery_orders_tenantId_riderId_status_idx" ON "delivery_orders"("tenantId", "riderId", "status");

-- CreateIndex
CREATE INDEX "delivery_orders_tenantId_branchId_idx" ON "delivery_orders"("tenantId", "branchId");

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

