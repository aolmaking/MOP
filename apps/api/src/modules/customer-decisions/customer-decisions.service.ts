import { randomBytes } from "node:crypto";
import { BadRequestException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditActorType,
  DecisionChannel,
  DecisionImportance,
  DecisionItemStatus,
  DecisionRequestStatus,
  DecisionSource,
  FinancialLineStatus,
  SellableItemType,
  TimelineVisibility,
  WorkOrderStatus
} from "@prisma/client";
import type {
  CreateDecisionRequestDto,
  CustomerDecisionItemDto,
  CustomerDecisionPublicDto,
  CustomerDecisionRequestDto,
  CustomerTimelineEventDto,
  SubmitCustomerDecisionDto
} from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { PrismaService } from "../../database/prisma.service";
import { OperationEventsService } from "../../operations/operation-events.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

type DecisionRequestRow = Awaited<ReturnType<CustomerDecisionsService["findDecisionForMapping"]>>;

@Injectable()
export class CustomerDecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationEvents: OperationEventsService
  ) {}

  async list(session: RequestSessionContext): Promise<CustomerDecisionRequestDto[]> {
    const rows = await this.prisma.customerDecisionRequest.findMany({
      where: this.access.decisionRequestWhere(session),
      include: this.includeGraph(),
      orderBy: { updatedAt: "desc" }
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(session: RequestSessionContext, body: CreateDecisionRequestDto): Promise<CustomerDecisionRequestDto> {
    if (!body.workOrderId) throw new BadRequestException("workOrderId is required.");
    if (!body.items?.length) throw new BadRequestException("At least one decision item is required.");

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: body.workOrderId, ...this.access.workOrderWhere(session) },
      include: { asset: true, customer: true, branch: true }
    });
    if (!workOrder) throw new NotFoundException("Work order not found in current scope.");

    const token = randomBytes(18).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48);
    const source = this.source(body.source);
    const sanitizedItems = body.items.map((item, index) => {
      if (!item.title?.trim()) throw new BadRequestException("Every item must have a customer-facing title.");
      if (!item.customerExplanation?.trim()) throw new BadRequestException("Every item must have a customer-facing explanation.");
      const importance = this.importance(item.importance);
      const critical = importance === DecisionImportance.CRITICAL || Boolean(item.criticalWarningRequired);
      if (critical && !item.criticalWarningText?.trim()) {
        throw new BadRequestException("Critical items require a customer-safe warning message.");
      }
      return {
        title: item.title.trim(),
        customerExplanation: item.customerExplanation.trim(),
        importance,
        estimatedPrice: item.estimatedPrice || 0,
        quantity: Math.max(1, Number(item.quantity || 1)),
        unitPrice: Number(item.unitPrice ?? item.estimatedPrice ?? 0),
        laborPrice: Number(item.laborPrice || 0),
        estimatedTotal: Number(item.estimatedPrice ?? (Number(item.unitPrice || 0) * Math.max(1, Number(item.quantity || 1)) + Number(item.laborPrice || 0))),
        criticalWarningRequired: critical,
        criticalWarningText: critical ? item.criticalWarningText?.trim() : null,
        sortOrder: index + 1
      };
    });

    const secureLink = this.secureLink(token);
    const whatsappMessage = this.whatsappMessage({
      customerName: workOrder.customer.fullName,
      assetName: workOrder.asset.name,
      identifier: workOrder.asset.primaryIdentifier,
      tenantName: session.tenantName || "MOP Service Center",
      secureLink,
      items: sanitizedItems
    });

    const row = await this.prisma.customerDecisionRequest.create({
      data: {
        tenantId: workOrder.tenantId,
        workOrderId: workOrder.id,
        taskId: body.taskId || null,
        assetId: workOrder.assetId,
        customerId: workOrder.customerId,
        createdByStaffUserId: session.userId,
        source,
        decisionToken: token,
        secureLink,
        whatsappMessage,
        expiresAt,
        items: { create: sanitizedItems }
      },
      include: this.includeGraph()
    });
    await this.audit(session, "customer_decision.created", row.id, "Customer decision request prepared.");
    return this.toDto(row);
  }

  async send(session: RequestSessionContext, id: string): Promise<CustomerDecisionRequestDto> {
    const existing = await this.findScoped(session, id);
    if (!existing) throw new NotFoundException("Decision request not found in current scope.");
    if (!existing.items.length) throw new BadRequestException("Decision request has no items.");

    const row = await this.prisma.customerDecisionRequest.update({
      where: { id },
      data: {
        status: DecisionRequestStatus.SENT,
        sentAt: new Date(),
        channelEntry: DecisionChannel.WHATSAPP_LINK
      },
      include: this.includeGraph()
    });

    await this.prisma.workOrder.update({
      where: { id: row.workOrderId },
      data: {
        status: WorkOrderStatus.AWAITING_CUSTOMER_APPROVAL,
        statusLabel: "Waiting for Customer Decision",
        customerVisible: true,
        customerSummary: "A service decision request was sent. Please open the secure link from WhatsApp."
      }
    });

    await this.timeline(row, "Decision request sent", "We sent a secure link for your service decision.", "customer_decision.sent");
    await this.audit(session, "customer_decision.sent", row.id, "WhatsApp message generated with secure MOP decision link.");
    await this.operationEvents.emitFromSession(session, {
      eventKey: "customer_decision.requested",
      tenantId: row.tenantId,
      branchId: row.workOrder.branchId || undefined,
      workOrderId: row.workOrderId,
      taskId: row.taskId || undefined,
      customerId: row.customerId,
      assetId: row.assetId,
      statusChanges: [
        { entityType: "customer_decision", entityId: row.id, fromStatus: existing.status, toStatus: "SENT", label: "Customer decision sent" },
        { entityType: "work_order", entityId: row.workOrderId, toStatus: "AWAITING_CUSTOMER_APPROVAL", label: "Waiting for Customer Decision" }
      ],
      notificationTargets: ["customer", "technician", "branch_manager", "team_leader", "reports_engine"],
      pageUpdates: ["customer", "work-card", "branch-decisions", "branch-workspace", "team-review", "analytics-operations"],
      reportHooks: [
        { reportKey: "reports.team.customer_decisions.view", metric: "decision_sent", delta: 1, scope: ["team", "branch"] },
        { reportKey: "reports.branch.operations.view", metric: "waiting_customer", delta: 1, scope: ["branch"] }
      ],
      auditAction: "customer_decision.sent",
      canUndo: true,
      customerSafeOutput: {
        title: "Decision request sent",
        message: "We sent a secure link for your service decision.",
        source: "customer_decision.sent",
        customerId: row.customerId,
        assetId: row.assetId,
        workOrderId: row.workOrderId
      },
      payload: {
        decision_request_id: row.id,
        secure_link_ready: Boolean(row.secureLink),
        customerTimelineAlreadyWritten: true
      },
      reason: "WhatsApp message generated with secure MOP decision link.",
      targetType: "customer_decision_request",
      targetId: row.id
    });
    return this.toDto(row);
  }

  async publicDecision(token: string): Promise<CustomerDecisionPublicDto> {
    let row = await this.prisma.customerDecisionRequest.findUnique({
      where: { decisionToken: token },
      include: this.includeGraph()
    });
    if (!row) throw new NotFoundException("Decision link not found.");
    if (row.expiresAt < new Date()) throw new GoneException("Decision link expired.");
    if (row.status === DecisionRequestStatus.DRAFT || row.status === DecisionRequestStatus.CANCELLED) {
      throw new NotFoundException("Decision link is not active.");
    }
    if (row.status === DecisionRequestStatus.SENT) {
      row = await this.prisma.customerDecisionRequest.update({
        where: { id: row.id },
        data: { status: DecisionRequestStatus.VIEWED, viewedAt: new Date() },
        include: this.includeGraph()
      });
    }
    return {
      id: row.id,
      status: this.status(row.status),
      tenantName: row.tenant.name,
      branchName: row.workOrder.branch?.name || "Service branch",
      workOrderNumber: row.workOrder.number,
      assetName: row.asset.name,
      assetIdentifier: row.asset.primaryIdentifier,
      customerName: row.customer.fullName,
      expiresAt: row.expiresAt.toISOString(),
      items: row.items.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => this.itemDto(item))
    };
  }

  async submitPublicDecision(token: string, body: SubmitCustomerDecisionDto) {
    const row = await this.prisma.customerDecisionRequest.findUnique({
      where: { decisionToken: token },
      include: this.includeGraph()
    });
    if (!row) throw new NotFoundException("Decision link not found.");
    if (row.expiresAt < new Date()) throw new GoneException("Decision link expired.");
    if (row.status === DecisionRequestStatus.DRAFT || row.status === DecisionRequestStatus.CANCELLED) {
      throw new NotFoundException("Decision link is not active.");
    }
    if (row.status === DecisionRequestStatus.RESPONDED) throw new BadRequestException("Decision request already responded.");
    if (row.status !== DecisionRequestStatus.SENT && row.status !== DecisionRequestStatus.VIEWED) {
      throw new BadRequestException("Decision request is not available for response.");
    }

    const decisions = new Map((body.decisions || []).map((item) => [item.itemId, item]));
    for (const item of row.items) {
      const decision = decisions.get(item.id);
      if (!decision) throw new BadRequestException(`Missing decision for ${item.title}.`);
      if (!["approved", "rejected"].includes(decision.decision)) throw new BadRequestException("Invalid item decision.");
      if (item.criticalWarningRequired && decision.decision === "rejected" && !decision.warningAcknowledged) {
        throw new BadRequestException(`Critical rejection for ${item.title} requires warning acknowledgement.`);
      }
    }

    const criticalRejected = row.items.some((item) => item.criticalWarningRequired && decisions.get(item.id)?.decision === "rejected");
    const respondedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerDecisionRequest.updateMany({
        where: { id: row.id, status: { in: [DecisionRequestStatus.SENT, DecisionRequestStatus.VIEWED] }, expiresAt: { gte: respondedAt } },
        data: {
          status: DecisionRequestStatus.RESPONDED,
          respondedAt,
          customerNote: body.customerNote || null,
          channelEntry: DecisionChannel.WHATSAPP_LINK
        }
      });
      if (claimed.count !== 1) throw new BadRequestException("Decision request is no longer available for response.");

      const running = await tx.runningInvoice.upsert({
        where: { workOrderId: row.workOrderId },
        create: {
          tenantId: row.tenantId,
          workOrderId: row.workOrderId,
          customerId: row.customerId,
          branchId: row.workOrder.branchId,
          currency: row.tenant.currency
        },
        update: {}
      });
      for (const item of row.items) {
        const decision = decisions.get(item.id)!;
        const approved = decision.decision === "approved";
        await tx.customerDecisionItem.update({
          where: { id: item.id },
          data: {
            decisionStatus: approved ? DecisionItemStatus.APPROVED : DecisionItemStatus.REJECTED,
            priceLocked: approved,
            warningAcknowledged: Boolean(decision.warningAcknowledged),
            customerDecisionNote: decision.note || null,
            respondedAt: new Date()
          }
        });
        const existingLine = await tx.runningInvoiceLine.findFirst({
          where: { runningInvoiceId: running.id, sourceType: "customer_decision", sourceId: item.id }
        });
        const total = Number(item.estimatedTotal || item.estimatedPrice);
        const lineData = {
          title: item.title,
          lineType: SellableItemType.SERVICE,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          laborPrice: item.laborPrice,
          total: approved ? total : 0,
          status: approved ? FinancialLineStatus.APPROVED : FinancialLineStatus.REJECTED,
          priceLocked: approved
        };
        if (existingLine) await tx.runningInvoiceLine.update({ where: { id: existingLine.id }, data: lineData });
        else {
          await tx.runningInvoiceLine.create({
            data: {
              runningInvoiceId: running.id,
              sourceType: "customer_decision",
              sourceId: item.id,
              ...lineData
            }
          });
        }
      }
      const invoiceLines = await tx.runningInvoiceLine.findMany({ where: { runningInvoiceId: running.id } });
      const billable = invoiceLines.filter((line) =>
        !new Set<FinancialLineStatus>([
          FinancialLineStatus.REJECTED,
          FinancialLineStatus.REMOVED,
          FinancialLineStatus.RETURNED,
          FinancialLineStatus.REFUNDED
        ]).has(line.status)
      );
      const subtotal = billable.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity + Number(line.laborPrice), 0);
      const tax = billable.reduce((sum, line) => sum + Number(line.taxAmount), 0);
      const discount = Number(running.discount);
      const total = Math.max(0, subtotal - discount + tax);
      await tx.runningInvoice.update({
        where: { id: running.id },
        data: { subtotal, tax, total, remaining: Math.max(0, total - Number(running.paid)), version: { increment: 1 } }
      });
      await tx.workOrder.update({
        where: { id: row.workOrderId },
        data: {
          status: WorkOrderStatus.IN_PROGRESS,
          statusLabel: criticalRejected ? "Critical Rejection Recorded" : "Customer Decision Recorded",
          customerVisible: true,
          customerSummary: criticalRejected
            ? "A critical service item was rejected and the safety warning acknowledgement was recorded."
            : "Your service decisions were recorded. Approved work can continue."
        }
      });
      await tx.customerTimelineEvent.create({
        data: {
          tenantId: row.tenantId,
          customerId: row.customerId,
          assetId: row.assetId,
          workOrderId: row.workOrderId,
          decisionRequestId: row.id,
          visibility: TimelineVisibility.CUSTOMER_VISIBLE,
          title: "Service decisions recorded",
          message: this.responseSummary(row.items, decisions),
          source: "customer_decision.response"
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId: row.tenantId,
          actorType: AuditActorType.CUSTOMER,
          actorId: row.customerId,
          actorName: row.customer.fullName,
          action: "customer_decision.responded",
          targetType: "customer_decision_request",
          targetId: row.id,
          reason: "Customer submitted decisions through secure MOP link."
        }
      });
    });
    await this.operationEvents.emit({
      eventKey: "customer_decision.responded",
      tenantId: row.tenantId,
      branchId: row.workOrder.branchId || undefined,
      workOrderId: row.workOrderId,
      taskId: row.taskId || undefined,
      customerId: row.customerId,
      assetId: row.assetId,
      actor: {
        actorType: "customer",
        actorId: row.customerId,
        actorName: row.customer.fullName,
        roleId: "customer"
      },
      statusChanges: [
        { entityType: "customer_decision", entityId: row.id, fromStatus: row.status, toStatus: "RESPONDED", label: "Customer responded" },
        { entityType: "work_order", entityId: row.workOrderId, toStatus: "IN_PROGRESS", label: criticalRejected ? "Critical Rejection Recorded" : "Customer Decision Recorded" }
      ],
      notificationTargets: ["technician", "branch_manager", "team_leader", "reports_engine"],
      pageUpdates: ["work-card", "branch-decisions", "branch-workspace", "team-review", "analytics-operations"],
      reportHooks: [
        { reportKey: "reports.team.customer_decisions.view", metric: "decision_responded", delta: 1, scope: ["team", "branch"] },
        { reportKey: "reports.branch.operations.view", metric: criticalRejected ? "critical_customer_rejection" : "customer_decision_recorded", delta: 1, scope: ["branch"] }
      ],
      auditAction: "customer_decision.responded",
      canUndo: false,
      customerSafeOutput: {
        title: "Service decisions recorded",
        message: this.responseSummary(row.items, decisions),
        source: "customer_decision.response",
        customerId: row.customerId,
        assetId: row.assetId,
        workOrderId: row.workOrderId
      },
      payload: {
        decision_request_id: row.id,
        critical_rejected: criticalRejected,
        customerTimelineAlreadyWritten: true
      },
      reason: "Customer submitted decisions through secure MOP link.",
      targetType: "customer_decision_request",
      targetId: row.id
    });
    const anyApproved = row.items.some((item) => decisions.get(item.id)?.decision === "approved");
    await this.operationEvents.emit({
      eventKey: anyApproved ? "quote.approved" : "quote.rejected",
      tenantId: row.tenantId,
      branchId: row.workOrder.branchId || undefined,
      workOrderId: row.workOrderId,
      customerId: row.customerId,
      assetId: row.assetId,
      actor: {
        actorType: "customer",
        actorId: row.customerId,
        actorName: row.customer.fullName,
        roleId: "customer"
      },
      notificationTargets: ["technician", "branch_manager", "tenant_owner", "reports_engine"],
      pageUpdates: ["work-card", "branch-invoices", "invoices-payments", "financial-dashboard", "customer-finance"],
      statusChanges: [{ entityType: "customer_decision", entityId: row.id, toStatus: anyApproved ? "APPROVED" : "REJECTED", label: "Priced customer decision recorded" }],
      reportHooks: [{ reportKey: "finance.reports.view", metric: anyApproved ? "approved_value" : "rejected_value", delta: 1, scope: ["company", "branch"] }],
      auditAction: anyApproved ? "quote.approved" : "quote.rejected",
      canUndo: false,
      payload: { decision_request_id: row.id, approved_prices_locked: anyApproved },
      reason: "Customer response locked the approved selling-price snapshot.",
      targetType: "customer_decision_request",
      targetId: row.id
    });
    await this.operationEvents.emit({
      eventKey: "running_invoice.updated",
      tenantId: row.tenantId,
      branchId: row.workOrder.branchId || undefined,
      workOrderId: row.workOrderId,
      customerId: row.customerId,
      assetId: row.assetId,
      actor: {
        actorType: "customer",
        actorId: row.customerId,
        actorName: row.customer.fullName,
        roleId: "customer"
      },
      notificationTargets: ["branch_manager", "tenant_owner", "reports_engine"],
      pageUpdates: ["branch-invoices", "invoices-payments", "financial-dashboard", "customer-finance"],
      statusChanges: [{ entityType: "running_invoice", entityId: row.workOrderId, toStatus: "ACTIVE", label: "Running invoice recalculated" }],
      reportHooks: [{ reportKey: "finance.reports.view", metric: "running_invoice_updated", delta: 1, scope: ["company", "branch"] }],
      auditAction: "running_invoice.updated",
      canUndo: false,
      payload: { source: "customer_decision", decision_request_id: row.id },
      reason: "Customer decision response recalculated the running invoice.",
      targetType: "running_invoice",
      targetId: row.workOrderId
    });

    return { status: "recorded", decisionRequestId: row.id };
  }

  async assetTimeline(session: RequestSessionContext, assetId: string): Promise<CustomerTimelineEventDto[]> {
    const rows = await this.prisma.customerTimelineEvent.findMany({
      where: {
        assetId,
        tenantId: session.tenantId,
        visibility: TimelineVisibility.CUSTOMER_VISIBLE,
        decisionRequest: this.access.decisionRequestWhere(session)
      },
      include: {
        decisionRequest: { include: this.includeGraph() }
      },
      orderBy: { occurredAt: "desc" }
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      source: row.source,
      occurredAt: row.occurredAt.toISOString(),
      decisionRequest: row.decisionRequest ? this.toDto(row.decisionRequest) : undefined
    }));
  }

  private async findScoped(session: RequestSessionContext, id: string) {
    return this.prisma.customerDecisionRequest.findFirst({
      where: { id, ...this.access.decisionRequestWhere(session) },
      include: this.includeGraph()
    });
  }

  private includeGraph() {
    return {
      tenant: true,
      workOrder: { include: { branch: true } },
      task: true,
      asset: true,
      customer: true,
      createdBy: true,
      items: true
    } as const;
  }

  private async findDecisionForMapping() {
    return this.prisma.customerDecisionRequest.findFirst({ include: this.includeGraph() });
  }

  private toDto(row: NonNullable<DecisionRequestRow>): CustomerDecisionRequestDto {
    const sorted = [...row.items].sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      id: row.id,
      status: this.status(row.status),
      workOrderNumber: row.workOrder.number,
      assetName: row.asset.name,
      assetIdentifier: row.asset.primaryIdentifier,
      customerName: row.customer.fullName,
      branchName: row.workOrder.branch?.name || "Service branch",
      createdByName: row.createdBy?.name,
      whatsappMessage: row.whatsappMessage || undefined,
      secureLink: row.secureLink || undefined,
      customerNote: row.customerNote || undefined,
      sentAt: row.sentAt?.toISOString(),
      respondedAt: row.respondedAt?.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      items: sorted.map((item) => this.itemDto(item))
    };
  }

  private itemDto(item: any): CustomerDecisionItemDto {
    return {
      id: item.id,
      title: item.title,
      customerExplanation: item.customerExplanation,
      importance: this.importanceLabel(item.importance),
      estimatedPrice: Number(item.estimatedPrice),
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      laborPrice: Number(item.laborPrice),
      estimatedTotal: Number(item.estimatedTotal || item.estimatedPrice),
      priceLocked: item.priceLocked,
      decisionRequired: item.decisionRequired,
      criticalWarningRequired: item.criticalWarningRequired,
      criticalWarningText: item.criticalWarningText || undefined,
      decisionStatus: item.decisionStatus.toLowerCase(),
      warningAcknowledged: item.warningAcknowledged,
      customerDecisionNote: item.customerDecisionNote || undefined
    };
  }

  private whatsappMessage(input: {
    customerName: string;
    assetName: string;
    identifier: string;
    tenantName: string;
    secureLink: string;
    items: Array<{ title: string; importance: DecisionImportance; estimatedPrice: number | string }>;
  }) {
    const lines = input.items.map((item, index) => {
      return `${index + 1}. ${item.title}\nImportance: ${this.importanceLabel(item.importance)}\nEstimated cost: ${Number(item.estimatedPrice).toLocaleString()} EGP`;
    });
    return [
      `Hello ${input.customerName},`,
      `We inspected your ${input.assetName} - ${input.identifier}.`,
      "",
      "Your decision is needed for the following items:",
      "",
      ...lines,
      "",
      "Please open the secure link below to approve or reject each item:",
      input.secureLink,
      "",
      `Thank you,`,
      input.tenantName
    ].join("\n");
  }

  private secureLink(token: string) {
    const base = process.env.CUSTOMER_DECISION_BASE_URL || process.env.CORS_ORIGIN || "http://localhost:4200";
    return `${base.replace(/\/$/, "")}/decision/${token}`;
  }

  private responseSummary(items: any[], decisions: Map<string, { decision: "approved" | "rejected"; warningAcknowledged?: boolean }>) {
    return items
      .map((item) => {
        const decision = decisions.get(item.id);
        const warning = item.criticalWarningRequired && decision?.decision === "rejected" ? " - critical warning acknowledged" : "";
        return `${item.title}: ${decision?.decision || "pending"}${warning}`;
      })
      .join("; ");
  }

  private async timeline(row: any, title: string, message: string, source: string) {
    return this.prisma.customerTimelineEvent.create({
      data: {
        tenantId: row.tenantId,
        customerId: row.customerId,
        assetId: row.assetId,
        workOrderId: row.workOrderId,
        decisionRequestId: row.id,
        visibility: TimelineVisibility.CUSTOMER_VISIBLE,
        title,
        message,
        source
      }
    });
  }

  private async audit(session: RequestSessionContext, action: string, targetId: string, reason: string) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorType: AuditActorType.TENANT_STAFF,
        actorId: session.userId,
        actorName: session.displayName,
        action,
        targetType: "customer_decision_request",
        targetId,
        reason
      }
    });
  }

  private status(status: DecisionRequestStatus) {
    return status.toLowerCase() as any;
  }

  private importance(value?: string): DecisionImportance {
    const normalized = String(value || "normal").toUpperCase();
    if (normalized === "MEDIUM") return DecisionImportance.MEDIUM;
    if (normalized === "HIGH") return DecisionImportance.HIGH;
    if (normalized === "CRITICAL") return DecisionImportance.CRITICAL;
    return DecisionImportance.NORMAL;
  }

  private importanceLabel(value: DecisionImportance | string) {
    return String(value).toLowerCase() as any;
  }

  private source(value?: string): DecisionSource {
    if (value === "inspection_finding") return DecisionSource.INSPECTION_FINDING;
    if (value === "work_order") return DecisionSource.WORK_ORDER;
    return DecisionSource.TECHNICIAN_TASK;
  }
}
