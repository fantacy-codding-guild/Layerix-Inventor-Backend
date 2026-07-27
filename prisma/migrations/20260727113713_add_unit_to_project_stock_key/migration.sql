/*
  Warnings:

  - The primary key for the `ProjectStock` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "ProjectStock" DROP CONSTRAINT "ProjectStock_pkey",
ADD CONSTRAINT "ProjectStock_pkey" PRIMARY KEY ("projectId", "productId", "unit");
