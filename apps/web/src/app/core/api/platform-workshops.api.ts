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

  checkOwnerEmailAvailability(email: string): Observable<AvailabilityResult> {
    return this.http.get<AvailabilityResult>('/api/v1/platform/workshops/owner-email-availability', { params: { email } });
  }

  createWorkshop(payload: CreateWorkshopPayload): Observable<CreateWorkshopResponse> {
    return this.http.post<CreateWorkshopResponse>('/api/v1/platform/workshops', payload);
  }
}
