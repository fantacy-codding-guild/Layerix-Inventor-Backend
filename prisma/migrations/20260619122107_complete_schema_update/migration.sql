/*
  Warnings:

  - You are about to drop the `ProjectMaterialMovement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProjectStockMovement` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProjectMaterialMovement" DROP CONSTRAINT "ProjectMaterialMovement_brandId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMaterialMovement" DROP CONSTRAINT "ProjectMaterialMovement_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMaterialMovement" DROP CONSTRAINT "ProjectMaterialMovement_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectStockMovement" DROP CONSTRAINT "ProjectStockMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectStockMovement" DROP CONSTRAINT "ProjectStockMovement_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectStockMovement" DROP CONSTRAINT "ProjectStockMovement_tenantId_fkey";

-- DropTable
DROP TABLE "ProjectMaterialMovement";

-- DropTable
DROP TABLE "ProjectStockMovement";

-- DropEnum
DROP TYPE "ProjectMaterialType";
