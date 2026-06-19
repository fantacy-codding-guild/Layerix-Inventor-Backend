-- CreateTable
CREATE TABLE "ProductUnit" (
    "productId" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "conversionFactor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("productId","unit")
);

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
