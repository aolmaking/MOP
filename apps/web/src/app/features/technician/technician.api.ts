import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface TechnicianJob {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly myTaskCount: number;
  readonly myOpenTaskCount: number;
  readonly active: boolean;
  readonly blocked: boolean;
  readonly sinceHours: number;
}

export interface TechnicianTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly blockedReason: string | null;
}

export interface FinishCheck {
  readonly available: boolean;
  readonly passed: boolean;
  readonly conditions: readonly { satisfied: boolean; text: string }[];
}

export interface WorkCard {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly tasks: readonly TechnicianTask[];
  readonly finish: FinishCheck;
}

@Injectable({ providedIn: 'root' })
export class TechnicianApi {
  private readonly http = inject(HttpClient);

  active(): Observable<{ job: TechnicianJob | null }> {
    return this.http.get<{ job: TechnicianJob | null }>('/api/v1/technician/active');
  }

  myWork(): Observable<{ jobs: TechnicianJob[] }> {
    return this.http.get<{ jobs: TechnicianJob[] }>('/api/v1/technician/my-work');
  }

  workCard(id: string): Observable<WorkCard> {
    return this.http.get<WorkCard>(`/api/v1/technician/work-orders/${id}`);
  }

  startTask(taskId: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/tasks/${taskId}/start`, {});
  }

  completeTask(taskId: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/tasks/${taskId}/complete`, {});
  }

  reportBlocker(taskId: string, reason: string, note?: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/tasks/${taskId}/blocker`, { reason, note });
  }

  createFault(workOrderId: string, description: string, severity: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/faults`, { description, severity });
  }
}
