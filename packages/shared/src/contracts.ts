export type AccountType = "platform" | "tenant_staff" | "customer" | "system";
export type CategoryCode = "Cars" | "Motorcycles" | "Heavy Equipment";
export type PortalStatus = "enabled" | "disabled" | "invited";
export type CustomerDecisionStatus = "draft" | "sent" | "viewed" | "responded" | "expired" | "cancelled";
export type CustomerDecisionItemStatus = "pending" | "approved" | "rejected";
export type CustomerDecisionImportance = "normal" | "medium" | "high" | "critical";

export interface LoginRequestDto {
  loginIdentifier?: string;
  workshopCode?: string;
  password?: string;
}

export interface CustomerRegisterDto {
  workshopCode: string;
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  branchId?: string;
  communicationConsent?: boolean;
}

export interface CustomerRegistrationResultDto extends LoginResponseDto {
  registration: {
    customerId: string;
    tenantId: string;
    workshopName: string;
  };
}

export interface InvitationInfoDto {
  valid: boolean;
  accountType?: "owner" | "staff";
  displayName?: string;
  workshopName?: string;
  expiresAt?: string;
}

export interface AcceptInvitationDto {
  token: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  session: SessionContextDto;
}

export interface SessionContextDto {
  sessionId: string;
  accountId: string;
  accountType: AccountType;
  tenantId?: string;
  tenantName?: string;
  userId?: string;
  customerId?: string;
  displayName: string;
  landingPage: string;
  roleId: string;
  roleLabel: string;
  branchScope: string[];
  warehouseScope: string[];
  categoryScope: CategoryCode[];
  teamScope: string[];
  managedTechnicianIds: string[];
  permissionTemplateId?: string;
  userOverrides: Record<string, boolean>;
  effectivePermissionSources: Record<string, string>;
  enabledModules: string[];
  enabledFeatures: string[];
  builderConfigVersion?: string;
  tenantStatus?: string;
  readOnly: boolean;
  linkedAssetIds: string[];
  customerPortalStatus?: PortalStatus;
  liveViewMode?: "read_only";
  allowedControlScopes: string[];
  supportAccessMode: "none" | "live_view_read_only";
  permissions: string[];
  navigation: NavigationItemDto[];
  workspace: WorkspaceDto;
}

export interface NavigationItemDto {
  id: string;
  label: string;
  allowed: boolean;
  deniedReason?: string;
}

export interface WorkspaceDto {
  type: "platform" | "tenant" | "branch" | "warehouse" | "customer_asset";
  label: string;
  category?: CategoryCode;
  categoryScope: CategoryCode[];
  branchIds: string[];
  warehouseIds: string[];
  assetId?: string;
}

export interface StaffUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  status: string;
  branchScope: string[];
  warehouseScope: string[];
  categoryScope: CategoryCode[];
  teamScope: string[];
  managedTechnicianIds: string[];
  permissionTemplateId?: string;
}

export interface CreateStaffUserDto {
  name: string;
  email: string;
  password?: string;
  role: "tenant_admin" | "branch_manager" | "technician" | "inventory_manager" | "team_leader" | "data_analyst";
  branchScope?: string[];
  warehouseScope?: string[];
  categoryScope?: CategoryCode[];
  teamScope?: string[];
  managedTechnicianIds?: string[];
  permissionTemplateId: string;
  status?: "active" | "invited";
}

export interface CustomerDto {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  portalStatus: PortalStatus;
  assetCount: number;
  branchName?: string;
}

export interface AssetDto {
  id: string;
  name: string;
  category: CategoryCode;
  primaryIdentifier: string;
  currentOwnerCustomerId: string;
}

export interface WorkOrderDto {
  id: string;
  number: string;
  category: CategoryCode;
  status: string;
  statusLabel: string;
  priority: string;
  assetName: string;
  identifier: string;
  customerName: string;
  branchName: string;
  total: number;
  paid: number;
  balance: number;
  customerSummary?: string;
}

export type BranchWorkOrderGroup =
  | "registered"
  | "under_inspection"
  | "waiting_customer"
  | "approved_for_work"
  | "in_progress"
  | "waiting_parts"
  | "blocked"
  | "ready_team_review"
  | "ready_qc"
  | "qc_failed"
  | "ready_delivery"
  | "payment_pending"
  | "closed"
  | "cancelled";

