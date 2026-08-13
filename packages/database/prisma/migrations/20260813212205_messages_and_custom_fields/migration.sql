-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formKey" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "options" JSONB,
    "categoryScope" "CategoryCode"[],
    "roleScope" TEXT[],
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_templates_tenantId_templateKey_idx" ON "message_templates"("tenantId", "templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_tenantId_templateKey_version_key" ON "message_templates"("tenantId", "templateKey", "version");

-- CreateIndex
CREATE INDEX "custom_field_definitions_tenantId_formKey_isArchived_idx" ON "custom_field_definitions"("tenantId", "formKey", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_tenantId_formKey_fieldKey_key" ON "custom_field_definitions"("tenantId", "formKey", "fieldKey");

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
