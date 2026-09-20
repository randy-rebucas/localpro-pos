-- CreateEnum
CREATE TYPE "KitchenTicketItemStatus" AS ENUM ('queued', 'preparing', 'ready', 'served', 'cancelled');

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "enableKitchenDisplay" BOOLEAN;

-- CreateTable
CREATE TABLE "kitchen_tickets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "transactionId" TEXT NOT NULL,
    "tableId" TEXT,
    "orderType" "OrderType",
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_ticket_items" (
    "id" TEXT NOT NULL,
    "kitchenTicketId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionItemId" TEXT NOT NULL,
    "station" TEXT,
    "status" "KitchenTicketItemStatus" NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_ticket_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kitchen_tickets_tenantId_isActive_idx" ON "kitchen_tickets"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "kitchen_tickets_tenantId_branchId_idx" ON "kitchen_tickets"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "kitchen_ticket_items_kitchenTicketId_idx" ON "kitchen_ticket_items"("kitchenTicketId");

-- CreateIndex
CREATE INDEX "kitchen_ticket_items_tenantId_status_idx" ON "kitchen_ticket_items"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_ticket_items" ADD CONSTRAINT "kitchen_ticket_items_kitchenTicketId_fkey" FOREIGN KEY ("kitchenTicketId") REFERENCES "kitchen_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_ticket_items" ADD CONSTRAINT "kitchen_ticket_items_transactionItemId_fkey" FOREIGN KEY ("transactionItemId") REFERENCES "transaction_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