export type BranchAttentionTone = "neutral" | "blue" | "green" | "gold" | "red";

export interface BranchAttentionCardDto {
  id: string;
  label: string;
  count: number;
  overdue?: number;
  critical?: number;
  tone: BranchAttentionTone;
  route: string;
  filter?: BranchWorkOrderGroup | "decisions" | "delivery";
  nextAction: string;
}

export interface BranchWorkOrderCardDto {
  id: string;
  number: string;
  customerName: string;
  customerPhone?: string;
  assetName: string;
  assetIdentifier: string;
  category: CategoryCode;
  branchName: string;
  status: string;
  statusLabel: string;
  group: BranchWorkOrderGroup;
  priority: "low" | "normal" | "high" | "critical";
  assignedTechnicianNames: string[];
  customerDecisionState: "none" | "draft" | "waiting" | "responded" | "critical_rejected";
  partsState: "none" | "waiting_manager" | "on_the_way" | "arrived" | "received" | "used" | "return_pending" | "returned" | "rejected" | "unavailable";
  paymentState: "not_started" | "pending" | "partial" | "paid";
  deliveryState: "blocked" | "ready" | "delivered";
  nextAction: string;
  updatedAt: string;
}

export interface BranchTechnicianLoadDto {
  technicianId: string;
  technicianName: string;
  activeJobs: number;
  blockedJobs: number;
  waitingParts: number;
}

export interface BranchManagerHomeDto {
  branchNames: string[];
  attentionCards: BranchAttentionCardDto[];
  technicianLoad: BranchTechnicianLoadDto[];
  urgentWorkOrders: BranchWorkOrderCardDto[];
  recentActivity: Array<{ id: string; action: string; actorName: string; targetType: string; targetId?: string; reason?: string; at: string }>;
}

export interface BranchCustomerOptionDto {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  portalStatus: PortalStatus;
}

export interface BranchAssetOptionDto {
  id: string;
  name: string;
  category: CategoryCode;
  primaryIdentifier: string;
  ownerCustomerId: string;
  ownerName: string;
}

export interface BranchStaffOptionDto {
  id: string;
  name: string;
  role: string;
  activeJobs: number;
}

export interface BranchIntakeOptionsDto {
  branches: Array<{ id: string; name: string }>;
  customers: BranchCustomerOptionDto[];
  assets: BranchAssetOptionDto[];
  technicians: BranchStaffOptionDto[];
  communicationPreferences: string[];
}

export interface BranchIntakeCreateDto {
  branchId?: string;
  customer: {
    mode: "existing" | "new";
    customerId?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    communicationConsent?: boolean;
    preferredContact?: string;
  };
  asset: {
    mode: "existing" | "new";
    assetId?: string;
    name?: string;
    category?: CategoryCode;
    primaryIdentifier?: string;
    ownershipTransfer?: boolean;
  };
  workOrder: {
    complaint: string;
    priority: "low" | "normal" | "high" | "critical";
  };
  assignment?: {
    technicianId?: string;
  };
  communication?: {
    portalInvite?: boolean;
    preference?: string;
  };
}

export interface BranchIntakeResultDto {
  customerId: string;
  assetId: string;
  workOrderId: string;
  workOrderNumber: string;
  assignedTechnicianId?: string;
  portalInvited: boolean;
}

export interface BranchWorkOrdersBoardDto {
  groups: Array<{ id: BranchWorkOrderGroup; label: string; count: number; workOrders: BranchWorkOrderCardDto[] }>;
}

