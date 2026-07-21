export type SellableItemType = "inspection" | "service" | "labor" | "part" | "package" | "extra_fee";
export type FinancialLineStatus =
  | "draft"
  | "pending_customer_approval"
  | "approved"
  | "rejected"
  | "added_to_work_order"
  | "used"
  | "completed"
  | "removed"
  | "returned"
  | "finalized"
  | "refunded";

export interface SellableItemDto {
  id: string;
  inventoryItemId?: string;
  type: SellableItemType;
  name: string;
  description?: string;
  category?: string;
  basePrice: number;
  effectivePrice: number;
  branchId?: string;
  taxable: boolean;
  approvalRequired: boolean;
  technicianCanAdd: boolean;
  branchManagerCanDiscount: boolean;
  customerVisible: boolean;
  active: boolean;
}

export interface FinanceConfigurationDto {
  currency: string;
  taxEnabled: boolean;
  taxRate: number;
  invoiceNumberPattern: string;
  invoiceTerms?: string;
  paymentMethods: string[];
  depositAllowed: boolean;
  maxBranchDiscountPercent: number;
  discountApprovalThreshold: number;
  allowUnpaidDelivery: boolean;
  allowPartialPaidDelivery: boolean;
  customerInvoiceVisible: boolean;
  technicianPriceVisible: boolean;
  inventoryPriceEditable: boolean;
  platform: {
    financeEnabled: boolean;
    invoiceGenerationEnabled: boolean;
    paymentRecordingEnabled: boolean;
    refundsEnabled: boolean;
    reportsEnabled: boolean;
    exportEnabled: boolean;
    forceReadOnly: boolean;
    deliveryOverrideAllowed: boolean;
  };
}

export interface FinanceLineDto {
  id: string;
  sourceType: string;
  sourceId?: string;
  sellableItemId?: string;
  title: string;
  lineType: SellableItemType;
  quantity: number;
  unitPrice: number;
  laborPrice: number;
  discount: number;
  taxAmount: number;
  total: number;
  status: FinancialLineStatus;
  priceLocked: boolean;
}

export interface RunningInvoiceDto {
  id: string;
  workOrderId: string;
  workOrderNumber?: string;
  customerId: string;
  customerName?: string;
  branchId?: string;
  currency: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  remaining: number;
  version: number;
  lines: FinanceLineDto[];
}

export interface FinalInvoiceDto {
  id: string;
  number: string;
  workOrderId: string;
  workOrderNumber?: string;
  customerId: string;
  customerName?: string;
  branchId?: string;
  status: string;
  locked: boolean;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  terms?: string;
  issuedAt?: string;
  dueAt?: string;
  lines: FinanceLineDto[];
}

export interface FinanceWorkOrderDto {
  workOrder: {
    id: string;
    number: string;
    status: string;
    customerName: string;
    assetName: string;
    branchId?: string;
  };
  runningInvoice: RunningInvoiceDto;
  finalInvoice?: FinalInvoiceDto;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    reference?: string;
    status: string;
    receivedAt: string;
  }>;
  deliveryGate: {
    allowed: boolean;
    invoiceIssued: boolean;
    fullyPaid: boolean;
    reasons: string[];
  };
}

export interface FinanceDashboardDto {
  currency: string;
  todayRevenue: number;
  monthRevenue: number;
  unpaidInvoices: number;
  partialPayments: number;
  overdueAmount: number;
  averageInvoiceValue: number;
  refunds: number;
  discountsGiven: number;
  branchRevenue: Array<{ branchId: string; branchName: string; amount: number }>;
  paymentMethods: Array<{ method: string; amount: number }>;
  recentInvoices: FinalInvoiceDto[];
}

export const financePermissionCodes = [
  "finance.catalog.view",
  "finance.catalog.manage",
  "finance.configuration.view",
  "finance.configuration.manage",
  "finance.invoice.view",
  "finance.invoice.issue",
  "finance.payment.view",
  "finance.payment.record",
  "finance.discount.apply",
  "finance.discount.approve",
  "finance.refund.request",
  "finance.refund.approve",
  "finance.reports.view",
  "finance.export",
  "finance.cost.view",
  "finance.margin.view"
] as const;

export const financeOperationEvents = [
  "price_catalog.item_created",
  "price_catalog.price_changed",
  "quote.created",
  "quote.sent_to_customer",
  "quote.approved",
  "quote.rejected",
  "running_invoice.updated",
  "invoice.ready",
  "invoice.issued",
  "payment.recorded",
  "payment.failed",
  "payment.cancelled",
  "discount.applied",
  "discount.approval_requested",
  "refund.requested",
  "refund.approved",
  "refund.paid",
  "delivery.blocked_payment",
  "delivery.allowed_payment"
] as const;
