import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AccountStatus,
  AccountType,
  AuditActorType,
  CategoryCode as PrismaCategoryCode,
  DecisionItemStatus,
  DecisionRequestStatus,
  PartRequestStatus,
  PortalStatus,
  Prisma,
  Severity,
  StaffStatus,
  TaskStatus,
  TimelineVisibility,
  WorkOrderStatus
} from "@prisma/client";
import type {
  BranchAttentionCardDto,
  BranchDeliveryRowDto,
  BranchDeliveryStatusDto,
  BranchDecisionQueueDto,
  BranchIntakeCreateDto,
  BranchIntakeOptionsDto,
  BranchIntakeResultDto,
  BranchManagerHomeDto,
  BranchStaffOptionDto,
  BranchTechnicianLoadDto,
  BranchWorkOrderCardDto,
  BranchWorkOrderGroup,
  BranchWorkOrdersBoardDto,
  BranchWorkspaceDto,
  CategoryCode,
  CustomerDecisionItemDto,
  CustomerDecisionRequestDto,
  CustomerTimelineEventDto
} from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { PrismaService } from "../../database/prisma.service";
import { OperationEventsService } from "../../operations/operation-events.service";
import { FinanceService } from "../finance/finance.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

const isOneOf = <T>(value: T, ...allowed: T[]) => allowed.includes(value);

const GROUP_LABELS: Record<BranchWorkOrderGroup, string> = {
  registered: "Registered",
  under_inspection: "Under Inspection",
  waiting_customer: "Waiting Customer",
  approved_for_work: "Approved for Work",
  in_progress: "In Progress",
  waiting_parts: "Waiting Parts",
  blocked: "Blocked",
  ready_team_review: "Ready for Team Review",
  ready_qc: "Ready for QC",
  qc_failed: "QC Failed",
  ready_delivery: "Ready for Delivery",
  payment_pending: "Payment Pending",
  closed: "Closed",
  cancelled: "Cancelled"
};

const BOARD_GROUPS = Object.keys(GROUP_LABELS) as BranchWorkOrderGroup[];