export interface BranchWorkspaceDto {
  workOrder: BranchWorkOrderCardDto;
  customer: { id: string; fullName: string; phone: string; email?: string; preferredContact: string; portalStatus: PortalStatus };
  asset: { id: string; name: string; category: CategoryCode; primaryIdentifier: string; ownershipWarning?: string };
  assignedTeam: BranchStaffOptionDto[];
  availableTechnicians: BranchStaffOptionDto[];
  technicianActivity: Array<{ taskId: string; title: string; status: string; severity: string; assignedTechnicians: string[]; blockersOpen: number }>;
  customerDecisions: CustomerDecisionRequestDto[];
  parts: Array<{ requestId: string; itemName: string; qty: number; status: string; warehouseName?: string; technicianName?: string; reason?: string }>;
  blockers: Array<{ id: string; taskTitle: string; reason: string; createdAt: string; resolved: boolean }>;
  qc: { teamLeaderReview: "on" | "off"; state: "not_ready" | "awaiting_review" | "ready_qc" | "qc_failed" | "rework" };
  paymentDelivery: BranchDeliveryRowDto;
  timeline: CustomerTimelineEventDto[];
  allowedActions: string[];
}

export interface BranchDecisionQueueDto {
  pending: number;
  overdue: number;
  criticalRejected: number;
  decisions: Array<CustomerDecisionRequestDto & { overdue: boolean; pendingItems: number; approvedItems: number; rejectedItems: number; criticalRejected: boolean; nextAction: string }>;
}

export interface BranchDeliveryRowDto {
  workOrderId: string;
  workOrderNumber: string;
  customerName: string;
  assetName: string;
  assetIdentifier: string;
  statusLabel: string;
  paymentState: "not_started" | "pending" | "partial" | "paid";
  invoiceStatus: string;
  paidAmount: number;
  remainingAmount: number;
  deliveryAllowed: boolean;
  deliveryBlockedReasons: string[];
  customerNotified: boolean;
  handoverChecklist: Array<{ label: string; ok: boolean }>;
}

export interface BranchDeliveryStatusDto {
  readyForDelivery: number;
  paymentPending: number;
  blocked: number;
  rows: BranchDeliveryRowDto[];
}

export interface InventoryItemDto {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  type?: string;
  category: string;
  subCategory?: string;
  compatibleCategories: CategoryCode[];
  imageUrl?: string;
  warehouseId?: string;
  warehouseName: string;
  stock: number;
  minStock: number;
  criticalStock?: number;
  status: string;
  price: number;
  cost?: number;
  posVisible?: boolean;
  workOrderUsable?: boolean;
  stockTracked?: boolean;
}

export type PartRequestContractStatus =
  | "draft"
  | "requested"
  | "pending_warehouse"
  | "approved"
  | "issued"
  | "in_transit"
  | "arrived"
  | "received_by_technician"
  | "return_requested"
  | "return_accepted"
  | "returned_to_stock"
  | "return_rejected"
  | "rejected"
  | "unavailable"
  | "waiting_transfer"
  | "waiting_supplier"
  | "used"
  | "cancelled";

export interface TechnicianPartRequestContractDto {
  request_id: string;
  work_order_id: string;
  task_id: string;
  technician_id: string;
  branch_id?: string;
  category: CategoryCode;
  asset_identifier: string;
  item_id: string;
  item_name: string;
  qty: number;
  urgency: "normal" | "high" | "critical";
  reason: string;
  status: PartRequestContractStatus;
  requested_at: string;
}

export interface TechnicianPartRequestDto {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  qty: number;
  status: "pending" | "approved" | "on_the_way" | "arrived" | "received" | "used" | "return_pending" | "returned" | "rejected" | "unavailable" | "waiting_supplier" | "waiting_transfer";
  inventoryStatus: string;
  requestedAt: string;
  warehouseName?: string;
  urgency: "normal" | "high" | "critical";
  reason?: string;
}

export interface TechnicianIssuedPartDto {
  id: string;
  requestId: string;
  itemId: string;
  itemName: string;
  qty: number;
  status: "on_the_way" | "arrived" | "received" | "used" | "return_pending" | "returned";
  issuedAt: string;
  warehouseName: string;
}

export interface TechnicianReturnRequestDto {
  id: string;
  issuedItemId: string;
  itemName: string;
  qty: number;
  reason: string;
  condition: string;
  status: "return_pending" | "returned" | "damaged" | "rejected";
  createdAt: string;
}

export interface InventoryHomeDto {
  counts: {
    pendingTechnicianRequests: number;
    itemsToDispatch: number;
    waitingTechnicianArrival: number;
    returnRequests: number;
    lowStock: number;
    criticalStock: number;
    outOfStock: number;
    todayMovements: number;
  };
  fastMovingItems: Array<{ itemName: string; qtyUsed: number; category: string }>;
}

