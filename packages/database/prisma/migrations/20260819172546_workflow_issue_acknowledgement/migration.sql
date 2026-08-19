-- CreateEnum
CREATE TYPE "WorkflowIssueStatus" AS ENUM ('ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED');

-- CreateTable
CREATE TABLE "workflow_issue_acknowledgements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "WorkflowIssueStatus" NOT NULL DEFAULT 'ACKNOWLEDGED',
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_issue_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_issue_acknowledgements_tenantId_status_idx" ON "workflow_issue_acknowledgements"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_issue_acknowledgements_tenantId_fingerprint_key" ON "workflow_issue_acknowledgements"("tenantId", "fingerprint");

-- AddForeignKey
ALTER TABLE "workflow_issue_acknowledgements" ADD CONSTRAINT "workflow_issue_acknowledgements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
