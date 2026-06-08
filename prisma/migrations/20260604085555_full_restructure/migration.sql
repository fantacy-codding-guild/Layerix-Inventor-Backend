-- DropIndex
DROP INDEX "Product_tenantId_sku_key";

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "averageCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "fromVendorId" INTEGER,
ADD COLUMN     "toCustomerId" INTEGER,
ADD COLUMN     "toProjectId" INTEGER,
ADD COLUMN     "unitPrice" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromVendorId_fkey" FOREIGN KEY ("fromVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toProjectId_fkey" FOREIGN KEY ("toProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toCustomerId_fkey" FOREIGN KEY ("toCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
