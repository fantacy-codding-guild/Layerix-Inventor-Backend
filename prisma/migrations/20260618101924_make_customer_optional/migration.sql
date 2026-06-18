-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_customerId_fkey";

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "customerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
