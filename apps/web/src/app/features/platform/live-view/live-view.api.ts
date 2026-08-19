import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

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

@Injectable({ providedIn: 'root' })
export class LiveViewApi {
  private readonly http = inject(HttpClient);

  load(): Observable<LiveViewReport> {
    return this.http.get<LiveViewReport>('/api/v1/platform/live-view');
  }
}
