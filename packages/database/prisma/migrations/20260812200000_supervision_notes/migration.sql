-- CreateTable
CREATE TABLE "supervision_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervision_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supervision_notes_tenantId_technicianId_idx" ON "supervision_notes"("tenantId", "technicianId");