@Injectable()
export class BranchManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationEvents: OperationEventsService,
    private readonly finance: FinanceService
  ) {}

  async home(session: RequestSessionContext): Promise<BranchManagerHomeDto> {
    const [branches, rows] = await Promise.all([this.scopedBranches(session), this.branchWorkOrderRows(session)]);
    const cards = rows.map((row) => this.toWorkOrderCard(row));
    const recentTargetIds = this.recentTargetIds(rows);
    const recentActivity = await this.prisma.auditLog.findMany({
      where: {
        tenantId: session.tenantId,
        OR: recentTargetIds.length ? [{ targetId: { in: recentTargetIds } }, { action: { startsWith: "branch." } }] : [{ action: { startsWith: "branch." } }]
      },
      orderBy: { createdAt: "desc" },
      take: 8
    });

    return {
      branchNames: branches.map((branch) => branch.name),
      attentionCards: this.attentionCards(cards),
      technicianLoad: this.technicianLoad(rows),
      urgentWorkOrders: cards.filter((card) => ["critical", "high"].includes(card.priority) || ["blocked", "waiting_parts", "waiting_customer"].includes(card.group)).slice(0, 6),
      recentActivity: recentActivity.map((row) => ({
        id: row.id,
        action: row.action,
        actorName: row.actorName,
        targetType: row.targetType,
        targetId: row.targetId || undefined,
        reason: row.reason || undefined,
        at: row.createdAt.toISOString()
      }))
    };
  }

  async intakeOptions(session: RequestSessionContext): Promise<BranchIntakeOptionsDto> {
    const [branches, customers, assets, technicians] = await Promise.all([
      this.scopedBranches(session),
      this.prisma.customer.findMany({
        where: this.access.customerWhere(session),
        orderBy: { updatedAt: "desc" },
        take: 50
      }),
      this.prisma.asset.findMany({
        where: this.assetWhere(session),
        include: { currentOwner: true },
        orderBy: { updatedAt: "desc" },
        take: 50
      }),
      this.technicianOptions(session)
    ]);

    return {
      branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
      customers: customers.map((customer) => ({
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email || undefined,
        portalStatus: customer.portalStatus.toLowerCase() as any
      })),
      assets: assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        category: this.categoryLabel(asset.category),
        primaryIdentifier: asset.primaryIdentifier,
        ownerCustomerId: asset.currentOwnerCustomerId,
        ownerName: asset.currentOwner.fullName
      })),
      technicians,
      communicationPreferences: ["whatsapp", "phone", "sms", "email"]
    };
  }

  async createIntake(session: RequestSessionContext, rawBody: unknown): Promise<BranchIntakeResultDto> {
    const body = rawBody as BranchIntakeCreateDto;
    const tenantId = this.requireTenant(session);
    const branchId = await this.resolveBranchId(session, body.branchId);
    const technicianId = body.assignment?.technicianId || undefined;
    if (technicianId) await this.assertTechnicianInScope(session, technicianId);
    if (!body.workOrder?.complaint?.trim()) throw new BadRequestException("Work order complaint is required.");

    const result = await this.prisma.$transaction(async (tx) => {
      let customer: any;
      if (body.customer?.mode === "existing") {
        if (!body.customer.customerId) throw new BadRequestException("customerId is required for existing customer.");
        customer = await tx.customer.findFirst({ where: { id: body.customer.customerId, ...this.access.customerWhere(session) } });
        if (!customer) throw new NotFoundException("Customer not found in branch scope.");
      } else {
        if (!body.customer?.fullName?.trim() || !body.customer?.phone?.trim()) throw new BadRequestException("Customer name and phone are required.");
        customer = await tx.customer.create({
          data: {
            tenantId,
            branchId,
            fullName: body.customer.fullName.trim(),
            phone: body.customer.phone.trim(),
            email: body.customer.email?.trim() || null,
            preferredContact: body.communication?.preference || body.customer.preferredContact || "whatsapp",
            communicationConsent: Boolean(body.customer.communicationConsent),
            portalStatus: PortalStatus.DISABLED,
            createdByStaffUserId: session.userId
          }
        });
      }

      let portalInvited = false;
      if (body.communication?.portalInvite && customer.portalStatus !== PortalStatus.INVITED && customer.portalStatus !== PortalStatus.ENABLED) {
        const existingAccount = await tx.account.findUnique({ where: { loginIdentifier: customer.phone } });
        if (!customer.accountId && (!existingAccount || existingAccount.tenantId === tenantId)) {
          const account = existingAccount || await tx.account.create({
            data: {
              tenantId,
              accountType: AccountType.CUSTOMER,
              loginIdentifier: customer.phone,
              status: AccountStatus.INVITED
            }
          });
          customer = await tx.customer.update({
            where: { id: customer.id },
            data: { accountId: account.id, portalStatus: PortalStatus.INVITED }
          });
          portalInvited = true;
        }
      }

      let asset: any;
      if (body.asset?.mode === "existing") {
        if (!body.asset.assetId) throw new BadRequestException("assetId is required for existing asset.");
        asset = await tx.asset.findFirst({ where: { id: body.asset.assetId, tenantId } });
        if (!asset) throw new NotFoundException("Asset not found.");
        if (asset.currentOwnerCustomerId !== customer.id) {
          if (!body.asset.ownershipTransfer) {
            throw new BadRequestException("Asset belongs to another customer. Confirm ownership transfer to continue.");
          }
          await tx.assetOwnershipHistory.updateMany({ where: { assetId: asset.id, toDate: null }, data: { toDate: new Date() } });
          asset = await tx.asset.update({
            where: { id: asset.id },
            data: { currentOwnerCustomerId: customer.id, branchId }
          });
          await tx.assetOwnershipHistory.create({
            data: {
              assetId: asset.id,
              customerId: customer.id,
              fromDate: new Date(),
              transferredBy: session.userId,
              transferReason: "Branch intake ownership transfer."
            }
          });
        }
      } else {
        if (!body.asset?.name?.trim() || !body.asset.primaryIdentifier?.trim() || !body.asset.category) {
          throw new BadRequestException("Asset name, identifier, and category are required.");
        }
        const existingAsset = await tx.asset.findUnique({ where: { tenantId_primaryIdentifier: { tenantId, primaryIdentifier: body.asset.primaryIdentifier.trim() } } });
        if (existingAsset) throw new BadRequestException("Asset identifier already exists. Use existing asset mode.");
        asset = await tx.asset.create({
          data: {
            tenantId,
            branchId,
            currentOwnerCustomerId: customer.id,
            category: this.toPrismaCategory(body.asset.category),
            name: body.asset.name.trim(),
            primaryIdentifier: body.asset.primaryIdentifier.trim()
          }
        });
        await tx.assetOwnershipHistory.create({
          data: {
            assetId: asset.id,
            customerId: customer.id,
            fromDate: new Date(),
            transferredBy: session.userId,
            transferReason: "New asset registered during branch intake."
          }
        });
      }

      const number = await this.nextWorkOrderNumber(tx, tenantId);
      const workOrder = await tx.workOrder.create({
        data: {
          tenantId,
          branchId,
          assetId: asset.id,
          customerId: customer.id,
          number,
          category: asset.category,
          status: WorkOrderStatus.INSPECTION,
          statusLabel: technicianId ? "Registered - Technician Assigned" : "Registered - Awaiting Assignment",
          priority: this.toSeverity(body.workOrder.priority),
          complaint: body.workOrder.complaint.trim(),
          customerVisible: true,
          customerSummary: "Your work order was opened and the branch team is preparing the next step."
        }
      });
      const task = await tx.task.create({
        data: {
          tenantId,
          branchId,
          workOrderId: workOrder.id,
          assetId: asset.id,
          customerId: customer.id,
          title: "Initial inspection and intake triage",
          type: "intake",
          status: technicianId ? TaskStatus.ASSIGNED : TaskStatus.IN_PROGRESS,
          severity: this.toSeverity(body.workOrder.priority),
          category: asset.category
        }
      });
      if (technicianId) {
        await tx.workOrderAssignment.create({ data: { workOrderId: workOrder.id, staffUserId: technicianId, assignmentRole: "technician" } });
        await tx.taskAssignment.create({ data: { taskId: task.id, staffUserId: technicianId } });
      }
      await tx.customerTimelineEvent.create({
        data: {
          tenantId,
          customerId: customer.id,
          assetId: asset.id,
          workOrderId: workOrder.id,
          visibility: TimelineVisibility.CUSTOMER_VISIBLE,
          title: "Work order opened",
          message: "Your branch registered the service request and linked it to this asset.",
          source: "branch.intake.created"
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorType: AuditActorType.TENANT_STAFF,
          actorId: session.userId,
          actorName: session.displayName,
          action: "branch.intake.created",
          targetType: "work_order",
          targetId: workOrder.id,
          reason: "Branch Manager intake created a customer, asset link, work order, and optional technician assignment.",
          after: { customerId: customer.id, assetId: asset.id, workOrderId: workOrder.id, technicianId, portalInvited }
        }
      });
      return { customer, asset, workOrder, task, portalInvited };
    });

    await this.operationEvents.emitFromSession(session, {
      eventKey: "work_order.created",
      tenantId: result.workOrder.tenantId,
      branchId: result.workOrder.branchId || undefined,
      workOrderId: result.workOrder.id,
      customerId: result.customer.id,
      assetId: result.asset.id,
      statusChanges: [
        { entityType: "work_order", entityId: result.workOrder.id, toStatus: "INSPECTION", label: result.workOrder.statusLabel },
        { entityType: "task", entityId: result.task.id, toStatus: technicianId ? "ASSIGNED" : "IN_PROGRESS", label: technicianId ? "Technician assigned" : "Awaiting assignment" }
      ],
      notificationTargets: ["branch_manager", ...(technicianId ? ["technician" as const] : []), "customer", "reports_engine"],
      pageUpdates: ["branch-workspace", "branch-work-orders", ...(technicianId ? ["my-work", "work-card"] : []), "customer", "analytics-operations"],
      reportHooks: [
        { reportKey: "reports.branch.operations.view", metric: "intake_created", delta: 1, scope: ["branch"] },
        { reportKey: "reports.company.view", metric: "work_order_created", delta: 1, scope: ["company"] }
      ],
      auditAction: "branch.intake.created",
      canUndo: false,
      customerSafeOutput: {
        title: "Work order opened",
        message: "Your branch registered the service request and linked it to this asset.",
        source: "branch.intake.created",
        customerId: result.customer.id,
        assetId: result.asset.id,
        workOrderId: result.workOrder.id
      },
      payload: {
        customer_id: result.customer.id,
        asset_id: result.asset.id,
        work_order_id: result.workOrder.id,
        assigned_technician_id: technicianId,
        portal_invited: result.portalInvited,
        customerTimelineAlreadyWritten: true
      },
      reason: "Branch Manager intake created a customer, asset link, work order, and optional technician assignment.",
      targetType: "work_order",
      targetId: result.workOrder.id
    });

    if (technicianId) {
      await this.operationEvents.emitFromSession(session, {
        eventKey: "technician.assigned",
        tenantId: result.workOrder.tenantId,
        branchId: result.workOrder.branchId || undefined,
        workOrderId: result.workOrder.id,
        taskId: result.task.id,
        customerId: result.customer.id,
        assetId: result.asset.id,
        statusChanges: [
          { entityType: "task", entityId: result.task.id, toStatus: "ASSIGNED", label: "Technician assigned" }
        ],
        notificationTargets: ["technician", "branch_manager", "team_leader", "reports_engine"],
        pageUpdates: ["my-work", "work-card", "branch-workspace", "team-review", "analytics-people"],
        reportHooks: [
          { reportKey: "reports.team.technician_performance.view", metric: "technician_assigned", delta: 1, scope: ["team", "branch"] }
        ],
        auditAction: "technician.assigned",
        canUndo: true,
        payload: { technician_id: technicianId },
        reason: "Branch Manager assigned a technician during intake.",
        targetType: "task",
        targetId: result.task.id
      });
    }

    return {
      customerId: result.customer.id,
      assetId: result.asset.id,
      workOrderId: result.workOrder.id,
      workOrderNumber: result.workOrder.number,
      assignedTechnicianId: technicianId,
      portalInvited: result.portalInvited
    };
  }

  async workOrders(session: RequestSessionContext, group?: string): Promise<BranchWorkOrdersBoardDto> {
    const rows = await this.branchWorkOrderRows(session);
    const cards = rows.map((row) => this.toWorkOrderCard(row));
    const selectedGroup = BOARD_GROUPS.includes(group as BranchWorkOrderGroup) ? group as BranchWorkOrderGroup : undefined;
    return {
      groups: BOARD_GROUPS.map((id) => {
        const workOrders = cards.filter((card) => card.group === id && (!selectedGroup || selectedGroup === id));
        return { id, label: GROUP_LABELS[id], count: cards.filter((card) => card.group === id).length, workOrders };
      })
    };
  }

  async workspace(session: RequestSessionContext, id: string): Promise<BranchWorkspaceDto> {
    const row = await this.prisma.workOrder.findFirst({
      where: { id, ...this.scopedWorkOrderWhere(session) },
      include: this.workOrderInclude()
    });
    if (!row) throw new NotFoundException("Work order not found in branch scope.");
    const technicians = await this.technicianOptions(session);
    const card = this.toWorkOrderCard(row);
    const paymentDelivery = this.toDeliveryRow(row);

    return {
      workOrder: card,
      customer: {
        id: row.customer.id,
        fullName: row.customer.fullName,
        phone: row.customer.phone,
        email: row.customer.email || undefined,
        preferredContact: row.customer.preferredContact,
        portalStatus: row.customer.portalStatus.toLowerCase() as any
      },
      asset: {
        id: row.asset.id,
        name: row.asset.name,
        category: this.categoryLabel(row.asset.category),
        primaryIdentifier: row.asset.primaryIdentifier
      },
      assignedTeam: row.assignments.map((assignment: any) => ({
        id: assignment.staffUser.id,
        name: assignment.staffUser.name,
        role: assignment.assignmentRole,
        activeJobs: 0
      })),
      availableTechnicians: technicians,
      technicianActivity: row.tasks.map((task: any) => ({
        taskId: task.id,
        title: task.title,
        status: task.status.toLowerCase(),
        severity: task.severity.toLowerCase(),
        assignedTechnicians: task.assignments.map((assignment: any) => assignment.staffUser.name),
        blockersOpen: task.blockers.filter((blocker: any) => !blocker.resolved).length
      })),
      customerDecisions: row.decisionRequests.map((decision: any) => this.toDecisionDto(decision, row)),
      parts: row.partRequests.map((request: any) => ({
        requestId: request.id,
        itemName: request.item.name,
        qty: request.qty,
        status: request.status.toLowerCase(),
        warehouseName: request.warehouse?.name,
        technicianName: row.assignments.find((assignment: any) => assignment.staffUserId === request.technicianId)?.staffUser?.name,
        reason: request.reason || undefined
      })),
      blockers: row.tasks.flatMap((task: any) =>
        task.blockers.map((blocker: any) => ({
          id: blocker.id,
          taskTitle: task.title,
          reason: blocker.reason,
          createdAt: blocker.createdAt.toISOString(),
          resolved: blocker.resolved
        }))
      ),
      qc: {
        teamLeaderReview: "on",
        state: this.qcState(row)
      },
      paymentDelivery,
      timeline: row.timelineEvents
        .sort((a: any, b: any) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .map((event: any) => this.toTimelineDto(event)),
      allowedActions: ["assign_technician", "change_priority", "send_customer_reminder", "escalate_blocker", "record_manual_note", "approve_cancellation", "mark_ready_delivery"]
    };
  }

  async workOrderAction(session: RequestSessionContext, id: string, rawBody: unknown) {
    const body = rawBody as Record<string, any>;
    const action = String(body.action || "");
    const workOrder = await this.findWorkOrder(session, id);

    if (action === "assign_technician") {
      this.access.assert("branch.work_order.assign", session);
      const technicianId = String(body.technicianId || "");
      await this.assertTechnicianInScope(session, technicianId);
      await this.reassignTechnician(workOrder.id, technicianId);
      await this.audit(session, "branch.work_order.assigned", "work_order", workOrder.id, `Assigned technician ${technicianId}.`, { technicianId });
      return { status: "assigned", workOrderId: workOrder.id, technicianId };
    }

    if (action === "change_priority") {
      this.access.assert("branch.work_order.priority.update", session);
      const priority = this.toSeverity(String(body.priority || "normal"));
      await this.prisma.workOrder.update({ where: { id: workOrder.id }, data: { priority } });
      await this.audit(session, "branch.work_order.priority_updated", "work_order", workOrder.id, `Priority changed to ${priority}.`, { priority });
      return { status: "priority_updated", workOrderId: workOrder.id, priority };
    }

    if (action === "send_customer_reminder") {
      this.access.assert("customer_decision.send", session);
      await this.createTimeline(workOrder, "Customer reminder sent", "Your branch sent a reminder for a pending service decision.", "branch.customer_decision_reminder", TimelineVisibility.CUSTOMER_VISIBLE);
      await this.audit(session, "branch.customer_decision.reminder_sent", "work_order", workOrder.id, "Branch Manager sent a customer decision reminder.");
      return { status: "reminder_sent", workOrderId: workOrder.id };
    }

    if (action === "escalate_blocker") {
      this.access.assert("branch.blocker.escalate", session);
      await this.createTimeline(workOrder, "Blocker escalated", String(body.note || "Branch Manager escalated an operational blocker.").slice(0, 240), "branch.blocker_escalated", TimelineVisibility.STAFF_ONLY);
      await this.audit(session, "branch.blocker.escalated", "work_order", workOrder.id, "Branch Manager escalated blocker follow-up.", { note: body.note || null });
      return { status: "blocker_escalated", workOrderId: workOrder.id };
    }

    if (action === "record_manual_note") {
      this.access.assert("customer_decision.manual_record", session);
      const note = String(body.note || "").trim();
      if (!note) throw new BadRequestException("note is required.");
      await this.createTimeline(workOrder, "Branch note", note.slice(0, 240), "branch.manual_note", TimelineVisibility.STAFF_ONLY);
      await this.audit(session, "branch.manual_note.recorded", "work_order", workOrder.id, note.slice(0, 240));
      return { status: "note_recorded", workOrderId: workOrder.id };
    }

    if (action === "approve_cancellation") {
      this.access.assert("branch.work_order.cancel.approve", session);
      await this.prisma.workOrder.update({
        where: { id: workOrder.id },
        data: { status: WorkOrderStatus.CANCELLED, statusLabel: "Cancelled by Branch Manager" }
      });
      await this.audit(session, "branch.work_order.cancelled", "work_order", workOrder.id, String(body.reason || "Branch Manager approved cancellation."));
      return { status: "cancelled", workOrderId: workOrder.id };
    }

    if (action === "mark_ready_delivery") {
      this.access.assert("branch.delivery.mark_ready", session);
      await this.markReadyForDelivery(session, workOrder.id);
      return { status: "ready_for_delivery", workOrderId: workOrder.id };
    }

    throw new BadRequestException("Unsupported branch work order action.");
  }

  async decisions(session: RequestSessionContext): Promise<BranchDecisionQueueDto> {
    const rows = await this.prisma.customerDecisionRequest.findMany({
      where: this.access.decisionRequestWhere(session),
      include: {
        tenant: true,
        workOrder: { include: { branch: true, asset: true, customer: true } },
        task: true,
        asset: true,
        customer: true,
        createdBy: true,
        items: true
      },
      orderBy: { updatedAt: "desc" }
    });
    const decisions = rows.map((row: any) => {
      const dto = this.toDecisionDto(row, row.workOrder);
      const criticalRejected = row.items.some((item: any) => item.criticalWarningRequired && item.decisionStatus === DecisionItemStatus.REJECTED);
      const pendingItems = row.items.filter((item: any) => item.decisionStatus === DecisionItemStatus.PENDING).length;
      return {
        ...dto,
        overdue: row.expiresAt < new Date() && row.status !== DecisionRequestStatus.RESPONDED,
        pendingItems,
        approvedItems: row.items.filter((item: any) => item.decisionStatus === DecisionItemStatus.APPROVED).length,
        rejectedItems: row.items.filter((item: any) => item.decisionStatus === DecisionItemStatus.REJECTED).length,
        criticalRejected,
        nextAction: criticalRejected ? "Escalate critical rejection" : pendingItems ? "Send reminder or call customer" : "Notify technician"
      };
    });
    return {
      pending: decisions.filter((decision) => ["draft", "sent", "viewed"].includes(decision.status)).length,
      overdue: decisions.filter((decision) => decision.overdue).length,
      criticalRejected: decisions.filter((decision) => decision.criticalRejected).length,
      decisions
    };
  }

  async decisionAction(session: RequestSessionContext, id: string, rawBody: unknown) {
    const body = rawBody as Record<string, any>;
    const action = String(body.action || "");
    const decision = await this.prisma.customerDecisionRequest.findFirst({
      where: { id, ...this.access.decisionRequestWhere(session) },
      include: { workOrder: { include: { asset: true, customer: true } }, items: true }
    });
    if (!decision) throw new NotFoundException("Decision request not found in branch scope.");

    if (action === "send_reminder") {
      this.access.assert("customer_decision.send", session);
      await this.createTimeline(decision.workOrder, "Decision reminder sent", "Your branch sent a reminder for this service decision.", "branch.customer_decision_reminder", TimelineVisibility.CUSTOMER_VISIBLE, decision.id);
      await this.audit(session, "branch.customer_decision.reminder_sent", "customer_decision_request", decision.id, "Reminder sent by Branch Manager.");
      return { status: "reminder_sent", decisionId: id };
    }

    if (action === "manual_note") {
      this.access.assert("customer_decision.manual_record", session);
      const note = String(body.note || "").trim();
      if (!note) throw new BadRequestException("note is required.");
      await this.createTimeline(decision.workOrder, "Decision follow-up note", note.slice(0, 240), "branch.customer_decision_manual_note", TimelineVisibility.STAFF_ONLY, decision.id);
      await this.audit(session, "branch.customer_decision.manual_note", "customer_decision_request", decision.id, note.slice(0, 240));
      return { status: "note_recorded", decisionId: id };
    }

    if (action === "escalate_critical") {
      this.access.assert("branch.blocker.escalate", session);
      const hasCriticalRejected = decision.items.some((item) => item.criticalWarningRequired && item.decisionStatus === DecisionItemStatus.REJECTED);
      if (!hasCriticalRejected) throw new BadRequestException("No critical rejected item found on this decision.");
      await this.prisma.workOrder.update({
        where: { id: decision.workOrderId },
        data: { statusLabel: "Critical Rejection Follow-up" }
      });
      await this.audit(session, "branch.customer_decision.critical_escalated", "customer_decision_request", decision.id, "Critical customer rejection escalated.");
      return { status: "critical_escalated", decisionId: id };
    }

    if (action === "notify_technician") {
      this.access.assert("branch.operations.view", session);
      await this.audit(session, "branch.customer_decision.technician_notified", "customer_decision_request", decision.id, "Technician notification placeholder recorded.");
      return { status: "technician_notified", decisionId: id };
    }

    throw new BadRequestException("Unsupported decision action.");
  }

  async delivery(session: RequestSessionContext): Promise<BranchDeliveryStatusDto> {
    const rows = await this.branchWorkOrderRows(session);
    const deliveryRows = await Promise.all(rows.map(async (row) => {
      const mapped = this.toDeliveryRow(row);
      const financial = await this.finance.workOrderFinance(session, row.id);
      const reasons = [...new Set([...mapped.deliveryBlockedReasons.filter((reason) => reason !== "Payment is not clear"), ...financial.deliveryGate.reasons])];
      return {
        ...mapped,
        paymentState: financial.finalInvoice
          ? financial.finalInvoice.balance <= 0
            ? "paid" as const
            : financial.finalInvoice.paid > 0
              ? "partial" as const
              : "pending" as const
          : "not_started" as const,
        invoiceStatus: financial.finalInvoice?.status || "not_issued",
        paidAmount: financial.finalInvoice?.paid || 0,
        remainingAmount: financial.finalInvoice?.balance || financial.runningInvoice.remaining,
        deliveryAllowed: reasons.length === 0,
        deliveryBlockedReasons: reasons
      };
    }));
    return {
      readyForDelivery: deliveryRows.filter((row) => row.deliveryAllowed).length,
      paymentPending: deliveryRows.filter((row) => row.paymentState === "pending" || row.paymentState === "partial").length,
      blocked: deliveryRows.filter((row) => !row.deliveryAllowed).length,
      rows: deliveryRows
    };
  }

  async deliveryAction(session: RequestSessionContext, id: string, rawBody: unknown) {
    const body = rawBody as Record<string, any>;
    const action = String(body.action || "");
    const workOrder = await this.findWorkOrder(session, id);

    if (action === "notify_customer") {
      this.access.assert("branch.customer.notify", session);
      const message = String(body.message || "Your branch has an update about delivery readiness.").slice(0, 240);
      await this.createTimeline(workOrder, "Delivery update", message, "branch.customer_notified", TimelineVisibility.CUSTOMER_VISIBLE);
      await this.audit(session, "branch.delivery.customer_notified", "work_order", workOrder.id, "Customer delivery update recorded.");
      return { status: "customer_notified", workOrderId: id };
    }

    if (action === "mark_ready_delivery") {
      this.access.assert("branch.delivery.mark_ready", session);
      await this.markReadyForDelivery(session, id);
      return { status: "ready_for_delivery", workOrderId: id };
    }

    throw new BadRequestException("Unsupported delivery action.");
  }

  private async markReadyForDelivery(session: RequestSessionContext, workOrderId: string) {
    const workOrder = await this.findWorkOrder(session, workOrderId);
    const delivery = this.toDeliveryRow(workOrder);
    const financial = await this.finance.workOrderFinance(session, workOrderId);
    const reasons = [...new Set([...delivery.deliveryBlockedReasons.filter((reason) => reason !== "Payment is not clear"), ...financial.deliveryGate.reasons])];
    if (reasons.length) {
      throw new BadRequestException(`Delivery is blocked: ${reasons.join(", ")}`);
    }
    await this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: { status: WorkOrderStatus.READY_FOR_DELIVERY, statusLabel: "Ready for Delivery", customerVisible: true, customerSummary: "Your asset is ready for delivery." }
    });
    await this.createTimeline(workOrder, "Ready for delivery", "Your asset is ready for handover after branch checks.", "branch.ready_for_delivery", TimelineVisibility.CUSTOMER_VISIBLE);
    await this.audit(session, "branch.delivery.ready_marked", "work_order", workOrder.id, "Branch Manager marked work order ready for delivery.");
  }

  private async branchWorkOrderRows(session: RequestSessionContext) {
    return this.prisma.workOrder.findMany({
      where: this.scopedWorkOrderWhere(session),
      include: this.workOrderInclude(),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });
  }

  private workOrderInclude() {
    return {
      branch: true,
      customer: true,
      asset: { include: { currentOwner: true } },
      assignments: { include: { staffUser: true } },
      tasks: { include: { assignments: { include: { staffUser: true } }, blockers: true } },
      partRequests: { include: { item: true, warehouse: true, issuedItems: true } },
      decisionRequests: { include: { createdBy: true, items: true } },
      invoices: { include: { payments: true }, orderBy: { updatedAt: "desc" as const } },
      timelineEvents: true
    };
  }

  private scopedWorkOrderWhere(session: RequestSessionContext) {
    return this.access.workOrderWhere(session) as any;
  }

  private assetWhere(session: RequestSessionContext) {
    if (session.branchScope.length) return { tenantId: session.tenantId, branchId: { in: session.branchScope } };
    return { tenantId: session.tenantId, id: "__deny_all__" };
  }

  private async scopedBranches(session: RequestSessionContext) {
    return this.prisma.branch.findMany({
      where: { tenantId: session.tenantId, id: { in: session.branchScope.length ? session.branchScope : ["__deny_all__"] } },
      orderBy: { name: "asc" }
    });
  }

  private async technicianOptions(session: RequestSessionContext): Promise<BranchStaffOptionDto[]> {
    const branchIds = session.branchScope.length ? session.branchScope : (await this.scopedBranches(session)).map((branch) => branch.id);
    const [technicians, tasks] = await Promise.all([
      this.prisma.staffUser.findMany({
        where: {
          tenantId: session.tenantId,
          role: "technician",
          status: StaffStatus.ACTIVE,
          branchScope: { hasSome: branchIds.length ? branchIds : ["__deny_all__"] }
        },
        orderBy: { name: "asc" }
      }),
      this.prisma.task.findMany({
        where: {
          tenantId: session.tenantId,
          branchId: { in: branchIds.length ? branchIds : ["__deny_all__"] },
          status: { in: [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.AWAITING_CUSTOMER_APPROVAL] }
        },
        include: { assignments: true }
      })
    ]);
    return technicians.map((tech) => ({
      id: tech.id,
      name: tech.name,
      role: tech.role,
      activeJobs: tasks.filter((task) => task.assignments.some((assignment) => assignment.staffUserId === tech.id)).length
    }));
  }

  private async resolveBranchId(session: RequestSessionContext, requestedBranchId?: string) {
    const branches = await this.scopedBranches(session);
    const fallback = branches[0]?.id;
    const branchId = requestedBranchId || fallback;
    if (!branchId || !branches.some((branch) => branch.id === branchId)) throw new BadRequestException("Branch is outside Branch Manager scope.");
    return branchId;
  }

  private async assertTechnicianInScope(session: RequestSessionContext, technicianId: string) {
    if (!technicianId) throw new BadRequestException("technicianId is required.");
    const options = await this.technicianOptions(session);
    if (!options.some((tech) => tech.id === technicianId)) throw new BadRequestException("Technician is outside branch scope.");
  }

  private async findWorkOrder(session: RequestSessionContext, id: string) {
    const row = await this.prisma.workOrder.findFirst({
      where: { id, ...this.scopedWorkOrderWhere(session) },
      include: this.workOrderInclude()
    });
    if (!row) throw new NotFoundException("Work order not found in branch scope.");
    return row;
  }

  private async reassignTechnician(workOrderId: string, technicianId: string) {
    const tasks = await this.prisma.task.findMany({ where: { workOrderId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.workOrderAssignment.deleteMany({ where: { workOrderId, assignmentRole: "technician" } });
      await tx.workOrderAssignment.create({ data: { workOrderId, staffUserId: technicianId, assignmentRole: "technician" } });
      for (const task of tasks) {
        await tx.taskAssignment.deleteMany({ where: { taskId: task.id } });
        await tx.taskAssignment.create({ data: { taskId: task.id, staffUserId: technicianId } });
      }
    });
  }

  private async nextWorkOrderNumber(tx: any, tenantId: string) {
    const count = await tx.workOrder.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    return `WO-${year}-${String(count + 1).padStart(4, "0")}`;
  }

  private attentionCards(cards: BranchWorkOrderCardDto[]): BranchAttentionCardDto[] {
    const byGroup = (groups: BranchWorkOrderGroup[]) => cards.filter((card) => groups.includes(card.group));
    return [
      { id: "active", label: "New / Active Work Orders", count: byGroup(["registered", "under_inspection", "approved_for_work", "in_progress"]).length, tone: "blue", route: "/branch-work-orders", nextAction: "Open branch board" },
      { id: "decisions", label: "Waiting Customer Decisions", count: cards.filter((card) => ["draft", "waiting"].includes(card.customerDecisionState)).length, overdue: 0, tone: "gold", route: "/branch-decisions", filter: "decisions", nextAction: "Review decisions" },
      { id: "parts", label: "Waiting Parts", count: byGroup(["waiting_parts"]).length, critical: cards.filter((card) => card.group === "waiting_parts" && card.priority === "critical").length, tone: "gold", route: "/branch-work-orders", filter: "waiting_parts", nextAction: "Follow inventory" },
      { id: "blockers", label: "Blockers", count: byGroup(["blocked"]).length, critical: cards.filter((card) => card.group === "blocked" && card.priority === "critical").length, tone: "red", route: "/branch-work-orders", filter: "blocked", nextAction: "Escalate blockers" },
      { id: "critical", label: "Critical Rejections", count: cards.filter((card) => card.customerDecisionState === "critical_rejected").length, tone: "red", route: "/branch-decisions", filter: "decisions", nextAction: "Follow up safely" },
      { id: "rework", label: "Rework / QC Failed", count: byGroup(["qc_failed"]).length, tone: "red", route: "/branch-work-orders", filter: "qc_failed", nextAction: "Open rework" },
      { id: "delivery", label: "Ready for Delivery", count: byGroup(["ready_delivery"]).length, tone: "green", route: "/branch-delivery", filter: "delivery", nextAction: "Check handover" },
      { id: "payment", label: "Payment Pending", count: byGroup(["payment_pending"]).length, tone: "gold", route: "/branch-delivery", filter: "delivery", nextAction: "Review payment lock" },
      { id: "load", label: "Technician Load", count: new Set(cards.flatMap((card) => card.assignedTechnicianNames)).size, tone: "neutral", route: "/branch-work-orders", nextAction: "Balance assignments" }
    ];
  }

  private technicianLoad(rows: any[]): BranchTechnicianLoadDto[] {
    const load = new Map<string, BranchTechnicianLoadDto>();
    for (const row of rows) {
      const card = this.toWorkOrderCard(row);
      for (const assignment of row.assignments.filter((item: any) => item.assignmentRole === "technician")) {
        const existing = load.get(assignment.staffUserId) || {
          technicianId: assignment.staffUserId,
          technicianName: assignment.staffUser.name,
          activeJobs: 0,
          blockedJobs: 0,
          waitingParts: 0
        };
        existing.activeJobs += ["closed", "cancelled"].includes(card.group) ? 0 : 1;
        existing.blockedJobs += card.group === "blocked" ? 1 : 0;
        existing.waitingParts += card.group === "waiting_parts" ? 1 : 0;
        load.set(assignment.staffUserId, existing);
      }
    }
    return [...load.values()].sort((a, b) => b.activeJobs - a.activeJobs);
  }

  private toWorkOrderCard(row: any): BranchWorkOrderCardDto {
    const group = this.groupForWorkOrder(row);
    return {
      id: row.id,
      number: row.number,
      customerName: row.customer.fullName,
      customerPhone: row.customer.phone,
      assetName: row.asset.name,
      assetIdentifier: row.asset.primaryIdentifier,
      category: this.categoryLabel(row.category),
      branchName: row.branch?.name || "No branch",
      status: row.status.toLowerCase(),
      statusLabel: row.statusLabel,
      group,
      priority: row.priority.toLowerCase() as any,
      assignedTechnicianNames: row.assignments.filter((assignment: any) => assignment.assignmentRole === "technician").map((assignment: any) => assignment.staffUser.name),
      customerDecisionState: this.customerDecisionState(row),
      partsState: this.partsState(row.partRequests),
      paymentState: this.paymentState(row),
      deliveryState: row.status === WorkOrderStatus.DELIVERED ? "delivered" : this.toDeliveryRow(row).deliveryAllowed ? "ready" : "blocked",
      nextAction: this.nextAction(row, group),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private groupForWorkOrder(row: any): BranchWorkOrderGroup {
    if (row.status === WorkOrderStatus.CANCELLED) return "cancelled";
    if (row.status === WorkOrderStatus.DELIVERED) return "closed";
    if (String(row.statusLabel || "").toLowerCase().includes("qc failed")) return "qc_failed";
    if (row.tasks.some((task: any) => task.blockers.some((blocker: any) => !blocker.resolved))) return "blocked";
    if (this.partsState(row.partRequests) === "waiting_manager" || ["on_the_way", "arrived", "return_pending", "unavailable"].includes(this.partsState(row.partRequests))) return "waiting_parts";
    if (row.status === WorkOrderStatus.PAYMENT_PENDING || this.paymentState(row) === "pending" || this.paymentState(row) === "partial") return "payment_pending";
    if (row.status === WorkOrderStatus.READY_FOR_DELIVERY) return "ready_delivery";
    if (row.status === WorkOrderStatus.READY_FOR_QC) return "ready_qc";
    if (row.status === WorkOrderStatus.AWAITING_CUSTOMER_APPROVAL) return "waiting_customer";
    if (row.status === WorkOrderStatus.INSPECTION) return "under_inspection";
    if (row.status === WorkOrderStatus.IN_PROGRESS) return this.customerDecisionState(row) === "responded" ? "approved_for_work" : "in_progress";
    return "registered";
  }

  private nextAction(row: any, group: BranchWorkOrderGroup) {
    if (this.customerDecisionState(row) === "critical_rejected") return "Escalate critical customer rejection";
    const labels: Record<BranchWorkOrderGroup, string> = {
      registered: "Assign technician",
      under_inspection: "Watch inspection output",
      waiting_customer: "Send reminder or call customer",
      approved_for_work: "Monitor technician execution",
      in_progress: "Monitor technician execution",
      waiting_parts: "Follow inventory request",
      blocked: "Escalate blocker",
      ready_team_review: "Follow team leader review",
      ready_qc: "Follow QC readiness",
      qc_failed: "Open rework follow-up",
      ready_delivery: "Check handover readiness",
      payment_pending: "Review delivery lock",
      closed: "No action",
      cancelled: "No action"
    };
    return labels[group];
  }

  private customerDecisionState(row: any): BranchWorkOrderCardDto["customerDecisionState"] {
    const requests = row.decisionRequests || [];
    if (requests.some((request: any) => request.items.some((item: any) => item.criticalWarningRequired && item.decisionStatus === DecisionItemStatus.REJECTED))) return "critical_rejected";
    if (requests.some((request: any) => request.status === DecisionRequestStatus.RESPONDED)) return "responded";
    if (requests.some((request: any) => request.status === DecisionRequestStatus.DRAFT)) return "draft";
    if (requests.some((request: any) => [DecisionRequestStatus.SENT, DecisionRequestStatus.VIEWED].includes(request.status))) return "waiting";
    return "none";
  }

  private partsState(requests: Array<{ status: PartRequestStatus }>): BranchWorkOrderCardDto["partsState"] {
    if (!requests.length) return "none";
    if (requests.some((request) => request.status === PartRequestStatus.RETURN_REQUESTED)) return "return_pending";
    if (requests.some((request) => isOneOf(request.status, PartRequestStatus.RETURN_ACCEPTED, PartRequestStatus.RETURNED_TO_STOCK))) return "returned";
    if (requests.some((request) => request.status === PartRequestStatus.USED)) return "used";
    if (requests.some((request) => request.status === PartRequestStatus.RECEIVED_BY_TECHNICIAN)) return "received";
    if (requests.some((request) => request.status === PartRequestStatus.ARRIVED)) return "arrived";
    if (requests.some((request) => isOneOf(request.status, PartRequestStatus.ISSUED, PartRequestStatus.IN_TRANSIT))) return "on_the_way";
    if (requests.some((request) => request.status === PartRequestStatus.REJECTED)) return "rejected";
    if (requests.some((request) => isOneOf(request.status, PartRequestStatus.UNAVAILABLE, PartRequestStatus.WAITING_SUPPLIER, PartRequestStatus.WAITING_TRANSFER))) return "unavailable";
    return "waiting_manager";
  }

  private paymentState(row: any): BranchWorkOrderCardDto["paymentState"] {
    const balance = Number(row.balance || 0);
    const paid = Number(row.paid || 0);
    const total = Number(row.total || 0);
    if (total <= 0 && !row.invoices?.length) return "not_started";
    if (balance <= 0) return "paid";
    if (paid > 0) return "partial";
    return "pending";
  }

  private toDeliveryRow(row: any): BranchDeliveryRowDto {
    const decisionLock = ["draft", "waiting", "critical_rejected"].includes(this.customerDecisionState(row));
    const partsState = this.partsState(row.partRequests || []);
    const partsLock = ["waiting_manager", "on_the_way", "arrived", "return_pending", "unavailable"].includes(partsState);
    const blockerLock = row.tasks?.some((task: any) => task.blockers.some((blocker: any) => !blocker.resolved)) || false;
    const paymentState = this.paymentState(row);
    const paymentLock = paymentState === "pending" || paymentState === "partial";
    const reasons = [
      decisionLock ? "Customer decision pending or critical rejection exists" : "",
      partsLock ? "Parts lifecycle is not resolved" : "",
      blockerLock ? "Open technician blocker exists" : "",
      paymentLock ? "Payment is not clear" : ""
    ].filter(Boolean);
    const latestInvoice = row.invoices?.[0];
    const notified = row.timelineEvents?.some((event: any) => ["branch.customer_notified", "branch.ready_for_delivery"].includes(event.source)) || false;
    return {
      workOrderId: row.id,
      workOrderNumber: row.number,
      customerName: row.customer.fullName,
      assetName: row.asset.name,
      assetIdentifier: row.asset.primaryIdentifier,
      statusLabel: row.statusLabel,
      paymentState,
      invoiceStatus: latestInvoice?.status?.toLowerCase() || "placeholder",
      paidAmount: Number(row.paid || latestInvoice?.paid || 0),
      remainingAmount: Number(row.balance || latestInvoice?.balance || 0),
      deliveryAllowed: reasons.length === 0,
      deliveryBlockedReasons: reasons,
      customerNotified: notified,
      handoverChecklist: [
        { label: "Customer decisions clear", ok: !decisionLock },
        { label: "Parts resolved", ok: !partsLock },
        { label: "No open blockers", ok: !blockerLock },
        { label: "Payment clear", ok: !paymentLock },
        { label: "Customer notified", ok: notified }
      ]
    };
  }

  private qcState(row: any): BranchWorkspaceDto["qc"]["state"] {
    const statusLabel = String(row.statusLabel || "").toLowerCase();
    if (statusLabel.includes("qc failed")) return "qc_failed";
    if (statusLabel.includes("rework")) return "rework";
    if (statusLabel.includes("team review")) return "awaiting_review";
    if (row.status === WorkOrderStatus.READY_FOR_QC) return "ready_qc";
    return "not_ready";
  }

  private toDecisionDto(row: any, workOrder: any): CustomerDecisionRequestDto {
    return {
      id: row.id,
      status: row.status.toLowerCase() as any,
      workOrderNumber: workOrder.number,
      assetName: row.asset?.name || workOrder.asset.name,
      assetIdentifier: row.asset?.primaryIdentifier || workOrder.asset.primaryIdentifier,
      customerName: row.customer?.fullName || workOrder.customer.fullName,
      branchName: workOrder.branch?.name || "Service branch",
      createdByName: row.createdBy?.name,
      whatsappMessage: row.whatsappMessage || undefined,
      secureLink: row.secureLink || undefined,
      customerNote: row.customerNote || undefined,
      sentAt: row.sentAt?.toISOString(),
      respondedAt: row.respondedAt?.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      items: [...row.items].sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((item: any) => this.toDecisionItemDto(item))
    };
  }

  private toDecisionItemDto(item: any): CustomerDecisionItemDto {
    return {
      id: item.id,
      title: item.title,
      customerExplanation: item.customerExplanation,
      importance: item.importance.toLowerCase() as any,
      estimatedPrice: Number(item.estimatedPrice),
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      laborPrice: Number(item.laborPrice),
      estimatedTotal: Number(item.estimatedTotal || item.estimatedPrice),
      priceLocked: item.priceLocked,
      decisionRequired: item.decisionRequired,
      criticalWarningRequired: item.criticalWarningRequired,
      criticalWarningText: item.criticalWarningText || undefined,
      decisionStatus: item.decisionStatus.toLowerCase() as any,
      warningAcknowledged: item.warningAcknowledged,
      customerDecisionNote: item.customerDecisionNote || undefined
    };
  }

  private toTimelineDto(event: any): CustomerTimelineEventDto {
    return {
      id: event.id,
      title: event.title,
      message: event.message,
      source: event.source,
      occurredAt: event.occurredAt.toISOString()
    };
  }

  private recentTargetIds(rows: any[]) {
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.id);
      for (const task of row.tasks) ids.add(task.id);
      for (const request of row.partRequests) ids.add(request.id);
      for (const decision of row.decisionRequests) ids.add(decision.id);
    }
    return [...ids];
  }

  private async createTimeline(workOrder: any, title: string, message: string, source: string, visibility: TimelineVisibility, decisionRequestId?: string) {
    return this.prisma.customerTimelineEvent.create({
      data: {
        tenantId: workOrder.tenantId,
        customerId: workOrder.customerId,
        assetId: workOrder.assetId,
        workOrderId: workOrder.id,
        decisionRequestId,
        visibility,
        title,
        message,
        source
      }
    });
  }

  private async audit(session: RequestSessionContext, action: string, targetType: string, targetId: string, reason: string, after?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorType: AuditActorType.TENANT_STAFF,
        actorId: session.userId,
        actorName: session.displayName,
        action,
        targetType,
        targetId,
        reason,
        after: after as Prisma.InputJsonValue | undefined
      }
    });
  }

  private requireTenant(session: RequestSessionContext) {
    if (!session.tenantId) throw new BadRequestException("Tenant scope is required.");
    return session.tenantId;
  }

  private categoryLabel(code: string): CategoryCode {
    if (code === PrismaCategoryCode.MOTORCYCLES) return "Motorcycles";
    if (code === PrismaCategoryCode.HEAVY_EQUIPMENT) return "Heavy Equipment";
    return "Cars";
  }

  private toPrismaCategory(label: CategoryCode): PrismaCategoryCode {
    if (label === "Motorcycles") return PrismaCategoryCode.MOTORCYCLES;
    if (label === "Heavy Equipment") return PrismaCategoryCode.HEAVY_EQUIPMENT;
    return PrismaCategoryCode.CARS;
  }

  private toSeverity(value?: string): Severity {
    const normalized = String(value || "normal").toUpperCase();
    if (normalized === "LOW") return Severity.LOW;
    if (normalized === "HIGH") return Severity.HIGH;
    if (normalized === "CRITICAL") return Severity.CRITICAL;
    return Severity.NORMAL;
  }
}
