import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface TeamLeaderHome {
  readonly managedCount: number;
  readonly activeWork: number;
  readonly blockedTechnicians: number;
  readonly waitingParts: number;
  readonly waitingCustomer: number;
  readonly reworkIssues: number;
  readonly recentActivity: readonly { id: string; eventKey: string; actorId: string; createdAt: string }[];
}

export interface TechnicianRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly currentTask: { id: string; title: string; workOrderId: string } | null;
  readonly openBlockers: number;
  readonly tasksCompletedToday: number;
}

export interface TechnicianDetail extends TechnicianRow {
  readonly recentTasks: readonly { id: string; title: string; status: string; workOrderId: string }[];
  readonly supervisionNotes: readonly { id: string; body: string; escalated: boolean; authorId: string; createdAt: string }[];
}

export interface ManagedWorkOrder {
  readonly workOrderId: string;
  readonly status: string;
  readonly technicianId: string;
  readonly technicianName: string;
  readonly taskCount: number;
  readonly openBlockers: number;
}

export interface TechnicianPerformanceRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly tasksCompleted: number;
  readonly activeTasks: number;
  readonly blockers: number;
  readonly reworkCount: number;
}

@Injectable({ providedIn: 'root' })
export class TeamLeaderApi {
  private readonly http = inject(HttpClient);

  home(): Observable<TeamLeaderHome> {
    return this.http.get<TeamLeaderHome>('/api/v1/team-leader/home');
  }

  technicians(): Observable<readonly TechnicianRow[]> {
    return this.http.get<readonly TechnicianRow[]>('/api/v1/team-leader/technicians');
  }

  technician(id: string): Observable<TechnicianDetail> {
    return this.http.get<TechnicianDetail>(`/api/v1/team-leader/technicians/${id}`);
  }

  addNote(id: string, body: string, escalate: boolean): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`/api/v1/team-leader/technicians/${id}/notes`, { body, escalate });
  }

  workOrders(): Observable<readonly ManagedWorkOrder[]> {
    return this.http.get<readonly ManagedWorkOrder[]>('/api/v1/team-leader/work-orders');
  }

  reports(): Observable<readonly TechnicianPerformanceRow[]> {
    return this.http.get<readonly TechnicianPerformanceRow[]>('/api/v1/team-leader/reports');
  }
}
