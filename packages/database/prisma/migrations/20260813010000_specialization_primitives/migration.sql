-- Phase 15: five specialization primitives (service card / measurement
-- form via SpecializationDefinition+Entry, position taxonomy, credentials,
-- blocker-reason definitions). See docs/phases/PHASE_15.md.

-- CreateEnum
CREATE TYPE "SpecializationKind" AS ENUM ('SERVICE_CARD', 'MEASUREMENT_FORM');

-- CreateEnum
CREATE TYPE "SpecializationFieldType" AS ENUM ('TEXT', 'DECIMAL', 'ENUM', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "BlockerBehavior" AS ENUM ('PAUSE_CLOCK', 'ESCALATE', 'NOTIFY', 'NONE');

-- CreateTable
CREATE TABLE "specialization_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" "CategoryCode" NOT NULL,
    "kind" "SpecializationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialization_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialization_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "workOrderId" TEXT,
    "taskId" TEXT,
    "values" JSONB NOT NULL,
    "filledById" TEXT NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialization_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_taxonomy_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "category" "CategoryCode" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "position_taxonomy_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" "CategoryCode",
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "credentialDefinitionId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "staff_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocker_reason_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "behavior" "BlockerBehavior" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "blocker_reason_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "specialization_definitions_tenantId_category_kind_idx" ON "specialization_definitions"("tenantId", "category", "kind");

-- CreateIndex
CREATE INDEX "specialization_entries_tenantId_definitionId_idx" ON "specialization_entries"("tenantId", "definitionId");

-- CreateIndex
CREATE INDEX "specialization_entries_workOrderId_idx" ON "specialization_entries"("workOrderId");

-- CreateIndex
CREATE INDEX "position_taxonomy_entries_category_idx" ON "position_taxonomy_entries"("category");

-- CreateIndex
CREATE UNIQUE INDEX "position_taxonomy_entries_tenantId_category_code_key" ON "position_taxonomy_entries"("tenantId", "category", "code");

-- CreateIndex
CREATE INDEX "credential_definitions_tenantId_idx" ON "credential_definitions"("tenantId");

-- CreateIndex
CREATE INDEX "staff_credentials_staffUserId_idx" ON "staff_credentials"("staffUserId");

-- CreateIndex
CREATE INDEX "staff_credentials_credentialDefinitionId_idx" ON "staff_credentials"("credentialDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "blocker_reason_definitions_tenantId_code_key" ON "blocker_reason_definitions"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "specialization_entries" ADD CONSTRAINT "specialization_entries_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "specialization_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_credentials" ADD CONSTRAINT "staff_credentials_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_credentials" ADD CONSTRAINT "staff_credentials_credentialDefinitionId_fkey" FOREIGN KEY ("credentialDefinitionId") REFERENCES "credential_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