export interface InventoryTechnicianRequestDto {
  id: string;
  workOrderNumber: string;
  taskTitle?: string;
  technicianName?: string;
  assetName: string;
  assetIdentifier: string;
  category: CategoryCode;
  branchName?: string;
  itemId: string;
  itemName: string;
  sku: string;
  qty: number;
  urgency: "normal" | "high" | "critical";
  reason?: string;
  availability: "available" | "low" | "out_of_stock" | "available_other_warehouse";
  status: string;
  requestedAt: string;
  availableWarehouses: Array<{ warehouseId: string; warehouseName: string; availableQty: number; accessType?: string }>;
}

export interface InventoryStockStatusDto {
  itemId: string;
  itemName: string;
  sku: string;
  category: string;
  subCategory?: string;
  compatibleCategories: CategoryCode[];
  totalAvailable: number;
  issuedToTechnicians: number;
  waitingReturn: number;
  damaged: number;
  lowThreshold: number;
  criticalThreshold: number;
  status: "healthy" | "low" | "critical" | "out_of_stock";
  warehouseBalances: Array<{ warehouseId: string; warehouseName: string; available: number; issued: number; returnPending: number; damaged: number }>;
}

export interface InventoryMovementDto {
  id: string;
  itemName: string;
  movementType: string;
  qty: number;
  beforeQty?: number;
  afterQty?: number;
  warehouseName: string;
  workOrderNumber?: string;
  technicianName?: string;
  inventoryManagerName?: string;
  reason?: string;
  createdAt: string;
}

export interface InventoryReturnRequestDto {
  id: string;
  technicianName?: string;
  workOrderId: string;
  taskId?: string;
  itemName: string;
  qty: number;
  reason: string;
  condition: string;
  status: string;
  createdAt: string;
}

export interface InventoryReportsDto {
  usageByItem: Array<{ itemName: string; category: string; subCategory?: string; qtyUsed: number; linkedWorkOrders: number }>;
  stockRisk: Array<{ itemName: string; currentStock: number; pendingRequests: number; risk: "low" | "critical" | "out_of_stock" }>;
  returns: Array<{ itemName: string; returnedQty: number; reason: string; condition: string }>;
  technicianRequests: Array<{ technicianName: string; requests: number; approved: number; rejected: number; unavailable: number; returned: number }>;
  categoryUsage: Array<{ category: CategoryCode; qtyUsed: number; lowStockItems: number; returns: number }>;
}

export interface AuditLogDto {
  id: string;
  actorName: string;
  actorType: AccountType | "system";
  action: string;
  targetType: string;
  targetId?: string;
  reason?: string;
  at: string;
}

export interface CustomerDecisionItemDto {
  id: string;
  title: string;
  customerExplanation: string;
  importance: CustomerDecisionImportance;
  estimatedPrice: number;
  quantity: number;
  unitPrice: number;
  laborPrice: number;
  estimatedTotal: number;
  priceLocked: boolean;
  decisionRequired: boolean;
  criticalWarningRequired: boolean;
  criticalWarningText?: string;
  decisionStatus: CustomerDecisionItemStatus;
  warningAcknowledged: boolean;
  customerDecisionNote?: string;
}

export interface CustomerDecisionRequestDto {
  id: string;
  status: CustomerDecisionStatus;
  workOrderNumber: string;
  assetName: string;
  assetIdentifier: string;
  customerName: string;
  branchName: string;
  createdByName?: string;
  whatsappMessage?: string;
  secureLink?: string;
  customerNote?: string;
  sentAt?: string;
  respondedAt?: string;
  expiresAt: string;
  items: CustomerDecisionItemDto[];
}

export interface CreateDecisionRequestItemDto {
  title: string;
  customerExplanation: string;
  importance: CustomerDecisionImportance;
  estimatedPrice: number;
  quantity?: number;
  unitPrice?: number;
  laborPrice?: number;
  criticalWarningRequired?: boolean;
  criticalWarningText?: string;
}

export interface CreateDecisionRequestDto {
  workOrderId: string;
  taskId?: string;
  source?: "technician_task" | "inspection_finding" | "work_order";
  items: CreateDecisionRequestItemDto[];
}

