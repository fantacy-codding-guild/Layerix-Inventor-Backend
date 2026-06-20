/*
  Warnings:

  - You are about to drop the `ProductBrand` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProductBrand" DROP CONSTRAINT "ProductBrand_brandId_fkey";

-- DropForeignKey
ALTER TABLE "ProductBrand" DROP CONSTRAINT "ProductBrand_productId_fkey";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brandId" INTEGER;

-- DropTable
DROP TABLE "ProductBrand";

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
