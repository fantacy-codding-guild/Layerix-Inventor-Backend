/*
  Warnings:

  - You are about to drop the column `brandId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `ProjectStockMovement` table. All the data in the column will be lost.
  - You are about to drop the `AMC` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BreakFix` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Document` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GoodsReceived` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GoodsReceivedItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InvoicePurchaseOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductUnit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProjectMaterialPlan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProjectMilestone` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseOrder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseOrderItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseRequestItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ServiceTicket` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SiteVisit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockMovement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockReservation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockTransfer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockTransferItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VendorInvoice` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AMC" DROP CONSTRAINT "AMC_customerId_fkey";

-- DropForeignKey
ALTER TABLE "AMC" DROP CONSTRAINT "AMC_projectId_fkey";

-- DropForeignKey
ALTER TABLE "AMC" DROP CONSTRAINT "AMC_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "BreakFix" DROP CONSTRAINT "BreakFix_customerId_fkey";

-- DropForeignKey
ALTER TABLE "BreakFix" DROP CONSTRAINT "BreakFix_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "BreakFix" DROP CONSTRAINT "BreakFix_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_uploadedBy_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceived" DROP CONSTRAINT "GoodsReceived_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceived" DROP CONSTRAINT "GoodsReceived_receivedBy_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceived" DROP CONSTRAINT "GoodsReceived_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceived" DROP CONSTRAINT "GoodsReceived_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceivedItem" DROP CONSTRAINT "GoodsReceivedItem_goodsReceivedId_fkey";

-- DropForeignKey
ALTER TABLE "GoodsReceivedItem" DROP CONSTRAINT "GoodsReceivedItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "InvoicePurchaseOrder" DROP CONSTRAINT "InvoicePurchaseOrder_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoicePurchaseOrder" DROP CONSTRAINT "InvoicePurchaseOrder_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_brandId_fkey";

-- DropForeignKey
ALTER TABLE "ProductUnit" DROP CONSTRAINT "ProductUnit_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMaterialMovement" DROP CONSTRAINT "ProjectMaterialMovement_fromVendorId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMaterialMovement" DROP CONSTRAINT "ProjectMaterialMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMaterialMovement" DROP CONSTRAINT "ProjectMaterialMovement_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMaterialPlan" DROP CONSTRAINT "ProjectMaterialPlan_milestoneId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMaterialPlan" DROP CONSTRAINT "ProjectMaterialPlan_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMaterialPlan" DROP CONSTRAINT "ProjectMaterialPlan_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMilestone" DROP CONSTRAINT "ProjectMilestone_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectStockMovement" DROP CONSTRAINT "ProjectStockMovement_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "PurchaseOrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_requestedBy_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequestItem" DROP CONSTRAINT "PurchaseRequestItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequestItem" DROP CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceTicket" DROP CONSTRAINT "ServiceTicket_assignedTo_fkey";

-- DropForeignKey
ALTER TABLE "ServiceTicket" DROP CONSTRAINT "ServiceTicket_customerId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceTicket" DROP CONSTRAINT "ServiceTicket_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceTicket" DROP CONSTRAINT "ServiceTicket_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SiteVisit" DROP CONSTRAINT "SiteVisit_customerId_fkey";

-- DropForeignKey
ALTER TABLE "SiteVisit" DROP CONSTRAINT "SiteVisit_engineerId_fkey";

-- DropForeignKey
ALTER TABLE "SiteVisit" DROP CONSTRAINT "SiteVisit_projectId_fkey";

-- DropForeignKey
ALTER TABLE "SiteVisit" DROP CONSTRAINT "SiteVisit_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SiteVisit" DROP CONSTRAINT "SiteVisit_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_fromVendorId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_toCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_toProjectId_fkey";

-- DropForeignKey
ALTER TABLE "StockReservation" DROP CONSTRAINT "StockReservation_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockReservation" DROP CONSTRAINT "StockReservation_projectId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransfer" DROP CONSTRAINT "StockTransfer_approvedBy_fkey";

-- DropForeignKey
ALTER TABLE "StockTransfer" DROP CONSTRAINT "StockTransfer_dispatchedBy_fkey";

-- DropForeignKey
ALTER TABLE "StockTransfer" DROP CONSTRAINT "StockTransfer_fromProjectId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransfer" DROP CONSTRAINT "StockTransfer_receivedBy_fkey";

-- DropForeignKey
ALTER TABLE "StockTransfer" DROP CONSTRAINT "StockTransfer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransfer" DROP CONSTRAINT "StockTransfer_toProjectId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransferItem" DROP CONSTRAINT "StockTransferItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransferItem" DROP CONSTRAINT "StockTransferItem_transferId_fkey";

-- DropForeignKey
ALTER TABLE "VendorInvoice" DROP CONSTRAINT "VendorInvoice_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "VendorInvoice" DROP CONSTRAINT "VendorInvoice_vendorId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "brandId",
ADD COLUMN     "brands" TEXT[];

-- AlterTable
ALTER TABLE "ProjectStockMovement" DROP COLUMN "type";

-- DropTable
DROP TABLE "AMC";

-- DropTable
DROP TABLE "BreakFix";

-- DropTable
DROP TABLE "Document";

-- DropTable
DROP TABLE "GoodsReceived";

-- DropTable
DROP TABLE "GoodsReceivedItem";

-- DropTable
DROP TABLE "InvoicePurchaseOrder";

-- DropTable
DROP TABLE "ProductUnit";

-- DropTable
DROP TABLE "ProjectMaterialPlan";

-- DropTable
DROP TABLE "ProjectMilestone";

-- DropTable
DROP TABLE "PurchaseOrder";

-- DropTable
DROP TABLE "PurchaseOrderItem";

-- DropTable
DROP TABLE "PurchaseRequest";

-- DropTable
DROP TABLE "PurchaseRequestItem";

-- DropTable
DROP TABLE "ServiceTicket";

-- DropTable
DROP TABLE "SiteVisit";

-- DropTable
DROP TABLE "StockMovement";

-- DropTable
DROP TABLE "StockReservation";

-- DropTable
DROP TABLE "StockTransfer";

-- DropTable
DROP TABLE "StockTransferItem";

-- DropTable
DROP TABLE "VendorInvoice";

-- DropEnum
DROP TYPE "EntityType";

-- DropEnum
DROP TYPE "MovementType";

-- DropEnum
DROP TYPE "PurchaseOrderStatus";

-- DropEnum
DROP TYPE "ReferenceType";

-- DropEnum
DROP TYPE "TransferStatus";
