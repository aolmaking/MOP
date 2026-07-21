import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditActorType,
  CategoryCode as PrismaCategoryCode,
  DecisionItemStatus,
  DecisionRequestStatus,
  PartRequestStatus,
  Prisma,
  ReturnRequestStatus,
  Severity,
  IssuedItemStatus,
  StockMovementType,
  TaskStatus,
  WorkOrderStatus
} from "@prisma/client";
import type {
  CategoryCode,
  DiagnosticCodeSuggestionDto,
  OperationNotificationTarget,
  OperationReportHookDto,
  QuickServiceOptionDto,
  TechnicianIssuedPartDto,
  TechnicianHomeDto,
  TechnicianJobCardDto,
  TechnicianJobGroup,
  TechnicianMyWorkDto,
  TechnicianPartRequestDto,
  TechnicianReturnRequestDto,
  TechnicianWorkCardDto
} from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { PrismaService } from "../../database/prisma.service";
import { OperationEventsService } from "../../operations/operation-events.service";
import { FinanceService } from "../finance/finance.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

const isOneOf = <T>(value: T, ...allowed: T[]) => allowed.includes(value);

@Injectable()
export class TechnicianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationEvents: OperationEventsService,
    private readonly finance: FinanceService
  ) {}

  async recordAction(session: RequestSessionContext, body: any) {
    const taskId = String(body?.taskId || "");
    if (!taskId) throw new BadRequestException("taskId is required.");

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        tenantId: session.tenantId,
        assignments: { some: { staffUserId: session.userId } }
      },
      include: { workOrder: { include: { asset: true } } }
    });
    if (!task) throw new NotFoundException("Task not found in assigned technician work.");

    const action = this.safeAction(body?.action);
    this.assertTechnicianActionPermission(session, action);
    const detail = String(body?.detail || action).slice(0, 300);
    let auditEvent = this.auditAction(action);
    let output: Record<string, unknown> = {
      branchId: task.branchId,
      workOrderId: task.workOrderId,
      taskId,
      technicianId: session.userId,
      category: this.categoryLabel(task.category),
      action,
      related: body?.related || null,
      output_queues: this.actionOutputQueues(action)
    };

    if (action === "blocker.reported") {
      await this.prisma.taskBlocker.create({
        data: {
          taskId,
          reason: String(body?.reason || detail || "Technician blocker").slice(0, 120)
        }
      });
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.BLOCKED }
      });
      output = {
        ...output,
        output_queues: this.blockerQueues(String(body?.related?.reason || body?.reason || detail)),
        blocker_reason: String(body?.related?.reason || body?.reason || detail)
      };
    }

    if (action === "task.started") {
      await this.prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.IN_PROGRESS } });
      await this.prisma.workOrder.update({
        where: { id: task.workOrderId },
        data: { status: WorkOrderStatus.IN_PROGRESS, statusLabel: "Technician Started Work" }
      });
      output = {
        ...output,
        work_order_update_hook: { status: "in_progress", reason: "technician_started_task" }
      };
    }

    if (action === "task.paused") {
      output = {
        ...output,
        pause_recorded: true,
        work_order_update_hook: { status: "in_progress", reason: "technician_paused_task" }
      };
    }

    if (action === "inspection.saved") {
      await this.prisma.task.update({ where: { id: taskId }, data: { status: TaskStatus.IN_PROGRESS } });
      output = {
        ...output,
        inspection_saved: true,
        finish_gate_hook: { inspectionRequiredDone: true }
      };
    }

    if (action === "fault.created" || action === "diagnostic_code.added" || action === "note.created" || action === "customer_visible_note.created") {
      output = {
        ...output,
        work_order_timeline_hook: {
          visibility: action === "customer_visible_note.created" ? "customer_visible" : "internal",
          reason: detail
        }
      };
    }

    if (action === "part.requested") {
      output = {
        ...output,
        ...(await this.createStructuredPartRequest(session, task, body, PartRequestStatus.PENDING_WAREHOUSE))
      };
    }

    if (action === "part.marked_used") {
      output = {
        ...output,
        ...(await this.markIssuedPartUsed(session, task, body))
      };
    }

    if (action === "part.arrived") {
      output = {
        ...output,
        ...(await this.confirmPartArrived(session, task, body))
      };
    }

    if (action === "part.return_requested") {
      output = {
        ...output,
        ...(await this.requestUnusedPartReturn(session, task, body))
      };
    }

    if (action === "quick_service.started") {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.IN_PROGRESS }
      });
      await this.prisma.workOrder.update({
        where: { id: task.workOrderId },
        data: { status: WorkOrderStatus.IN_PROGRESS, statusLabel: "Quick Service In Progress" }
      });
      output = {
        ...output,
        work_order_update_hook: { status: "in_progress", reason: "quick_service_started" }
      };
    }

    if (action === "quick_service.completed") {
      const finish = await this.applyFinishGate(session, taskId, "quick_service");
      auditEvent = finish.auditEvent;
      output = { ...output, ...finish.output };
    }

    if (["task.completed", "task.sent_to_team_review", "task.sent_to_qc", "rework.corrected"].includes(action)) {
      const finish = await this.applyFinishGate(session, taskId, action);
      auditEvent = finish.auditEvent;
      output = { ...output, ...finish.output };
    }

    if (action === "rework.feedback.viewed") {
      output = {
        ...output,
        rework_feedback_viewed: true,
        output_queues: ["team_leader", "work_order_timeline"]
      };
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorType: AuditActorType.TENANT_STAFF,
        actorId: session.userId,
        actorName: session.displayName,
        action: auditEvent,
        targetType: "task",
        targetId: taskId,
        reason: detail,
        after: output as Prisma.InputJsonValue
      }
    });
    await this.emitTechnicianOperation(session, task, action, auditEvent, detail, output);

    return { status: String(output.status || "recorded"), action, taskId, output };
  }

  async home(session: RequestSessionContext): Promise<TechnicianHomeDto> {
    const jobs = await this.jobs(session);
    return {
      currentJob: jobs[0],
      counts: {
        todayJobs: jobs.length,
        waitingCustomer: jobs.filter((job) => job.group === "waiting_customer").length,
        waitingParts: jobs.filter((job) => job.group === "waiting_parts").length,
        partsOnTheWay: jobs.filter((job) => job.partsState === "on_the_way").length,
        partsArrived: jobs.filter((job) => job.partsState === "arrived").length,
        returnsPending: jobs.filter((job) => job.partsState === "return_pending").length,
        rework: jobs.filter((job) => job.group === "returned_for_rework").length,
        blocked: jobs.filter((job) => job.group === "blocked").length
      },
      quickServices: this.quickServices()
    };
  }

  async myWork(session: RequestSessionContext): Promise<TechnicianMyWorkDto> {
    const jobs = await this.jobs(session);
    const groups: Array<{ id: TechnicianJobGroup; label: string; jobs: TechnicianJobCardDto[] }> = [
      { id: "active_now", label: "Active Now", jobs: [] },
      { id: "due_today", label: "Due Today", jobs: [] },
      { id: "waiting_customer", label: "Waiting Customer", jobs: [] },
      { id: "waiting_parts", label: "Waiting Parts", jobs: [] },
      { id: "blocked", label: "Blocked", jobs: [] },
      { id: "returned_for_rework", label: "Returned for Rework", jobs: [] },
      { id: "completed_today", label: "Completed Today", jobs: [] }
    ];
    for (const job of jobs) {
      const group = groups.find((row) => row.id === job.group);
      if (group) group.jobs.push(job);
    }
    return { groups };
  }

  async workCard(session: RequestSessionContext, taskId?: string): Promise<TechnicianWorkCardDto> {
    const jobs = await this.jobs(session);
    const job = jobs.find((row) => row.taskId === taskId) || jobs[0];
    if (!job) throw new NotFoundException("No assigned technician job found.");

    const task = await this.prisma.task.findUnique({
      where: { id: job.taskId },
      include: { workOrder: true, subtasks: true, partRequests: { include: { item: true, warehouse: true, issuedItems: true } } }
    });
    const suggestedParts = await this.prisma.inventoryItem.findMany({
      where: {
        tenantId: session.tenantId,
        compatibleCategories: { has: this.toPrismaCategory(job.category) },
        workOrderUsable: true
      },
      include: { warehouse: true },
      take: 6
    });
    const decisionRequests = await this.prisma.customerDecisionRequest.findMany({
      where: {
        tenantId: session.tenantId,
        workOrderId: job.workOrderId,
        status: { in: [DecisionRequestStatus.DRAFT, DecisionRequestStatus.SENT, DecisionRequestStatus.VIEWED, DecisionRequestStatus.RESPONDED] }
      },
      include: {
        tenant: true,
        workOrder: { include: { branch: true } },
        task: true,
        asset: true,
        customer: true,
        createdBy: true,
        items: true
      }
    });
    const blockers = await this.prisma.taskBlocker.findMany({
      where: { taskId: job.taskId },
      orderBy: { createdAt: "desc" }
    });
    const pendingDecisions = decisionRequests.filter((request) => isOneOf(request.status, DecisionRequestStatus.DRAFT, DecisionRequestStatus.SENT, DecisionRequestStatus.VIEWED));
    const criticalRejectedItemExists = decisionRequests.some((request) =>
      request.items.some((item) => item.criticalWarningRequired && item.decisionStatus === DecisionItemStatus.REJECTED)
    );
    const inspectionSavedCount = task ? await this.prisma.auditLog.count({
      where: { targetType: "task", targetId: task.id, action: "inspection.saved" }
    }) : 0;
    const inspectionRequiredDone = task ? this.inspectionRequiredDone(task, inspectionSavedCount) : false;
    const historyRows = await this.prisma.customerTimelineEvent.findMany({
      where: {
        tenantId: session.tenantId,
        assetId: task?.assetId,
        visibility: "CUSTOMER_VISIBLE"
      },
      include: {
        decisionRequest: {
          include: {
            tenant: true,
            workOrder: { include: { branch: true } },
            task: true,
            asset: true,
            customer: true,
            createdBy: true,
            items: true
          }
        }
      },
      orderBy: { occurredAt: "desc" },
      take: 8
    });
    const teamLeaderReview = await this.prisma.controlSetting.findFirst({
      where: { tenantId: session.tenantId, key: "teamLeaderReviewPolicy" }
    });
    const finishOutcome: TechnicianWorkCardDto["finishOutcome"] = String(teamLeaderReview?.value || "All").toLowerCase() === "off" ? "qc" : "team_review";

    return {
      job,
      quickServices: this.quickServices().filter((service) => service.category === job.category),
      suggestedParts: suggestedParts.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        category: item.catalogCategory,
        compatibleCategories: item.compatibleCategories.map((code) => this.categoryLabel(code)),
        warehouseId: item.warehouseId,
        warehouseName: item.warehouse.name,
        stock: item.stock,
        minStock: item.minStock,
        status: item.status.toLowerCase(),
        price: Number(item.price)
      })),
      pendingDecisions: pendingDecisions.map((row) => ({
        id: row.id,
        status: row.status.toLowerCase() as any,
        workOrderNumber: row.workOrder.number,
        assetName: row.asset.name,
        assetIdentifier: row.asset.primaryIdentifier,
        customerName: row.customer.fullName,
        branchName: row.workOrder.branch?.name || "Service branch",
        createdByName: row.createdBy?.name,
        whatsappMessage: row.whatsappMessage || undefined,
        secureLink: row.secureLink || undefined,
        expiresAt: row.expiresAt.toISOString(),
        sentAt: row.sentAt?.toISOString(),
        respondedAt: row.respondedAt?.toISOString(),
        items: row.items.map((item) => ({
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
          warningAcknowledged: item.warningAcknowledged
        }))
      })),
      partRequests: (task?.partRequests || []).map((request) => ({
        id: request.id,
        itemId: request.itemId,
        itemName: request.item.name,
        sku: request.item.sku,
        qty: request.qty,
        status: this.technicianPartStatus(request.status),
        inventoryStatus: request.status.toLowerCase(),
        requestedAt: request.createdAt.toISOString(),
        warehouseName: request.warehouse.name,
        urgency: this.severityLabel(request.urgency),
        reason: request.reason || undefined
      })),
      issuedParts: (task?.partRequests || []).flatMap((request) =>
        request.issuedItems.map((issued) => ({
          id: issued.id,
          requestId: request.id,
          itemId: request.itemId,
          itemName: request.item.name,
          qty: issued.qty,
          status: this.technicianIssuedStatus(issued.status),
          issuedAt: issued.issuedAt.toISOString(),
          warehouseName: request.warehouse.name
        }))
      ),
      returnRequests: await this.returnRequestsForTask(task?.id),
      diagnosticCodes: [this.diagnosticCode(this.defaultDiagnosticCode(job.category))],
      blockers: blockers.map((blocker) => ({
        id: blocker.id,
        reason: blocker.reason,
        urgency: blocker.reason.toLowerCase().includes("safety") ? "critical" : "normal",
        resolved: blocker.resolved
      })),
      history: historyRows.map((row) => ({
        id: row.id,
        title: row.title,
        message: row.message,
        source: row.source,
        occurredAt: row.occurredAt.toISOString(),
        decisionRequest: row.decisionRequest
          ? {
              id: row.decisionRequest.id,
              status: row.decisionRequest.status.toLowerCase() as any,
              workOrderNumber: row.decisionRequest.workOrder.number,
              assetName: row.decisionRequest.asset.name,
              assetIdentifier: row.decisionRequest.asset.primaryIdentifier,
              customerName: row.decisionRequest.customer.fullName,
              branchName: row.decisionRequest.workOrder.branch?.name || "Service branch",
              createdByName: row.decisionRequest.createdBy?.name,
              whatsappMessage: row.decisionRequest.whatsappMessage || undefined,
              secureLink: row.decisionRequest.secureLink || undefined,
              expiresAt: row.decisionRequest.expiresAt.toISOString(),
              sentAt: row.decisionRequest.sentAt?.toISOString(),
              respondedAt: row.decisionRequest.respondedAt?.toISOString(),
              items: row.decisionRequest.items.map((item) => ({
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
                warningAcknowledged: item.warningAcknowledged
              }))
            }
          : undefined
      })),
      reworkFeedback: task?.status === "READY_FOR_QC"
        ? [
            {
              returnedBy: "Team Leader",
              returnedDate: new Date().toISOString(),
              reason: "Brake fluid test not confirmed",
              requiredCorrection: "Test brake fluid again and attach result."
            }
          ]
        : [],
      finishChecks: {
        partsUsed: Boolean(task && (Number(task.partsTotal) > 0 || task.partRequests.some((request) => request.status === PartRequestStatus.USED))),
        partRequestsPending: Boolean(task?.partRequests.some((request) =>
          isOneOf(request.status, PartRequestStatus.REQUESTED, PartRequestStatus.PENDING_WAREHOUSE, PartRequestStatus.WAREHOUSE_REVIEWING, PartRequestStatus.APPROVED, PartRequestStatus.WAITING_TRANSFER, PartRequestStatus.WAITING_SUPPLIER)
        )),
        issuedPartsNotReceived: Boolean(task?.partRequests.some((request) =>
          isOneOf(request.status, PartRequestStatus.ISSUED, PartRequestStatus.IN_TRANSIT, PartRequestStatus.ARRIVED)
        )),
        receivedPartsNotResolved: Boolean(task?.partRequests.some((request) => request.status === PartRequestStatus.RECEIVED_BY_TECHNICIAN)),
        returnPendingInventoryReview: Boolean(task?.partRequests.some((request) => request.status === PartRequestStatus.RETURN_REQUESTED)),
        customerDecisionsPending: pendingDecisions.length > 0,
        blockersOpen: blockers.some((blocker) => !blocker.resolved),
        inspectionRequiredDone,
        criticalRejectedItemExists,
        requiredNotesCompleted: true,
        timeTrackingCompleted: true
      },
      finishOutcome
    };
  }

  diagnosticCode(code: string): DiagnosticCodeSuggestionDto {
    const normalized = (code || "P0301").trim().toUpperCase();
    const catalog: Record<string, DiagnosticCodeSuggestionDto> = {
      P0301: {
        code: "P0301",
        system: "Engine",
        possibleIssue: "Cylinder 1 misfire",
        suggestedChecks: ["Spark plug", "Ignition coil", "Injector", "Compression"],
        suggestedFix: "Inspect ignition system first.",
        videoLink: "Video guide link placeholder"
      },
      P0420: {
        code: "P0420",
        system: "Emissions",
        possibleIssue: "Catalyst efficiency below threshold",
        suggestedChecks: ["Oxygen sensor", "Exhaust leak", "Catalytic converter"],
        suggestedFix: "Check upstream/downstream oxygen sensor readings before replacement.",
        videoLink: "Video guide link placeholder"
      },
      P0171: {
        code: "P0171",
        system: "Fuel / Air",
        possibleIssue: "System too lean",
        suggestedChecks: ["Vacuum leak", "MAF sensor", "Fuel pressure"],
        suggestedFix: "Inspect air/fuel system before replacing parts.",
        videoLink: "Video guide link placeholder"
      },
      ECU01: {
        code: "ECU01",
        system: "Motorcycle ECU",
        possibleIssue: "Generic motorcycle ECU fault placeholder",
        suggestedChecks: ["Spark plug", "Battery voltage", "Injector connector", "Throttle sensor"],
        suggestedFix: "Start with ignition and electrical checks.",
        videoLink: "Video guide link placeholder"
      },
      HYD01: {
        code: "HYD01",
        system: "Hydraulic",
        possibleIssue: "Hydraulic pressure fault placeholder",
        suggestedChecks: ["Hydraulic hose", "Filter restriction", "Pump pressure", "Safety lockout"],
        suggestedFix: "Apply safety lockout, then inspect hose/filter path.",
        videoLink: "Video guide link placeholder"
      }
    };
    return catalog[normalized] || {
      code: normalized,
      system: "Unknown",
      possibleIssue: "No local suggestion yet",
      suggestedChecks: ["Confirm code", "Check service manual", "Run basic inspection"],
      suggestedFix: "Record the code and continue with structured inspection.",
      videoLink: "Video guide link placeholder"
    };
  }

  private async jobs(session: RequestSessionContext): Promise<TechnicianJobCardDto[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId: session.tenantId,
        assignments: { some: { staffUserId: session.userId } }
      },
      include: {
        workOrder: { include: { asset: true, customer: true, partRequests: true, decisionRequests: { include: { items: true } } } },
        assignments: { include: { staffUser: true } },
        blockers: true
      },
      orderBy: { updatedAt: "desc" }
    });
    return tasks.map((task) => {
      const group = this.groupForTask(task);
      return {
        id: `${task.workOrderId}:${task.id}`,
        workOrderId: task.workOrderId,
        workOrderNumber: task.workOrder.number,
        taskId: task.id,
        assetName: task.workOrder.asset.name,
        assetIdentifier: task.workOrder.asset.primaryIdentifier,
        category: this.categoryLabel(task.category),
        categoryIcon: this.categoryIcon(task.category),
        taskTitle: task.title,
        customerComplaint: task.workOrder.complaint,
        status: task.status.toLowerCase(),
        statusTone: this.statusTone(group),
        nextAction: this.nextAction(group),
        priority: task.severity.toLowerCase() as any,
        assignedTechnicianNames: task.assignments.map((assignment) => assignment.staffUser.name),
        customerDecisionState: this.customerDecisionState(task.workOrder.status, task.workOrder.decisionRequests),
        partsState: this.jobPartsState(task.workOrder.partRequests),
        blockerState: task.blockers?.some((blocker: any) => !blocker.resolved && blocker.reason.toLowerCase().includes("safety")) ? "critical" : (task.blockers?.some((blocker: any) => !blocker.resolved) ? "open" : "none"),
        group
      };
    });
  }

  private groupForTask(task: any): TechnicianJobGroup {
    if (task.status === "BLOCKED") return "blocked";
    if (task.status === "COMPLETED") return "completed_today";
    if (task.workOrder.status === "AWAITING_CUSTOMER_APPROVAL") return "waiting_customer";
    if (task.workOrder.status === "WAITING_FOR_PARTS" || task.workOrder.partRequests.some((req: any) => req.status !== "USED")) return "waiting_parts";
    if (task.status === "READY_FOR_QC") return "returned_for_rework";
    if (task.status === "IN_PROGRESS") return "active_now";
    return "due_today";
  }

  private nextAction(group: TechnicianJobGroup) {
    const labels: Record<TechnicianJobGroup, string> = {
      active_now: "Continue the current step",
      due_today: "Open and start when ready",
      waiting_customer: "Customer decision is pending",
      waiting_parts: "Wait for warehouse update",
      blocked: "Blocker needs follow-up",
      returned_for_rework: "Review rework feedback",
      completed_today: "Done today"
    };
    return labels[group];
  }

  private customerDecisionState(
    workOrderStatus: string,
    requests: Array<{ status: DecisionRequestStatus; items: Array<{ criticalWarningRequired: boolean; decisionStatus: DecisionItemStatus }> }>
  ): TechnicianJobCardDto["customerDecisionState"] {
    if (requests.some((request) => request.items.some((item) => item.criticalWarningRequired && item.decisionStatus === DecisionItemStatus.REJECTED))) {
      return "critical_rejected";
    }
    if (requests.some((request) => request.status === DecisionRequestStatus.RESPONDED)) return "responded";
    if (requests.some((request) => isOneOf(request.status, DecisionRequestStatus.DRAFT, DecisionRequestStatus.SENT, DecisionRequestStatus.VIEWED))) {
      return workOrderStatus === "AWAITING_CUSTOMER_APPROVAL" ? "waiting" : "draft";
    }
    return "none";
  }

  private jobPartsState(requests: Array<{ status: PartRequestStatus }>): TechnicianJobCardDto["partsState"] {
    if (!requests.length) return "none";
    if (requests.some((request) => request.status === PartRequestStatus.RETURN_REQUESTED)) return "return_pending";
    if (requests.some((request) => request.status === PartRequestStatus.RETURNED_TO_STOCK || request.status === PartRequestStatus.RETURN_ACCEPTED)) return "returned";
    if (requests.some((request) => request.status === PartRequestStatus.USED)) return "used";
    if (requests.some((request) => request.status === PartRequestStatus.RECEIVED_BY_TECHNICIAN)) return "received";
    if (requests.some((request) => request.status === PartRequestStatus.ARRIVED)) return "arrived";
    if (requests.some((request) => isOneOf(request.status, PartRequestStatus.ISSUED, PartRequestStatus.IN_TRANSIT))) return "on_the_way";
    if (requests.some((request) => request.status === PartRequestStatus.REJECTED)) return "rejected";
    if (requests.some((request) => isOneOf(request.status, PartRequestStatus.UNAVAILABLE, PartRequestStatus.WAITING_SUPPLIER, PartRequestStatus.WAITING_TRANSFER))) return "unavailable";
    return "waiting_manager";
  }

  private technicianPartStatus(status: PartRequestStatus): TechnicianPartRequestDto["status"] {
    if (isOneOf(status, PartRequestStatus.REQUESTED, PartRequestStatus.PENDING_WAREHOUSE, PartRequestStatus.WAREHOUSE_REVIEWING)) return "pending";
    if (status === PartRequestStatus.APPROVED) return "approved";
    if (isOneOf(status, PartRequestStatus.ISSUED, PartRequestStatus.IN_TRANSIT)) return "on_the_way";
    if (status === PartRequestStatus.ARRIVED) return "arrived";
    if (status === PartRequestStatus.RECEIVED_BY_TECHNICIAN) return "received";
    if (status === PartRequestStatus.USED) return "used";
    if (status === PartRequestStatus.RETURN_REQUESTED) return "return_pending";
    if (isOneOf(status, PartRequestStatus.RETURN_ACCEPTED, PartRequestStatus.RETURNED_TO_STOCK)) return "returned";
    if (status === PartRequestStatus.REJECTED || status === PartRequestStatus.RETURN_REJECTED) return "rejected";
    if (status === PartRequestStatus.WAITING_SUPPLIER) return "waiting_supplier";
    if (status === PartRequestStatus.WAITING_TRANSFER) return "waiting_transfer";
    return "unavailable";
  }

  private technicianIssuedStatus(status: IssuedItemStatus): TechnicianIssuedPartDto["status"] {
    if (isOneOf(status, IssuedItemStatus.ISSUED, IssuedItemStatus.IN_TRANSIT)) return "on_the_way";
    if (status === IssuedItemStatus.ARRIVED) return "arrived";
    if (status === IssuedItemStatus.RECEIVED_BY_TECHNICIAN) return "received";
    if (status === IssuedItemStatus.USED) return "used";
    if (status === IssuedItemStatus.RETURN_REQUESTED) return "return_pending";
    return "returned";
  }

  private technicianReturnStatus(status: ReturnRequestStatus): TechnicianReturnRequestDto["status"] {
    if (status === ReturnRequestStatus.ACCEPTED_TO_STOCK) return "returned";
    if (status === ReturnRequestStatus.ACCEPTED_DAMAGED) return "damaged";
    if (status === ReturnRequestStatus.REJECTED) return "rejected";
    return "return_pending";
  }

  private severityLabel(value: Severity): "normal" | "high" | "critical" {
    if (value === Severity.CRITICAL) return "critical";
    if (value === Severity.HIGH) return "high";
    return "normal";
  }

  private async createStructuredPartRequest(session: RequestSessionContext, task: any, body: any, status: PartRequestStatus) {
    const itemId = String(body?.related?.itemId || body?.itemId || "");
    if (!itemId) throw new BadRequestException("itemId is required for part actions.");

    const qty = Math.max(1, Number(body?.related?.qty || body?.qty || 1));
    const urgency = this.urgency(body?.related?.urgency || body?.urgency);
    const reason = String(body?.related?.reason || body?.detail || "Technician part action.").slice(0, 200);
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, tenantId: session.tenantId },
      include: { warehouse: true }
    });
    if (!item) throw new NotFoundException("Inventory item not found in current tenant.");

    const total = Number(item.price) * qty;
    const requestData = {
      tenantId: task.tenantId,
      branchId: task.branchId,
      workOrderId: task.workOrderId,
      taskId: task.id,
      technicianId: session.userId,
      itemId: item.id,
      warehouseId: item.warehouseId,
      preferredWarehouseId: item.warehouseId,
      qty,
      urgency: urgency === "critical" ? Severity.CRITICAL : urgency === "high" ? Severity.HIGH : Severity.NORMAL,
      reason,
      status,
      total
    };

    let partRequest: { id: string; createdAt: Date } | undefined;

    let stockMovementId: string | undefined;
    if (status === PartRequestStatus.PENDING_WAREHOUSE) {
      partRequest = await this.prisma.partRequest.create({ data: requestData });
      await this.prisma.workOrder.update({
        where: { id: task.workOrderId },
        data: {
          status: WorkOrderStatus.WAITING_FOR_PARTS,
          statusLabel: "Waiting for Warehouse Issue",
          customerVisible: true,
          customerSummary: "We are waiting for a required part. The branch and technician will continue once it is issued."
        }
      });
    }

    if (status === PartRequestStatus.USED) {
      await this.prisma.warehouseStockBalance.upsert({
        where: { warehouseId_itemId: { warehouseId: item.warehouseId, itemId: item.id } },
        create: {
          tenantId: task.tenantId,
          warehouseId: item.warehouseId,
          itemId: item.id,
          availableQty: item.stock,
          lowThreshold: item.minStock,
          criticalThreshold: item.criticalStock
        },
        update: {}
      });
      const result = await this.prisma.$transaction(async (tx) => {
        const balance = await tx.warehouseStockBalance.findUnique({
          where: { warehouseId_itemId: { warehouseId: item.warehouseId, itemId: item.id } }
        });
        const beforeQty = balance?.availableQty ?? item.stock;
        if (beforeQty < qty) throw new BadRequestException("Cannot mark part used because available stock is lower than requested quantity.");

        const balanceUpdate = await tx.warehouseStockBalance.updateMany({
          where: { tenantId: task.tenantId, warehouseId: item.warehouseId, itemId: item.id, availableQty: { gte: qty } },
          data: { availableQty: { decrement: qty } }
        });
        if (balanceUpdate.count !== 1) throw new BadRequestException("Stock changed while recording usage. Please retry.");

        const itemUpdate = await tx.inventoryItem.updateMany({
          where: { id: item.id, stock: { gte: qty } },
          data: { stock: { decrement: qty } }
        });
        if (itemUpdate.count !== 1) throw new BadRequestException("Inventory item stock changed while recording usage. Please retry.");

        const created = await tx.partRequest.create({ data: requestData });
        const movement = await tx.stockMovement.create({
          data: {
            tenantId: task.tenantId,
            warehouseId: item.warehouseId,
            itemId: item.id,
            type: StockMovementType.WORK_ORDER_CONSUMPTION,
            qty: -qty,
            beforeQty,
            afterQty: beforeQty - qty,
            source: task.workOrderId,
            reason,
            createdBy: session.userId
          }
        });
        await tx.task.update({
          where: { id: task.id },
          data: { partsTotal: { increment: total } }
        });
        return { partRequest: created, movement };
      });
      partRequest = result.partRequest;
      stockMovementId = result.movement.id;
      await this.finance.syncInventoryLine(session, {
        workOrderId: task.workOrderId,
        itemId: item.id,
        title: item.name,
        quantity: qty,
        unitPrice: Number(item.price),
        sourceId: partRequest.id,
        action: "used"
      });
    }
    if (!partRequest) throw new BadRequestException("Unsupported part request status.");

    return {
      output_queues: status === PartRequestStatus.USED ? ["inventory_manager", "team_leader"] : ["inventory_manager", "branch_manager"],
      part_request_contract: {
        request_id: partRequest.id,
        work_order_id: task.workOrderId,
        task_id: task.id,
        technician_id: session.userId,
        branch_id: task.branchId,
        category: this.categoryLabel(task.category),
        asset_identifier: task.workOrder.asset.primaryIdentifier,
        item_id: item.id,
        item_name: item.name,
        qty,
        urgency,
        reason,
        status: status === PartRequestStatus.USED ? "used" : "pending_warehouse",
        requested_at: partRequest.createdAt.toISOString()
      },
      stock_movement_id: stockMovementId,
      running_invoice_hook: status === PartRequestStatus.USED ? { source: "work_order_part_usage", amount: total, status: "prepared" } : undefined
    };
  }

  private async confirmPartArrived(session: RequestSessionContext, task: any, body: any) {
    const issuedItemId = String(body?.related?.issuedItemId || body?.issuedItemId || "");
    if (!issuedItemId) throw new BadRequestException("issuedItemId is required to confirm Arrived.");
    const issued = await this.prisma.issuedItem.findFirst({
      where: { id: issuedItemId, tenantId: session.tenantId, taskId: task.id, technicianId: session.userId },
      include: { request: true, item: true }
    });
    if (!issued) throw new NotFoundException("Issued part not found for this technician task.");
    await this.prisma.$transaction(async (tx) => {
      await tx.issuedItem.update({
        where: { id: issued.id },
        data: { status: IssuedItemStatus.RECEIVED_BY_TECHNICIAN, technicianReceivedAt: new Date() }
      });
      await tx.partRequest.update({
        where: { id: issued.requestId },
        data: { status: PartRequestStatus.RECEIVED_BY_TECHNICIAN, receivedAt: new Date() }
      });
      await tx.stockMovement.create({
        data: {
          tenantId: task.tenantId,
          warehouseId: issued.warehouseId,
          itemId: issued.itemId,
          type: StockMovementType.ARRIVED_CONFIRMED,
          qty: issued.qty,
          beforeQty: issued.qty,
          afterQty: issued.qty,
          source: task.workOrderId,
          reason: "Technician confirmed part arrived.",
          createdBy: session.userId
        }
      });
    });
    return {
      output_queues: ["inventory_manager", "work_order_timeline"],
      issued_item_id: issued.id,
      part_request_id: issued.requestId,
      technician_status: "received"
    };
  }

  private async markIssuedPartUsed(session: RequestSessionContext, task: any, body: any) {
    const issuedItemId = String(body?.related?.issuedItemId || body?.issuedItemId || "");
    if (!issuedItemId) return this.createStructuredPartRequest(session, task, body, PartRequestStatus.USED);
    const issued = await this.prisma.issuedItem.findFirst({
      where: { id: issuedItemId, tenantId: session.tenantId, taskId: task.id, technicianId: session.userId },
      include: { request: true, item: true }
    });
    if (!issued) throw new NotFoundException("Issued part not found for this technician task.");
    const total = Number(issued.item.price) * issued.qty;
    const balance = await this.prisma.warehouseStockBalance.findUnique({
      where: { warehouseId_itemId: { warehouseId: issued.warehouseId, itemId: issued.itemId } }
    });
    const beforeIssuedQty = balance?.issuedQty ?? issued.qty;
    await this.prisma.$transaction(async (tx) => {
      await tx.issuedItem.update({ where: { id: issued.id }, data: { status: IssuedItemStatus.USED, usedAt: new Date() } });
      await tx.partRequest.update({ where: { id: issued.requestId }, data: { status: PartRequestStatus.USED, usedAt: new Date() } });
      await tx.task.update({ where: { id: task.id }, data: { partsTotal: { increment: total } } });
      await tx.warehouseStockBalance.upsert({
        where: { warehouseId_itemId: { warehouseId: issued.warehouseId, itemId: issued.itemId } },
        create: { tenantId: task.tenantId, warehouseId: issued.warehouseId, itemId: issued.itemId, issuedQty: 0, lowThreshold: issued.item.minStock, criticalThreshold: issued.item.criticalStock },
        update: { issuedQty: Math.max(0, beforeIssuedQty - issued.qty) }
      });
      await tx.stockMovement.create({
        data: {
          tenantId: task.tenantId,
          warehouseId: issued.warehouseId,
          itemId: issued.itemId,
          type: StockMovementType.USED,
          qty: -issued.qty,
          beforeQty: beforeIssuedQty,
          afterQty: Math.max(0, beforeIssuedQty - issued.qty),
          source: task.workOrderId,
          reason: "Technician marked issued part as used.",
          createdBy: session.userId
        }
      });
    });
    await this.finance.syncInventoryLine(session, {
      workOrderId: task.workOrderId,
      itemId: issued.itemId,
      title: issued.item.name,
      quantity: issued.qty,
      unitPrice: Number(issued.item.price),
      sourceId: issued.id,
      action: "used"
    });
    return {
      output_queues: ["inventory_manager", "team_leader", "running_invoice_hook"],
      issued_item_id: issued.id,
      part_request_id: issued.requestId,
      running_invoice_hook: { source: "issued_part_used", amount: total, status: "prepared" }
    };
  }

  private async requestUnusedPartReturn(session: RequestSessionContext, task: any, body: any) {
    const issuedItemId = String(body?.related?.issuedItemId || body?.issuedItemId || "");
    if (!issuedItemId) throw new BadRequestException("issuedItemId is required for Return Unused.");
    const issued = await this.prisma.issuedItem.findFirst({
      where: { id: issuedItemId, tenantId: session.tenantId, taskId: task.id, technicianId: session.userId },
      include: { item: true }
    });
    if (!issued) throw new NotFoundException("Issued part not found for this technician task.");
    const reason = String(body?.related?.reason || "Not needed anymore").slice(0, 160);
    const condition = String(body?.related?.condition || "Good").slice(0, 80);
    const balance = await this.prisma.warehouseStockBalance.findUnique({
      where: { warehouseId_itemId: { warehouseId: issued.warehouseId, itemId: issued.itemId } }
    });
    const beforeReturnPendingQty = balance?.returnPendingQty ?? 0;
    const returnRow = await this.prisma.$transaction(async (tx) => {
      const created = await tx.partReturnRequest.create({
        data: {
          tenantId: task.tenantId,
          issuedItemId: issued.id,
          warehouseId: issued.warehouseId,
          itemId: issued.itemId,
          workOrderId: task.workOrderId,
          taskId: task.id,
          technicianId: session.userId,
          qty: issued.qty,
          reason,
          condition,
          note: body?.related?.note || null
        }
      });
      await tx.issuedItem.update({ where: { id: issued.id }, data: { status: IssuedItemStatus.RETURN_REQUESTED } });
      await tx.partRequest.update({ where: { id: issued.requestId }, data: { status: PartRequestStatus.RETURN_REQUESTED } });
      await tx.warehouseStockBalance.upsert({
        where: { warehouseId_itemId: { warehouseId: issued.warehouseId, itemId: issued.itemId } },
        create: { tenantId: task.tenantId, warehouseId: issued.warehouseId, itemId: issued.itemId, returnPendingQty: issued.qty, lowThreshold: issued.item.minStock, criticalThreshold: issued.item.criticalStock },
        update: { returnPendingQty: { increment: issued.qty } }
      });
      await tx.stockMovement.create({
        data: {
          tenantId: task.tenantId,
          warehouseId: issued.warehouseId,
          itemId: issued.itemId,
          type: StockMovementType.RETURN_REQUESTED,
          qty: issued.qty,
          beforeQty: beforeReturnPendingQty,
          afterQty: beforeReturnPendingQty + issued.qty,
          source: task.workOrderId,
          reason,
          createdBy: session.userId
        }
      });
      return created;
    });
    return {
      output_queues: ["inventory_manager"],
      return_request_id: returnRow.id,
      issued_item_id: issued.id,
      technician_status: "return_pending"
    };
  }

  private async returnRequestsForTask(taskId?: string) {
    if (!taskId) return [];
    const rows = await this.prisma.partReturnRequest.findMany({
      where: { taskId },
      include: { item: true },
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row) => ({
      id: row.id,
      issuedItemId: row.issuedItemId,
      itemName: row.item.name,
      qty: row.qty,
      reason: row.reason,
      condition: row.condition,
      status: this.technicianReturnStatus(row.status),
      createdAt: row.createdAt.toISOString()
    }));
  }

  private async applyFinishGate(session: RequestSessionContext, taskId: string, sourceAction: string) {
    const result = await this.evaluateFinishGate(session, taskId);
    if (result.blocked) {
      return {
        auditEvent: "task.finish_blocked",
        output: {
          status: "finish_blocked",
          finish_gate_result: result,
          finish_gate_source_action: sourceAction,
          output_queues: ["technician", "branch_manager", "work_order_timeline"]
        }
      };
    }

    const auditEvent = result.outcome === "team_review" ? "task.sent_to_team_review" : "task.sent_to_qc";
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { status: TaskStatus.READY_FOR_QC } });
      await tx.workOrder.update({
        where: { id: result.workOrderId },
        data: {
          status: WorkOrderStatus.READY_FOR_QC,
          statusLabel: result.outcome === "team_review" ? "Awaiting Team Leader Review" : "Ready for QC"
        }
      });
    });

    return {
      auditEvent,
      output: {
        status: result.outcome === "team_review" ? "sent_to_team_review" : "sent_to_qc",
        finish_gate_result: result,
        finish_gate_source_action: sourceAction,
        output_queues: result.outcome === "team_review" ? ["team_leader", "branch_manager"] : ["qc_queue", "branch_manager"]
      }
    };
  }

  private async evaluateFinishGate(session: RequestSessionContext, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, tenantId: session.tenantId, assignments: { some: { staffUserId: session.userId } } },
      include: {
        workOrder: true,
        subtasks: true,
        blockers: true,
        partRequests: true,
        decisionRequests: { include: { items: true } }
      }
    });
    if (!task) throw new NotFoundException("Task not found in assigned technician work.");

    const [teamLeaderReview, inspectionSavedCount] = await Promise.all([
      this.prisma.controlSetting.findFirst({ where: { tenantId: session.tenantId, key: "teamLeaderReviewPolicy" } }),
      this.prisma.auditLog.count({ where: { targetType: "task", targetId: taskId, action: "inspection.saved" } })
    ]);
    const outcome = String(teamLeaderReview?.value || "All").toLowerCase() === "off" ? "qc" : "team_review";
    const pendingStatuses: PartRequestStatus[] = [PartRequestStatus.REQUESTED, PartRequestStatus.PENDING_WAREHOUSE, PartRequestStatus.WAREHOUSE_REVIEWING, PartRequestStatus.APPROVED, PartRequestStatus.WAITING_TRANSFER, PartRequestStatus.WAITING_SUPPLIER];
    const issuedNotReceivedStatuses: PartRequestStatus[] = [PartRequestStatus.ISSUED, PartRequestStatus.IN_TRANSIT, PartRequestStatus.ARRIVED];
    const pendingDecisionStatuses: DecisionRequestStatus[] = [DecisionRequestStatus.DRAFT, DecisionRequestStatus.SENT, DecisionRequestStatus.VIEWED];
    const checks = {
      partRequestsPending: task.partRequests.some((request) => pendingStatuses.includes(request.status)),
      issuedPartsNotReceived: task.partRequests.some((request) => issuedNotReceivedStatuses.includes(request.status)),
      receivedPartsNotResolved: task.partRequests.some((request) => request.status === PartRequestStatus.RECEIVED_BY_TECHNICIAN),
      returnPendingInventoryReview: task.partRequests.some((request) => request.status === PartRequestStatus.RETURN_REQUESTED),
      customerDecisionsPending: task.decisionRequests.some((request) => pendingDecisionStatuses.includes(request.status)),
      blockersOpen: task.blockers.some((blocker) => !blocker.resolved),
      inspectionRequiredDone: this.inspectionRequiredDone(task, inspectionSavedCount),
      criticalRejectedItemExists: task.decisionRequests.some((request) =>
        request.items.some((item) => item.criticalWarningRequired && item.decisionStatus === DecisionItemStatus.REJECTED)
      ),
      requiredNotesCompleted: true,
      timeTrackingCompleted: true
    };
    const blockedReasons = [
      checks.partRequestsPending ? "PART_REQUEST_PENDING" : "",
      checks.issuedPartsNotReceived ? "ISSUED_PART_NOT_RECEIVED" : "",
      checks.receivedPartsNotResolved ? "RECEIVED_PART_NOT_USED_OR_RETURNED" : "",
      checks.returnPendingInventoryReview ? "RETURN_PENDING_INVENTORY_REVIEW" : "",
      checks.customerDecisionsPending ? "CUSTOMER_DECISION_PENDING" : "",
      checks.blockersOpen ? "BLOCKER_OPEN" : "",
      !checks.inspectionRequiredDone ? "INSPECTION_REQUIRED_NOT_DONE" : "",
      checks.criticalRejectedItemExists ? "CRITICAL_REJECTED_ITEM_EXISTS" : "",
      !checks.requiredNotesCompleted ? "REQUIRED_NOTES_MISSING" : "",
      !checks.timeTrackingCompleted ? "TIME_TRACKING_INCOMPLETE" : ""
    ].filter(Boolean);

    return {
      blocked: blockedReasons.length > 0,
      blockedReasons,
      checks,
      outcome,
      workOrderId: task.workOrderId
    };
  }

  private inspectionRequiredDone(task: { status: TaskStatus; subtasks?: Array<{ done: boolean }> }, inspectionSavedCount: number) {
    if (inspectionSavedCount > 0) return true;
    if (task.subtasks?.length) return task.subtasks.every((subtask) => subtask.done);
    return !isOneOf(task.status, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED);
  }

  private blockerQueues(reason: string) {
    const normalized = reason.toLowerCase();
    if (normalized.includes("part")) return ["inventory_manager", "branch_manager"];
    if (normalized.includes("customer")) return ["branch_manager", "customer_decision_flow"];
    if (normalized.includes("team leader") || normalized.includes("diagnosis")) return ["team_leader"];
    if (normalized.includes("safety")) return ["team_leader", "branch_manager"];
    return ["branch_manager"];
  }

  private actionOutputQueues(action: string) {
    const queues: Record<string, string[]> = {
      "inspection.saved": ["team_leader"],
      "fault.created": ["team_leader", "branch_manager"],
      "diagnostic_code.added": ["team_leader"],
      "quick_service.started": ["branch_manager"],
      "quick_service.completed": ["team_leader", "branch_manager"],
      "part.requested": ["inventory_manager", "branch_manager"],
      "part.arrived": ["inventory_manager", "work_order_timeline"],
      "part.marked_used": ["inventory_manager", "team_leader"],
      "part.return_requested": ["inventory_manager"],
      "customer_visible_note.created": ["customer", "branch_manager"],
      "note.created": ["team_leader"],
      "task.sent_to_team_review": ["team_leader"],
      "task.sent_to_qc": ["qc_queue"],
      "rework.corrected": ["team_leader", "qc_queue"]
    };
    return queues[action] || ["work_order_timeline"];
  }

  private urgency(value: string): "normal" | "high" | "critical" {
    const normalized = String(value || "normal").toLowerCase();
    if (normalized === "critical") return "critical";
    if (normalized === "high") return "high";
    return "normal";
  }

  private assertTechnicianActionPermission(session: RequestSessionContext, action: string) {
    const permissionByAction: Record<string, string> = {
      "task.started": "task.start",
      "task.paused": "task.pause",
      "task.completed": "task.complete",
      "task.sent_to_team_review": "task.complete",
      "task.sent_to_qc": "task.complete",
      "rework.corrected": "task.complete",
      "rework.feedback.viewed": "qc.feedback.view",
      "inspection.saved": "inspection.submit",
      "fault.created": "fault.create",
      "diagnostic_code.added": "diagnostic_code.add",
      "part.requested": "parts.request",
      "part.arrived": "parts.mark_used",
      "part.marked_used": "parts.mark_used",
      "part.return_requested": "parts.mark_used",
      "blocker.reported": "task.blocker.report",
      "note.created": "task.note.create",
      "customer_visible_note.created": "task.customer_visible_note.create",
      "quick_service.started": "task.start",
      "quick_service.completed": "task.complete"
    };
    this.access.assert(permissionByAction[action] || "task.view_assigned", session);
  }

  private async emitTechnicianOperation(session: RequestSessionContext, task: any, action: string, auditEvent: string, detail: string, output: Record<string, unknown>) {
    const targets = this.operationTargets(output.output_queues as string[] | undefined, action);
    await this.operationEvents.emitFromSession(session, {
      eventKey: this.operationEventKey(action, output),
      tenantId: task.tenantId,
      branchId: task.branchId,
      workOrderId: task.workOrderId,
      taskId: task.id,
      customerId: task.customerId || task.workOrder?.customerId,
      assetId: task.assetId || task.workOrder?.assetId,
      statusChanges: this.technicianStatusChanges(task, action, output),
      notificationTargets: targets,
      pageUpdates: this.operationPageUpdates(targets),
      reportHooks: this.technicianReportHooks(action, output),
      auditAction: auditEvent,
      canUndo: ["part.requested", "part.return_requested", "task.paused"].includes(action),
      customerSafeOutput: this.technicianCustomerSafeOutput(task, action, detail, output),
      payload: {
        action,
        detail,
        output,
        integration_contract: {
          who_did_it: session.userId,
          what_changed: this.technicianStatusChanges(task, action, output),
          who_needs_to_know: targets,
          pages_to_update: this.operationPageUpdates(targets),
          reports_to_update: this.technicianReportHooks(action, output).map((hook) => hook.reportKey),
          customer_safe: Boolean(this.technicianCustomerSafeOutput(task, action, detail, output))
        }
      },
      reason: detail,
      targetType: "task",
      targetId: task.id
    });
  }

  private operationEventKey(action: string, output: Record<string, unknown>) {
    if (action === "task.started" || action === "quick_service.started") return "task.started";
    if (action === "inspection.saved") return "inspection.saved";
    if (action === "diagnostic_code.added") return "diagnostic_code.added";
    if (action === "fault.created") return "fault.created";
    if (action === "part.requested") return "part.requested";
    if (action === "part.arrived") return "part.arrived_confirmed";
    if (action === "part.marked_used") return "part.used";
    if (action === "part.return_requested") return "part.return_requested";
    if (action === "blocker.reported") return "blocker.reported";
    if (String(output.status || "").includes("finish_blocked")) return "task.finish_blocked";
    if (String(output.status || "").includes("team_review")) return "task.sent_to_team_review";
    if (String(output.status || "").includes("sent_to_qc") || action === "task.sent_to_qc") return "task.sent_to_qc";
    return `technician.${action.replace(/\./g, "_")}`;
  }

  private operationTargets(queues: string[] | undefined, action: string): OperationNotificationTarget[] {
    const map: Record<string, OperationNotificationTarget> = {
      technician: "technician",
      inventory_manager: "inventory_manager",
      branch_manager: "branch_manager",
      team_leader: "team_leader",
      customer: "customer",
      qc_queue: "qc_queue",
      work_order_timeline: "work_order_timeline",
      running_invoice_hook: "reports_engine",
      customer_decision_flow: "branch_manager"
    };
    const targets = (queues || this.actionOutputQueues(action)).map((queue) => map[queue] || "work_order_timeline");
    targets.push("reports_engine");
    return [...new Set(targets)];
  }

  private operationPageUpdates(targets: OperationNotificationTarget[]) {
    const pages = new Set<string>(["work-card", "my-work"]);
    if (targets.includes("inventory_manager")) pages.add("inventory-requests");
    if (targets.includes("branch_manager")) pages.add("branch-workspace");
    if (targets.includes("team_leader")) pages.add("team-review");
    if (targets.includes("customer")) pages.add("customer");
    if (targets.includes("reports_engine")) {
      pages.add("reports");
      pages.add("analytics-operations");
      pages.add("analytics-inventory-customer");
    }
    return [...pages];
  }

  private technicianReportHooks(action: string, output: Record<string, unknown>): OperationReportHookDto[] {
    const hooks: OperationReportHookDto[] = [];
    if (action.startsWith("part.")) {
      hooks.push({ reportKey: "reports.technician.parts_activity.view", metric: action, delta: 1, scope: ["self", "team"] });
      hooks.push({ reportKey: "reports.inventory.movements.view", metric: action, delta: 1, scope: ["warehouse", "branch"] });
    }
    if (action === "part.marked_used") hooks.push({ reportKey: "reports.inventory.consumption.view", metric: "parts_used", delta: 1, scope: ["warehouse", "category", "branch"] });
    if (action === "part.return_requested") hooks.push({ reportKey: "reports.inventory.returns.view", metric: "returns_requested", delta: 1, scope: ["warehouse", "category", "branch"] });
    if (action === "blocker.reported" || String(output.status || "").includes("finish_blocked")) {
      hooks.push({ reportKey: "reports.team.blockers.view", metric: "blockers", delta: 1, scope: ["team", "branch"] });
      hooks.push({ reportKey: "reports.branch.delays.view", metric: "blocked_or_waiting", delta: 1, scope: ["branch"] });
    }
    if (["task.completed", "task.sent_to_team_review", "task.sent_to_qc", "quick_service.completed", "rework.corrected"].includes(action)) {
      hooks.push({ reportKey: "reports.team.technician_performance.view", metric: "finish_gate_passed", delta: 1, scope: ["team", "branch"] });
      hooks.push({ reportKey: "reports.branch.operations.view", metric: "ready_for_review_or_qc", delta: 1, scope: ["branch"] });
    }
    return hooks;
  }

  private technicianStatusChanges(task: any, action: string, output: Record<string, unknown>) {
    const changes = [];
    if (action === "task.started" || action === "quick_service.started") {
      changes.push({ entityType: "task" as const, entityId: task.id, toStatus: "IN_PROGRESS", label: "Technician started work" });
      changes.push({ entityType: "work_order" as const, entityId: task.workOrderId, toStatus: "IN_PROGRESS", label: "Technician started work" });
    }
    if (action === "blocker.reported") changes.push({ entityType: "task" as const, entityId: task.id, toStatus: "BLOCKED", label: "Technician blocker reported" });
    if (action === "part.requested") {
      const contract = output.part_request_contract as { request_id?: string; status?: string } | undefined;
      if (contract?.request_id) changes.push({ entityType: "part_request" as const, entityId: contract.request_id, toStatus: String(contract.status || "pending_warehouse"), label: "Part requested by technician" });
      changes.push({ entityType: "work_order" as const, entityId: task.workOrderId, toStatus: "WAITING_FOR_PARTS", label: "Waiting for warehouse issue" });
    }
    if (action === "part.arrived" && output.part_request_id) changes.push({ entityType: "part_request" as const, entityId: String(output.part_request_id), toStatus: "RECEIVED_BY_TECHNICIAN", label: "Technician confirmed arrival" });
    if (action === "part.marked_used" && output.part_request_id) changes.push({ entityType: "part_request" as const, entityId: String(output.part_request_id), toStatus: "USED", label: "Technician used part" });
    if (action === "part.return_requested" && output.return_request_id) changes.push({ entityType: "return_request" as const, entityId: String(output.return_request_id), toStatus: "PENDING_INVENTORY_REVIEW", label: "Technician requested unused part return" });
    if (String(output.status || "").includes("sent_to")) {
      changes.push({ entityType: "task" as const, entityId: task.id, toStatus: "READY_FOR_QC", label: String(output.status) });
      changes.push({ entityType: "work_order" as const, entityId: task.workOrderId, toStatus: "READY_FOR_QC", label: String(output.status) });
    }
    return changes;
  }

  private technicianCustomerSafeOutput(task: any, action: string, detail: string, output: Record<string, unknown>) {
    const customerId = task.customerId || task.workOrder?.customerId;
    if (!customerId) return undefined;
    if (action === "part.requested") {
      return {
        title: "Waiting for required part",
        message: "We are waiting for a required part. The branch and technician will continue once it is issued.",
        source: "technician.part.requested",
        customerId,
        assetId: task.assetId || task.workOrder?.assetId,
        workOrderId: task.workOrderId
      };
    }
    if (action === "blocker.reported" && /customer|part|waiting|safety/i.test(String(output.blocker_reason || detail))) {
      return {
        title: "Service update",
        message: "The service team recorded a temporary blocker and the branch is following up.",
        source: "technician.blocker.reported",
        customerId,
        assetId: task.assetId || task.workOrder?.assetId,
        workOrderId: task.workOrderId
      };
    }
    if (action === "customer_visible_note.created") {
      return {
        title: "Technician update",
        message: detail,
        source: "technician.customer_visible_note",
        customerId,
        assetId: task.assetId || task.workOrder?.assetId,
        workOrderId: task.workOrderId
      };
    }
    return undefined;
  }

  private quickServices(): QuickServiceOptionDto[] {
    return [
      { id: "oil_change", label: "Oil change", category: "Cars", icon: "🛢", estimatedTime: "25 min", inspectionPolicy: "skip_allowed", suggestedPart: "Engine Oil 5W-30" },
      { id: "oil_filter", label: "Oil filter replacement", category: "Cars", icon: "⚙", estimatedTime: "20 min", inspectionPolicy: "skip_allowed", suggestedPart: "Oil filter" },
      { id: "battery_replace", label: "Battery replacement", category: "Cars", icon: "🔋", estimatedTime: "20 min", inspectionPolicy: "optional" },
      { id: "wiper_replace", label: "Wiper replacement", category: "Cars", icon: "🌧", estimatedTime: "10 min", inspectionPolicy: "skip_allowed" },
      { id: "chain_lube", label: "Chain lubrication", category: "Motorcycles", icon: "⛓", estimatedTime: "15 min", inspectionPolicy: "skip_allowed" },
      { id: "spark_plug", label: "Spark plug replacement", category: "Motorcycles", icon: "✦", estimatedTime: "20 min", inspectionPolicy: "optional" },
      { id: "clutch_cable", label: "Clutch cable adjustment", category: "Motorcycles", icon: "🏍", estimatedTime: "25 min", inspectionPolicy: "optional" },
      { id: "grease_service", label: "Grease service", category: "Heavy Equipment", icon: "🧰", estimatedTime: "45 min", inspectionPolicy: "skip_allowed" },
      { id: "hyd_filter", label: "Hydraulic filter replacement", category: "Heavy Equipment", icon: "💧", estimatedTime: "50 min", inspectionPolicy: "optional" },
      { id: "safety_lockout", label: "Safety lockout check", category: "Heavy Equipment", icon: "🔒", estimatedTime: "20 min", inspectionPolicy: "required" }
    ];
  }

  private safeAction(action: string) {
    const allowed = new Set([
      "task.started",
      "task.paused",
      "task.completed",
      "inspection.saved",
      "fault.created",
      "diagnostic_code.added",
      "part.requested",
      "part.arrived",
      "part.marked_used",
      "part.return_requested",
      "blocker.reported",
      "note.created",
      "customer_visible_note.created",
      "quick_service.started",
      "quick_service.completed",
      "task.sent_to_team_review",
      "task.sent_to_qc",
      "rework.feedback.viewed",
      "rework.corrected"
    ]);
    return allowed.has(action) ? action : "technician.action";
  }

  private auditAction(action: string) {
    if (action === "part.arrived") return "part.arrived_confirmed";
    if (action === "part.marked_used") return "part.used";
    return action;
  }

  private categoryLabel(code: string): CategoryCode {
    if (code === "MOTORCYCLES") return "Motorcycles";
    if (code === "HEAVY_EQUIPMENT") return "Heavy Equipment";
    return "Cars";
  }

  private toPrismaCategory(label: CategoryCode): PrismaCategoryCode {
    if (label === "Motorcycles") return PrismaCategoryCode.MOTORCYCLES;
    if (label === "Heavy Equipment") return PrismaCategoryCode.HEAVY_EQUIPMENT;
    return PrismaCategoryCode.CARS;
  }

  private categoryIcon(code: string) {
    if (code === "MOTORCYCLES") return "🏍";
    if (code === "HEAVY_EQUIPMENT") return "🚜";
    return "🚗";
  }

  private statusTone(group: TechnicianJobGroup) {
    if (group === "blocked") return "red";
    if (group === "waiting_customer" || group === "waiting_parts") return "orange";
    if (group === "active_now") return "blue";
    if (group === "completed_today") return "gray";
    return "green";
  }

  private defaultDiagnosticCode(category: string) {
    if (category === "Motorcycles") return "ECU01";
    if (category === "Heavy Equipment") return "HYD01";
    return "P0301";
  }
}
