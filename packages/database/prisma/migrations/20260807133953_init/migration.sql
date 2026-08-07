-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PLATFORM', 'TENANT_STAFF', 'CUSTOMER', 'SYSTEM_AUTOMATION');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('INVITED', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'TRIAL', 'PENDING_SETUP', 'FROZEN', 'SUSPENDED', 'READ_ONLY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('TENANT_OWNER', 'TENANT_ADMIN', 'BRANCH_MANAGER', 'TECHNICIAN', 'INVENTORY_MANAGER', 'TEAM_LEADER', 'DATA_ANALYST');

-- CreateEnum
CREATE TYPE "CustomerPortalStatus" AS ENUM ('NOT_INVITED', 'INVITED', 'ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CategoryCode" AS ENUM ('CARS', 'MOTORCYCLES', 'HEAVY_EQUIPMENT');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'REGISTERED', 'UNDER_INSPECTION', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVED_FOR_WORK', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_CUSTOMER', 'BLOCKED', 'READY_FOR_TEAM_REVIEW', 'READY_FOR_QC', 'QC_FAILED', 'READY_FOR_DELIVERY', 'PAYMENT_PENDING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'READY_FOR_REVIEW', 'RETURNED_FOR_REWORK', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BlockerReason" AS ENUM ('WAITING_PART', 'WAITING_CUSTOMER', 'NEED_TEAM_LEADER', 'TOOL_MISSING', 'SAFETY_ISSUE', 'UNCLEAR_DIAGNOSIS', 'OTHER');

-- CreateEnum
CREATE TYPE "BlockerStatus" AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('QUICK', 'FULL');

-- CreateEnum
CREATE TYPE "SeverityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PartRequestStatus" AS ENUM ('DRAFT', 'REQUESTED', 'WAREHOUSE_REVIEWING', 'APPROVED', 'ISSUED', 'IN_TRANSIT', 'ARRIVED', 'RECEIVED_BY_TECHNICIAN', 'USED', 'REJECTED', 'UNAVAILABLE', 'WAITING_TRANSFER', 'WAITING_SUPPLIER', 'RETURN_REQUESTED', 'RETURN_ACCEPTED', 'RETURNED_TO_STOCK', 'RETURN_REJECTED', 'RETURN_CLARIFICATION_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ISSUE', 'RETURN_TO_STOCK', 'DAMAGED', 'TRANSFER_IN', 'TRANSFER_OUT', 'SUPPLIER_RECEIPT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('REQUESTED', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'WALLET', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DiscountRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CustomerDecisionStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'PARTIALLY_RESPONDED', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CustomerDecisionItemDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PermissionSource" AS ENUM ('ROLE_DEFAULT', 'OWNER_OVERRIDE');

-- CreateEnum
CREATE TYPE "ControlSettingScope" AS ENUM ('PLATFORM', 'TENANT');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('SYSTEM', 'PLATFORM', 'TENANT_STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "AuditRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxBranches" INTEGER NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "maxWarehouses" INTEGER NOT NULL,
    "allowedCategories" "CategoryCode"[],
    "allowedModules" TEXT[],
    "allowedFeatures" TEXT[],
    "allowedReports" TEXT[],
    "monthlyPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customerRegistrationCode" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "planId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "primaryCategory" "CategoryCode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_settings" (
    "id" TEXT NOT NULL,
    "scope" "ControlSettingScope" NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_warehouse_access" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,

    CONSTRAINT "branch_warehouse_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "tenantId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT,
    "accessSecretHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "branchScope" TEXT[],
    "warehouseScope" TEXT[],
    "categoryScope" "CategoryCode"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "teamLeaderId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "portalStatus" "CustomerPortalStatus" NOT NULL DEFAULT 'NOT_INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "source" "PermissionSource" NOT NULL DEFAULT 'ROLE_DEFAULT',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_pages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "pageId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" "CategoryCode" NOT NULL,
    "plateNumber" TEXT,
    "vinOrChassisNumber" TEXT,
    "engineNumber" TEXT,
    "serialNumber" TEXT,
    "hourMeter" DECIMAL(12,2),
    "site" TEXT,
    "fleet" TEXT,
    "operator" TEXT,
    "currentOwnerCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_ownership_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "asset_ownership_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "relinkedFromWorkOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),

    CONSTRAINT "work_order_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subtasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_blockers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reason" "BlockerReason" NOT NULL,
    "note" TEXT,
    "status" "BlockerStatus" NOT NULL DEFAULT 'OPEN',
    "reportedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "task_blockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "odometerOrHours" DECIMAL(12,2),
    "fields" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faults" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "severity" "SeverityLevel" NOT NULL,
    "recommendedService" TEXT,
    "customerApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "compatibleCategories" "CategoryCode"[],
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "criticalStockThreshold" INTEGER NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2),
    "workOrderUsable" BOOLEAN NOT NULL DEFAULT true,
    "posVisible" BOOLEAN NOT NULL DEFAULT true,
    "stockTracked" BOOLEAN NOT NULL DEFAULT true,
    "barcode" TEXT,
    "supplier" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_stock_balances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "availableQty" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "issuedQty" INTEGER NOT NULL DEFAULT 0,
    "returnPendingQty" INTEGER NOT NULL DEFAULT 0,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "warehouse_stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "taskId" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "reason" TEXT,
    "status" "PartRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "part_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issued_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partRequestId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "issued_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_return_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partRequestId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "part_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "beforeQty" INTEGER NOT NULL,
    "afterQty" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "destWarehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplier" TEXT,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_catalog_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "laborPrice" DECIMAL(12,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "price_catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "laborPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvedPrice" DECIMAL(12,2),
    "priceLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "running_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "running_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "running_invoice_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runningInvoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "laborPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "running_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "immutableVersion" INTEGER NOT NULL DEFAULT 1,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lockedUnitPrice" DECIMAL(12,2) NOT NULL,
    "lockedLaborPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "tenantId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "idempotencyKey" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DiscountRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "discount_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_configuration" (
    "tenantId" TEXT NOT NULL,
    "technicianPriceVisible" BOOLEAN NOT NULL DEFAULT false,
    "customerInvoiceVisible" BOOLEAN NOT NULL DEFAULT true,
    "discountApprovalThreshold" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxBranchDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "allowUnpaidDelivery" BOOLEAN NOT NULL DEFAULT false,
    "allowPartialPaidDelivery" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethods" "PaymentMethod"[],
    "invoiceTerms" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_configuration_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "customer_decision_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CustomerDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "secureToken" TEXT NOT NULL,
    "whatsappMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_decision_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_decision_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "decisionRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "importance" "SeverityLevel" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "laborPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "decision" "CustomerDecisionItemDecision" NOT NULL DEFAULT 'PENDING',
    "warningAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "customer_decision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_timeline_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "customerId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safe_technical_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "ownerCustomerId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safe_technical_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_configuration" (
    "tenantId" TEXT NOT NULL,
    "theme" JSONB NOT NULL,
    "pageLayouts" JSONB NOT NULL,
    "roleExperience" JSONB NOT NULL,
    "workflowPolicy" JSONB NOT NULL,
    "featureFlags" JSONB NOT NULL,
    "enabledModules" TEXT[],
    "enabledFeatures" TEXT[],
    "forms" JSONB NOT NULL,
    "messageTemplates" JSONB NOT NULL,
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_configuration_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tenant_configuration_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "riskLevel" "AuditRiskLevel" NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_configuration_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorName" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "riskLevel" "AuditRiskLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_live_view_sessions" (
    "id" TEXT NOT NULL,
    "platformAccountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roleViewed" "StaffRole" NOT NULL,
    "personaViewed" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'read_only',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "platform_live_view_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_customerRegistrationCode_key" ON "tenants"("customerRegistrationCode");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "control_settings_tenantId_key_idx" ON "control_settings"("tenantId", "key");

-- CreateIndex
CREATE INDEX "control_settings_scope_key_idx" ON "control_settings"("scope", "key");

-- CreateIndex
CREATE INDEX "branches_tenantId_idx" ON "branches"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_code_key" ON "branches"("tenantId", "code");

-- CreateIndex
CREATE INDEX "warehouses_tenantId_idx" ON "warehouses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenantId_code_key" ON "warehouses"("tenantId", "code");

-- CreateIndex
CREATE INDEX "branch_warehouse_access_tenantId_idx" ON "branch_warehouse_access"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_warehouse_access_branchId_warehouseId_key" ON "branch_warehouse_access"("branchId", "warehouseId");

-- CreateIndex
CREATE INDEX "accounts_accountType_tenantId_idx" ON "accounts"("accountType", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenantId_email_key" ON "accounts"("tenantId", "email");

-- CreateIndex
CREATE INDEX "sessions_accountId_idx" ON "sessions"("accountId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_accountId_key" ON "staff_users"("accountId");

-- CreateIndex
CREATE INDEX "staff_users_tenantId_role_idx" ON "staff_users"("tenantId", "role");

-- CreateIndex
CREATE INDEX "teams_tenantId_idx" ON "teams"("tenantId");

-- CreateIndex
CREATE INDEX "team_memberships_teamId_endedAt_idx" ON "team_memberships"("teamId", "endedAt");

-- CreateIndex
CREATE INDEX "team_memberships_technicianId_endedAt_idx" ON "team_memberships"("technicianId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_accountId_key" ON "customers"("accountId");

-- CreateIndex
CREATE INDEX "customers_tenantId_phone_idx" ON "customers"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "role_permissions_tenantId_role_idx" ON "role_permissions"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenantId_role_permissionKey_key" ON "role_permissions"("tenantId", "role", "permissionKey");

-- CreateIndex
CREATE INDEX "user_permission_overrides_tenantId_idx" ON "user_permission_overrides"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_staffUserId_permissionKey_key" ON "user_permission_overrides"("staffUserId", "permissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "role_pages_tenantId_role_pageId_key" ON "role_pages"("tenantId", "role", "pageId");

-- CreateIndex
CREATE INDEX "assets_tenantId_plateNumber_idx" ON "assets"("tenantId", "plateNumber");

-- CreateIndex
CREATE INDEX "assets_tenantId_serialNumber_idx" ON "assets"("tenantId", "serialNumber");

-- CreateIndex
CREATE INDEX "asset_ownership_history_assetId_endedAt_idx" ON "asset_ownership_history"("assetId", "endedAt");

-- CreateIndex
CREATE INDEX "asset_ownership_history_customerId_idx" ON "asset_ownership_history"("customerId");

-- CreateIndex
CREATE INDEX "work_orders_tenantId_status_idx" ON "work_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "work_orders_tenantId_branchId_status_idx" ON "work_orders"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "work_orders_assetId_idx" ON "work_orders"("assetId");

-- CreateIndex
CREATE INDEX "work_order_assignments_workOrderId_idx" ON "work_order_assignments"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_assignments_staffUserId_unassignedAt_idx" ON "work_order_assignments"("staffUserId", "unassignedAt");

-- CreateIndex
CREATE INDEX "tasks_tenantId_status_idx" ON "tasks"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tasks_workOrderId_idx" ON "tasks"("workOrderId");

-- CreateIndex
CREATE INDEX "subtasks_taskId_idx" ON "subtasks"("taskId");

-- CreateIndex
CREATE INDEX "task_assignments_taskId_idx" ON "task_assignments"("taskId");

-- CreateIndex
CREATE INDEX "task_assignments_staffUserId_unassignedAt_idx" ON "task_assignments"("staffUserId", "unassignedAt");

-- CreateIndex
CREATE INDEX "task_blockers_taskId_status_idx" ON "task_blockers"("taskId", "status");

-- CreateIndex
CREATE INDEX "inspections_workOrderId_idx" ON "inspections"("workOrderId");

-- CreateIndex
CREATE INDEX "faults_workOrderId_idx" ON "faults"("workOrderId");

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_idx" ON "inventory_items"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenantId_sku_key" ON "inventory_items"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "warehouse_stock_balances_tenantId_idx" ON "warehouse_stock_balances"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_stock_balances_inventoryItemId_warehouseId_key" ON "warehouse_stock_balances"("inventoryItemId", "warehouseId");

-- CreateIndex
CREATE INDEX "part_requests_tenantId_status_idx" ON "part_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "part_requests_workOrderId_idx" ON "part_requests"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "issued_items_partRequestId_key" ON "issued_items"("partRequestId");

-- CreateIndex
CREATE INDEX "issued_items_warehouseId_idx" ON "issued_items"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "part_return_requests_partRequestId_key" ON "part_return_requests"("partRequestId");

-- CreateIndex
CREATE INDEX "part_return_requests_tenantId_idx" ON "part_return_requests"("tenantId");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_inventoryItemId_idx" ON "stock_movements"("tenantId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "stock_movements_warehouseId_idx" ON "stock_movements"("warehouseId");

-- CreateIndex
CREATE INDEX "inventory_transfers_tenantId_status_idx" ON "inventory_transfers"("tenantId", "status");

-- CreateIndex
CREATE INDEX "supplier_orders_tenantId_status_idx" ON "supplier_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "price_catalog_entries_tenantId_itemKey_effectiveFrom_idx" ON "price_catalog_entries"("tenantId", "itemKey", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_workOrderId_key" ON "quotations"("workOrderId");

-- CreateIndex
CREATE INDEX "quotations_tenantId_idx" ON "quotations"("tenantId");

-- CreateIndex
CREATE INDEX "quotation_items_quotationId_idx" ON "quotation_items"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "running_invoices_workOrderId_key" ON "running_invoices"("workOrderId");

-- CreateIndex
CREATE INDEX "running_invoice_lines_runningInvoiceId_idx" ON "running_invoice_lines"("runningInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_workOrderId_key" ON "invoices"("workOrderId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key" ON "invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_tenantId_invoiceId_idx" ON "payments"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "discount_requests_tenantId_status_idx" ON "discount_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "refund_requests_tenantId_status_idx" ON "refund_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "credit_notes_tenantId_invoiceId_idx" ON "credit_notes"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_decision_requests_secureToken_key" ON "customer_decision_requests"("secureToken");

-- CreateIndex
CREATE INDEX "customer_decision_requests_tenantId_status_idx" ON "customer_decision_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "customer_decision_requests_workOrderId_idx" ON "customer_decision_requests"("workOrderId");

-- CreateIndex
CREATE INDEX "customer_decision_items_decisionRequestId_idx" ON "customer_decision_items"("decisionRequestId");

-- CreateIndex
CREATE INDEX "customer_timeline_events_customerId_createdAt_idx" ON "customer_timeline_events"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "safe_technical_history_assetId_ownerCustomerId_idx" ON "safe_technical_history"("assetId", "ownerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_configuration_versions_tenantId_version_key" ON "tenant_configuration_versions"("tenantId", "version");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "operation_events_tenantId_eventKey_idx" ON "operation_events"("tenantId", "eventKey");

-- CreateIndex
CREATE INDEX "platform_live_view_sessions_tenantId_startedAt_idx" ON "platform_live_view_sessions"("tenantId", "startedAt");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_settings" ADD CONSTRAINT "control_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_warehouse_access" ADD CONSTRAINT "branch_warehouse_access_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_warehouse_access" ADD CONSTRAINT "branch_warehouse_access_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_teamLeaderId_fkey" FOREIGN KEY ("teamLeaderId") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_pages" ADD CONSTRAINT "role_pages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_ownership_history" ADD CONSTRAINT "asset_ownership_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_ownership_history" ADD CONSTRAINT "asset_ownership_history_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_relinkedFromWorkOrderId_fkey" FOREIGN KEY ("relinkedFromWorkOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faults" ADD CONSTRAINT "faults_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faults" ADD CONSTRAINT "faults_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_balances" ADD CONSTRAINT "warehouse_stock_balances_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_balances" ADD CONSTRAINT "warehouse_stock_balances_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_items" ADD CONSTRAINT "issued_items_partRequestId_fkey" FOREIGN KEY ("partRequestId") REFERENCES "part_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_items" ADD CONSTRAINT "issued_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_return_requests" ADD CONSTRAINT "part_return_requests_partRequestId_fkey" FOREIGN KEY ("partRequestId") REFERENCES "part_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_destWarehouseId_fkey" FOREIGN KEY ("destWarehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "running_invoices" ADD CONSTRAINT "running_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "running_invoices" ADD CONSTRAINT "running_invoices_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "running_invoice_lines" ADD CONSTRAINT "running_invoice_lines_runningInvoiceId_fkey" FOREIGN KEY ("runningInvoiceId") REFERENCES "running_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configuration" ADD CONSTRAINT "finance_configuration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_decision_requests" ADD CONSTRAINT "customer_decision_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_decision_requests" ADD CONSTRAINT "customer_decision_requests_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_decision_requests" ADD CONSTRAINT "customer_decision_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_decision_items" ADD CONSTRAINT "customer_decision_items_decisionRequestId_fkey" FOREIGN KEY ("decisionRequestId") REFERENCES "customer_decision_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_timeline_events" ADD CONSTRAINT "customer_timeline_events_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_timeline_events" ADD CONSTRAINT "customer_timeline_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safe_technical_history" ADD CONSTRAINT "safe_technical_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safe_technical_history" ADD CONSTRAINT "safe_technical_history_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_configuration" ADD CONSTRAINT "tenant_configuration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_configuration_versions" ADD CONSTRAINT "tenant_configuration_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_live_view_sessions" ADD CONSTRAINT "platform_live_view_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth quantity invariants (see docs/DATA_DICTIONARY.md).
-- Service-layer guards enforce these too; these constraints exist so a
-- bug or a raw query can never leave the database in an invalid state.
ALTER TABLE "warehouse_stock_balances"
  ADD CONSTRAINT "chk_available_qty_nonneg" CHECK ("availableQty" >= 0),
  ADD CONSTRAINT "chk_reserved_qty_nonneg" CHECK ("reservedQty" >= 0),
  ADD CONSTRAINT "chk_issued_qty_nonneg" CHECK ("issuedQty" >= 0),
  ADD CONSTRAINT "chk_return_pending_qty_nonneg" CHECK ("returnPendingQty" >= 0),
  ADD CONSTRAINT "chk_damaged_qty_nonneg" CHECK ("damagedQty" >= 0);

ALTER TABLE "invoices"
  ADD CONSTRAINT "chk_invoice_balance_nonneg" CHECK (balance >= 0);
