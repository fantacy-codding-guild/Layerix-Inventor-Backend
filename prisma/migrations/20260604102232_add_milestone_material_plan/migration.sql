-- DropIndex
DROP INDEX "ProjectMaterialPlan_projectId_productId_key";

-- AlterTable
ALTER TABLE "ProjectMaterialPlan" ADD COLUMN     "milestoneId" INTEGER;

-- AddForeignKey
ALTER TABLE "ProjectMaterialPlan" ADD CONSTRAINT "ProjectMaterialPlan_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ProjectMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
