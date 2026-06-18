/*
  Warnings:

  - You are about to drop the column `sku` on the `Product` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Product_tenantId_sku_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "sku";
