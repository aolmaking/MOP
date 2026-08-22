import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface PlanOption {
  id: string;
  code: string;
  name: string;
  maxBranches: number;
  maxUsers: number;
  maxWarehouses: number;
  // Prisma Decimal serializes to a string over JSON, not a number.
  monthlyPrice: string;
}

export interface AvailabilityResult {
  available: boolean;
}

export interface CreateWorkshopPayload {
  planId: string;
  name: string;
  slug: string;
  country: string;
  city: string;
  businessType: string;
  businessTypeOther?: string;
  primaryCategory: string;
  currency: string;
  timezone: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPhone: string;
  allowedBranchesStart: number;
  allowedUsersStart: number;
  allowedWarehousesStart: number;
  starterBuilderTemplate: string;
  enableDemoData?: boolean;
  initialStatus: string;
}

export interface CreateWorkshopResponse {
  tenant: { id: string; name: string; slug: string };
  inviteLink: string;
  demoDataEnqueued: boolean;
}

/** Thin wrapper over the platform/workshops endpoints -- Workshops (step 3) reuses listPlans and the shape of these calls. */
@Injectable({ providedIn: 'root' })
export class PlatformWorkshopsApi {
  private readonly http = inject(HttpClient);

  listPlans(): Observable<PlanOption[]> {
    return this.http.get<PlanOption[]>('/api/v1/platform/plans');
  }

  checkNameAvailability(name: string): Observable<AvailabilityResult> {
    return this.http.get<AvailabilityResult>('/api/v1/platform/workshops/name-availability', { params: { name } });
  }

  checkSlugAvailability(slug: string): Observable<AvailabilityResult> {
    return this.http.get<AvailabilityResult>('/api/v1/platform/workshops/slug-availability', { params: { slug } });
  }

  /** Server-side paged, sorted and filtered. Never a client-side array op. */
  listWorkshops(filters: WorkshopFilters): Observable<WorkshopListResult> {
    const params: Record<string, string> = {};
    if (filters.page) params['page'] = String(filters.page);
    if (filters.pageSize) params['pageSize'] = String(filters.pageSize);
    if (filters.search) params['search'] = filters.search;
    if (filters.status?.length) params['status'] = filters.status.join(',');
    if (filters.plan?.length) params['plan'] = filters.plan.join(',');
    if (filters.health?.length) params['health'] = filters.health.join(',');
    if (filters.sort) params['sort'] = filters.sort;
    return this.http.get<WorkshopListResult>('/api/v1/platform/workshops', { params });
  }

  workshopDetails(id: string): Observable<WorkshopDetails> {
    return this.http.get<WorkshopDetails>(`/api/v1/platform/workshops/${id}/details`);
  }

  /** Computed at dialog-open time, never cached -- it is a live count. */
  freezeImpact(id: string): Observable<FreezeImpact> {
    return this.http.get<FreezeImpact>(`/api/v1/platform/workshops/${id}/freeze-impact-preview`);
  }

  freezeWorkshop(id: string, reason: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`/api/v1/platform/workshops/${id}/freeze`, { reason });
  }

  reactivateWorkshop(id: string, reason: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`/api/v1/platform/workshops/${id}/reactivate`, { reason });
  }

  checkOwnerEmailAvailability(email: string): Observable<AvailabilityResult> {
    return this.http.get<AvailabilityResult>('/api/v1/platform/workshops/owner-email-availability', { params: { email } });
  }

  createWorkshop(payload: CreateWorkshopPayload): Observable<CreateWorkshopResponse> {
    return this.http.post<CreateWorkshopResponse>('/api/v1/platform/workshops', payload);
  }
}

/* ------------------------------------------------------------------ *
 * The Workshops list -- the platform's landing page.
 * ------------------------------------------------------------------ */

export type BuilderStatus = 'NOT_CUSTOMIZED' | 'CUSTOMIZED' | 'DRAFT_PENDING';
export type HealthStatus = 'HEALTHY' | 'AT_RISK' | 'CRITICAL';

export interface WorkshopRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly currency: string;
  /** The workshop's own timezone. Its timestamps are read in it. */
  readonly timezone: string;
  readonly createdAt: string;
  readonly plan: { id: string; name: string; monthlyPrice: string };
  readonly owner: { fullName: string; email: string | null; invitePending: boolean } | null;
  readonly branchCount: number;
  readonly userCount: number;
  readonly activeWorkOrderCount: number;
  readonly lastActivityAt: string | null;
  readonly builderStatus: BuilderStatus;
  readonly compliantBlocked: boolean;
  readonly health: HealthStatus;
}

export interface WorkshopListResult {
  readonly items: readonly WorkshopRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface WorkshopFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string[];
  plan?: string[];
  health?: string[];
  sort?: string;
}

export interface WorkshopDetails {
  readonly basicInfo: {
    id: string;
    name: string;
    slug: string;
    country: string;
    city: string;
    businessType: string;
    primaryCategory: string;
    currency: string;
    timezone: string;
    createdAt: string;
    status: string;
  };
  readonly ownerInfo: {
    fullName: string;
    email: string | null;
    phone: string | null;
    accountStatus: string;
    lastLoginAt: string | null;
  } | null;
  readonly planInfo: {
    name: string;
    monthlyPrice: string;
    limits: {
      branches: { used: number; max: number };
      users: { used: number; max: number };
      warehouses: { used: number; max: number };
    };
  };
  readonly branches: { items: readonly { id: string; name: string; city: string | null; isActive: boolean }[]; total: number };
  readonly warehouses: { items: readonly { id: string; name: string; code: string }[]; total: number };
  readonly usersByRole: readonly { role: string; count: number }[];
  readonly enabledModules: readonly string[];
  readonly recentActivity: readonly { id: string; action: string; actorName: string; createdAt: string }[];
  readonly recentPlatformControls: readonly { id: string; key: string; type: string; createdAt: string; reason: string | null }[];
  readonly subscription: {
    planName: string;
    monthlyPrice: string;
    currency: string;
    renewalDate: string | null;
    paidThroughDate: string | null;
  };
  readonly compliantBlocked: boolean;
  readonly health: { status: HealthStatus; warnings: readonly { code: string; message: string }[] };
}

export interface FreezeImpact {
  readonly staffSessionsToRevoke: number;
  readonly customerSessionsToRevoke: number;
}
