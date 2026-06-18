-- CreateEnum
CREATE TYPE "ProjectMaterialType" AS ENUM ('ORDER', 'CONSUME', 'TRANSFER_OUT');

-- CreateTable
CREATE TABLE "ProjectMaterialMovement" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "type" "ProjectMaterialType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2),
    "fromVendorId" INTEGER,
    "brandId" INTEGER,
    "notes" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMaterialMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMaterialMovement_tenantId_projectId_date_idx" ON "ProjectMaterialMovement"("tenantId", "projectId", "date");

-- AddForeignKey
ALTER TABLE "ProjectMaterialMovement" ADD CONSTRAINT "ProjectMaterialMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterialMovement" ADD CONSTRAINT "ProjectMaterialMovement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterialMovement" ADD CONSTRAINT "ProjectMaterialMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterialMovement" ADD CONSTRAINT "ProjectMaterialMovement_fromVendorId_fkey" FOREIGN KEY ("fromVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterialMovement" ADD CONSTRAINT "ProjectMaterialMovement_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterialMovement" ADD CONSTRAINT "ProjectMaterialMovement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
