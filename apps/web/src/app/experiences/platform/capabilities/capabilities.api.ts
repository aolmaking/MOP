import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface CapabilityRow {
  readonly key: string;
  readonly status: string;
  readonly owningSystem: string;
  readonly dependencies: readonly string[];
  readonly reversible: boolean;
  readonly removable: boolean;
  readonly behaviorOnRemoval: string | null;
}

export interface AffectedRecords {
  readonly entity: string;
  readonly states: readonly string[];
  readonly count: number;
  readonly policy: string;
}

export interface CapabilityImpactPreview {
  readonly validation: { valid: boolean; errors: readonly string[]; warnings?: readonly string[] };
  readonly affectedRecords: readonly AffectedRecords[];
  readonly orphanedRoles: readonly string[];
  readonly orphanedStaffCount: number;
  readonly droppedGates: readonly string[];
  readonly reversible: boolean;
  readonly blockers: readonly string[];
}

export interface CapabilityChange {
  readonly capabilityKey: string;
  readonly status: string;
}

@Injectable({ providedIn: 'root' })
export class CapabilitiesApi {
  private readonly http = inject(HttpClient);

  current(workshopId: string): Observable<{ capabilities: CapabilityRow[] }> {
    return this.http.get<{ capabilities: CapabilityRow[] }>(
      `/api/v1/platform/workshops/${workshopId}/capabilities`,
    );
  }

  preview(workshopId: string, changes: readonly CapabilityChange[]): Observable<CapabilityImpactPreview> {
    return this.http.post<CapabilityImpactPreview>(
      `/api/v1/platform/workshops/${workshopId}/capabilities/preview`,
      { changes },
    );
  }

  apply(workshopId: string, changes: readonly CapabilityChange[], reason: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`/api/v1/platform/workshops/${workshopId}/capabilities/apply`, {
      changes,
      reason,
    });
  }
}