export interface SubmitDecisionItemDto {
  itemId: string;
  decision: "approved" | "rejected";
  warningAcknowledged?: boolean;
  note?: string;
}

export interface SubmitCustomerDecisionDto {
  customerNote?: string;
  decisions: SubmitDecisionItemDto[];
}

export interface CustomerDecisionPublicDto {
  id: string;
  status: CustomerDecisionStatus;
  tenantName: string;
  branchName: string;
  workOrderNumber: string;
  assetName: string;
  assetIdentifier: string;
  customerName: string;
  expiresAt: string;
  items: CustomerDecisionItemDto[];
}

export interface CustomerTimelineEventDto {
  id: string;
  title: string;
  message: string;
  source: string;
  occurredAt: string;
  decisionRequest?: CustomerDecisionRequestDto;
}

export type TechnicianJobGroup =
  | "active_now"
  | "due_today"
  | "waiting_customer"
  | "waiting_parts"
  | "blocked"
  | "returned_for_rework"
  | "completed_today";

export interface TechnicianJobCardDto {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  taskId: string;
  assetName: string;
  assetIdentifier: string;
  category: CategoryCode;
  categoryIcon: string;
  taskTitle: string;
  customerComplaint: string;
  status: string;
  statusTone: "green" | "red" | "orange" | "blue" | "gray";
  nextAction: string;
  priority: "low" | "normal" | "high" | "critical";
  assignedTechnicianNames: string[];
  customerDecisionState: "none" | "draft" | "waiting" | "responded" | "critical_rejected";
  partsState: "none" | "waiting_manager" | "on_the_way" | "arrived" | "received" | "used" | "return_pending" | "returned" | "rejected" | "unavailable";
  blockerState: "none" | "open" | "critical";
  group: TechnicianJobGroup;
}

export interface TechnicianHomeDto {
  currentJob?: TechnicianJobCardDto;
  counts: {
    todayJobs: number;
    waitingCustomer: number;
    waitingParts: number;
    partsOnTheWay: number;
    partsArrived: number;
    returnsPending: number;
    rework: number;
    blocked: number;
  };
  quickServices: QuickServiceOptionDto[];
}

export interface TechnicianMyWorkDto {
  groups: Array<{
    id: TechnicianJobGroup;
    label: string;
    jobs: TechnicianJobCardDto[];
  }>;
}

export interface QuickServiceOptionDto {
  id: string;
  label: string;
  category: CategoryCode;
  icon: string;
  estimatedTime: string;
  inspectionPolicy: "skip_allowed" | "optional" | "required";
  suggestedPart?: string;
}

export interface DiagnosticCodeSuggestionDto {
  code: string;
  system: string;
  possibleIssue: string;
  suggestedChecks: string[];
  suggestedFix: string;
  videoLink: string;
}

export interface TechnicianWorkCardDto {
  job: TechnicianJobCardDto;
  quickServices: QuickServiceOptionDto[];
  suggestedParts: InventoryItemDto[];
  partRequests: TechnicianPartRequestDto[];
  issuedParts: TechnicianIssuedPartDto[];
  returnRequests: TechnicianReturnRequestDto[];
  pendingDecisions: CustomerDecisionRequestDto[];
  diagnosticCodes: DiagnosticCodeSuggestionDto[];
  blockers: Array<{
    id: string;
    reason: string;
    urgency: "normal" | "high" | "critical";
    resolved: boolean;
  }>;
  history: CustomerTimelineEventDto[];
  reworkFeedback: Array<{
    returnedBy: string;
    returnedDate: string;
    reason: string;
    requiredCorrection: string;
  }>;
  finishChecks: {
    partsUsed: boolean;
    partRequestsPending: boolean;
    issuedPartsNotReceived: boolean;
    receivedPartsNotResolved: boolean;
    returnPendingInventoryReview: boolean;
    customerDecisionsPending: boolean;
    blockersOpen: boolean;
    inspectionRequiredDone: boolean;
    criticalRejectedItemExists: boolean;
    requiredNotesCompleted: boolean;
    timeTrackingCompleted: boolean;
  };
  finishOutcome: "team_review" | "qc";
}
