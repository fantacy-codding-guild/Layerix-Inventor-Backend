/*
  Warnings:

  - You are about to drop the column `brands` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the `Stock` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Stock" DROP CONSTRAINT "Stock_productId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "brands";

-- DropTable
DROP TABLE "Stock";

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "brand" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "vendorId" INTEGER,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(10,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_productId_idx" ON "InventoryItem"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_productId_brand_unit_vendorId_key" ON "InventoryItem"("tenantId", "productId", "brand", "unit", "vendorId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
