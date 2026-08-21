import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface LiveActivityRow {
  readonly at: string;
  readonly workshopId: string;
  readonly workshopName: string;
  readonly eventKey: string;
  readonly summary: string;
  readonly actorId: string;
}

export interface LiveWorkshopRow {
  readonly workshopId: string;
  readonly workshopName: string;
  readonly slug: string;
  readonly status: string;
  readonly openJobs: number;
  readonly eventsToday: number;
  readonly lastActivityAt: string | null;
}

export interface LiveViewReport {
  readonly generatedAt: string;
  readonly platformTotals: {
    readonly workshops: number;
    readonly activeWorkshops: number;
    readonly openJobs: number;
    readonly eventsToday: number;
    readonly quietWorkshops: number;
  };
  readonly workshops: readonly LiveWorkshopRow[];
  readonly recentActivity: readonly LiveActivityRow[];
}

/** How far back "today" reaches for the activity counters. */
const TODAY_WINDOW_HOURS = 24;
const RECENT_ACTIVITY_LIMIT = 40;

/**
 * Live View -- what is happening across every workshop right now.
 *
 * The one platform surface that reads ACROSS tenants rather than into
 * one, which is exactly why it is confined to a platform session and
 * exposes no customer, money or job detail: a platform operator needs to
 * see that a workshop is busy, stalled or silent, not what any particular
 * repair is about. Summaries here are derived from the event key alone,
 * so nothing tenant-private crosses the boundary even by accident.
 *
 * "Quiet" is the figure worth watching. A workshop with open jobs and no
 * events for a day is not calm -- it is either abandoned mid-flow or
 * hitting something it cannot get past, and both are reasons to call.
 */
@Injectable()
export class LiveViewService {
  constructor(private readonly prisma: PrismaService) {}

  async build(): Promise<LiveViewReport> {
    const since = new Date(Date.now() - TODAY_WINDOW_HOURS * 60 * 60 * 1000);

    const [tenants, openJobs, eventCounts, recent] = await Promise.all([
      this.prisma.tenant.findMany({
        select: { id: true, name: true, slug: true, status: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.workOrder.groupBy({
        by: ["tenantId"],
        where: { status: { notIn: ["CLOSED", "CANCELLED"] } },
        _count: { _all: true },
      }),
      this.prisma.operationEvent.groupBy({
        by: ["tenantId"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.operationEvent.findMany({
        where: { createdAt: { gte: since } },
        select: { tenantId: true, eventKey: true, actorId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: RECENT_ACTIVITY_LIMIT,
      }),
    ]);

    const nameById = new Map(tenants.map((t) => [t.id, t.name]));
    const openByTenant = new Map(openJobs.map((row) => [row.tenantId, row._count._all]));
    const eventsByTenant = new Map(eventCounts.map((row) => [row.tenantId, row]));

    const workshops: LiveWorkshopRow[] = tenants.map((tenant) => {
      const events = eventsByTenant.get(tenant.id);
      return {
        workshopId: tenant.id,
        workshopName: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        openJobs: openByTenant.get(tenant.id) ?? 0,
        eventsToday: events?._count._all ?? 0,
        lastActivityAt: events?._max.createdAt?.toISOString() ?? null,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      platformTotals: {
        workshops: tenants.length,
        activeWorkshops: tenants.filter((t) => t.status === "ACTIVE").length,
        openJobs: workshops.reduce((sum, w) => sum + w.openJobs, 0),
        eventsToday: workshops.reduce((sum, w) => sum + w.eventsToday, 0),
        // Work in progress that nobody has touched all day.
        quietWorkshops: workshops.filter((w) => w.openJobs > 0 && w.eventsToday === 0).length,
      },
      workshops,
      recentActivity: recent.map((event) => ({
        at: event.createdAt.toISOString(),
        workshopId: event.tenantId,
        workshopName: nameById.get(event.tenantId) ?? "Unknown workshop",
        eventKey: event.eventKey,
        summary: this.summarise(event.eventKey),
        actorId: event.actorId,
      })),
    };
  }

  /**
   * Derived from the event key alone, never from its payload.
   *
   * The payload carries plate numbers, customer names and money. None of
   * that belongs to the platform operator, and the safest way to keep it
   * out of a cross-tenant view is to never read it here.
   */
  private summarise(eventKey: string): string {
    const known: Record<string, string> = {
      "work_order.status_changed": "A job moved to a new stage",
      "task.completed": "A technician finished a task",
      "task.blocked": "A technician hit a blocker",
      "finance.line_added": "A charge was added to a job",
      "finance.invoice_issued": "An invoice was issued",
      "finance.payment_recorded": "A payment was taken",
      "customer_decision.recorded": "A customer answered a decision",
      "intake.created": "A vehicle was booked in",
    };
    return known[eventKey] ?? eventKey.replace(/[._]/g, " ");
  }
}
