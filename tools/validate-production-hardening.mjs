import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const checks = [];

function requireText(file, patterns, area) {
  const source = read(file);
  for (const pattern of patterns) {
    checks.push({
      area,
      pass: source.includes(pattern),
      message: `${file} contains ${pattern}`
    });
  }
}

function forbidText(file, patterns, area) {
  const source = read(file);
  for (const pattern of patterns) {
    checks.push({
      area,
      pass: !source.includes(pattern),
      message: `${file} excludes ${pattern}`
    });
  }
}

forbidText("apps/api/src/auth/auth.controller.ts", ["gateway-accounts", "gatewayAccounts"], "auth");
forbidText("apps/api/src/auth/auth.service.ts", ["MOP_DEMO_GATEWAY", "gatewayAccounts", "GatewayAccountDto", "dto.accountId"], "auth");
forbidText("apps/web/src/app/core/auth/auth.store.ts", ["gateway-accounts", "gatewayAccounts", "GatewayAccountDto"], "auth");
forbidText("apps/web/src/app/core/api/auth-api.service.ts", ["gateway-accounts", "gatewayAccounts", "GatewayAccountDto"], "auth");
forbidText("packages/shared/src/contracts.ts", ["GatewayAccountDto", "accountId?: string"], "auth");

requireText("apps/api/src/modules/customers/customers.service.ts", [
  "assetScope",
  "this.access.customerWhere(session)",
  "New asset owner not found in current scope.",
  "Asset ownership cannot move across branches without elevated scope.",
  "this.prisma.$transaction"
], "tenant-isolation");

requireText("apps/api/src/modules/customer-decisions/customer-decisions.service.ts", [
  "Decision link is not active.",
  "Decision request is not available for response.",
  "customerDecisionRequest.updateMany",
  "status: { in: [DecisionRequestStatus.SENT, DecisionRequestStatus.VIEWED] }",
  "Decision request is no longer available for response."
], "customer-decisions");

requireText("apps/api/src/operations/customer-safe-projection.service.ts", [
  "replace(/[\\u0000-\\u001f\\u007f]/g",
  "slice(0, 280)",
  "^[A-Za-z0-9\\s.,:;!?",
  "return unsafe.some((pattern) => pattern.test(normalized)) ? fallback : normalized;"
], "customer-safe-output");

requireText("apps/api/src/modules/finance/finance.controller.ts", [
  "@Post(\"discounts/:id/action\")",
  "finance.discount.approve",
  "discountAction"
], "finance");
requireText("apps/api/src/modules/finance/finance.service.ts", [
  "DiscountStatus",
  "idempotencyKey",
  "providerTransactionId",
  "this.isUniqueConflict(error)",
  "balance: { gte: amount }",
  "paid: { gte: amount }",
  "Invoice balance changed. Refresh before recording this payment.",
  "Invoice paid amount changed. Refresh before approving this refund.",
  "status: { notIn: [\"FINALIZING\", \"FINALIZED\"] }",
  "Final invoice is already being issued or has already been issued.",
  "async discountAction",
  "DiscountStatus.PENDING_APPROVAL",
  "DiscountStatus.APPROVED",
  "DiscountStatus.REJECTED",
  "this.recalculateRunning(request.runningInvoiceId, tx)"
], "finance");
requireText("packages/database/prisma/schema.prisma", [
  "idempotencyKey",
  "providerTransactionId",
  "@@unique([tenantId, idempotencyKey])",
  "@@unique([tenantId, providerTransactionId])",
  "workOrder WorkOrder? @relation(fields: [workOrderId], references: [id], onDelete: SetNull)",
  "payment Payment? @relation(fields: [paymentId], references: [id], onDelete: Restrict)",
  "workOrder      WorkOrder       @relation(fields: [workOrderId], references: [id], onDelete: Cascade)",
  "runningInvoice RunningInvoice? @relation(fields: [runningInvoiceId], references: [id], onDelete: SetNull)"
], "finance-schema");

requireText("apps/api/src/auth/auth.service.ts", [
  "SCRYPT_PARAMS",
  "scrypt2",
  "DUMMY_PASSWORD_HASH",
  "LOGIN_LOCK_THRESHOLD",
  "recordFailedLogin",
  "failedLoginAttempts: 0",
  "lockedUntil: null",
  "userAgent: meta.userAgent || null",
  "ipAddress: meta.ipAddress || null"
], "auth");
requireText("packages/database/prisma/schema.prisma", [
  "failedLoginAttempts Int",
  "lockedUntil     DateTime?"
], "auth-schema");

requireText("apps/api/src/modules/inventory/inventory.service.ts", [
  "warehouseStockBalance.updateMany",
  "availableQty: { gte: qty }",
  "Stock changed while issuing this request. Please retry."
], "inventory");
requireText("apps/api/src/modules/technician/technician.service.ts", [
  "private async applyFinishGate",
  "status: \"finish_blocked\"",
  "PartRequestStatus.PENDING_WAREHOUSE",
  "warehouseStockBalance.updateMany",
  "inventoryItem.updateMany",
  "\"task.sent_to_qc\": \"task.complete\"",
  "\"inspection.saved\": \"inspection.submit\""
], "technician");

requireText("tools/validate-release-candidate.mjs", [
  "tools/validate-english-only.mjs",
  "tools/validate-production-hardening.mjs"
], "release-gates");

const failed = checks.filter((check) => !check.pass);
for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} [${check.area}] ${check.message}`);
if (failed.length) {
  console.error(`PRODUCTION HARDENING GATE: FAIL (${failed.length}/${checks.length} failed)`);
  process.exit(1);
}
console.log(`PRODUCTION HARDENING GATE: PASS (${checks.length}/${checks.length})`);
