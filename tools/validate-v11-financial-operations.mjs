import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const checks = [];
const requireText = (file, patterns) => {
  const source = read(file);
  for (const pattern of patterns) checks.push({ pass: source.includes(pattern), message: `${file} contains ${pattern}` });
};

requireText("packages/database/prisma/schema.prisma", [
  "model SellableItem", "model PriceCatalogEntry", "model FinanceConfiguration",
  "model RunningInvoice", "model RunningInvoiceLine", "model DiscountRequest",
  "model RefundRequest", "model CreditNote", "model FinanceAuditEvent",
  "model InvoiceSequence", "immutableVersion", "catalogPriceSnapshot", "approvedPrice"
]);
requireText("apps/api/src/modules/finance/finance.service.ts", [
  "approvedPricesLocked", "A locked final invoice already exists",
  "credit note or refund", "Final invoice has not been issued.",
  "Invoice is unpaid.", "nextInvoiceNumber", "platformPolicy",
  "syncInventoryLine", "delivery.allowed_payment", "delivery.blocked_payment"
]);
requireText("apps/api/src/modules/finance/finance.controller.ts", [
  '@Controller("finance")', "finance.invoice.issue", "finance.payment.record",
  "finance.refund.request", "finance.reports.view"
]);
requireText("apps/api/src/modules/customer-decisions/customer-decisions.service.ts", [
  "priceLocked: approved", '"running_invoice.updated"', '"quote.approved"'
]);
requireText("apps/api/src/modules/technician/technician.service.ts", ["this.finance.syncInventoryLine", 'action: "used"']);
requireText("apps/api/src/modules/inventory/inventory.service.ts", ["this.finance.syncInventoryLine", 'action: "returned"']);
requireText("apps/api/src/modules/branch-manager/branch-manager.service.ts", ["financial.deliveryGate.reasons"]);
requireText("packages/shared/src/product-constants.ts", [
  '"pricing-catalog"', '"financial-configuration"', '"financial-dashboard"',
  '"invoices-payments"', '"discounts-refunds"', '"branch-invoices"', '"customer-finance"'
]);
requireText("apps/web/src/app/features/finance/finance.component.ts", [
  "Pricing Catalog", "Financial Configuration", "Financial Dashboard",
  "Record payment", "Platform read-only"
]);
requireText("packages/shared/src/operations.ts", [
  '"invoice.issued"', '"payment.recorded"', '"refund.requested"',
  '"delivery.blocked_payment"', 'action: "invoice.issue"'
]);

const failed = checks.filter((check) => !check.pass);
for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.message}`);
if (failed.length) {
  console.error(`\nV11 FINANCIAL OPERATIONS GATE: FAIL (${failed.length} checks)`);
  process.exit(1);
}
console.log(`\nV11 FINANCIAL OPERATIONS GATE: PASS (${checks.length} checks)`);
