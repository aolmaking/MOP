import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PresentedJourney } from '../../../domain/journey/workflow-strip';

export interface BoardRow {
  readonly id: string;
  readonly status: string;
  readonly lane: string | null;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly branchId: string;
  readonly sinceHours: number;
  readonly assignedTo: string | null;
  readonly inspectionDeclined: boolean;
}

export interface BoardLane {
  readonly key: string;
  readonly rows: readonly BoardRow[];
}

export interface BoardResult {
  readonly lanes: readonly BoardLane[];
  readonly total: number;
  readonly unlaned: readonly string[];
}

export interface WorkOrderTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly blockers: readonly { id: string; reason: string; note: string | null; createdAt: string }[];
}

export interface DecisionItem {
  readonly id: string;
  readonly name: string;
  readonly importance: string;
  readonly decision: string;
  readonly warningAcknowledged: boolean;
  /** A string across the API. Money is never a JS number. */
  readonly total: string;
}

export interface WorkOrderDetail {
  readonly id: string;
  readonly status: string;
  readonly lane: string | null;
  readonly branchId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
  readonly inspectionDeclined: boolean;
  readonly asset: {
    id: string;
    category: string;
    plateNumber: string | null;
    serialNumber: string | null;
    vinOrChassisNumber: string | null;
  };
  readonly customer: { id: string; fullName: string; phone: string };
  readonly assignments: readonly { staffUser: { fullName: string; role: string } }[];
  readonly tasks: readonly WorkOrderTask[];
  readonly decisionRequests: readonly {
    id: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
    items: readonly DecisionItem[];
  }[];
}

@Injectable({ providedIn: 'root' })
export class WorkOrdersApi {
  private readonly http = inject(HttpClient);

  board(query?: string): Observable<BoardResult> {
    return this.http.get<BoardResult>('/api/v1/branch-manager/work-orders', {
      params: query ? { q: query } : {},
    });
  }

  /**
   * Pass or fail this job at whichever stage it is at. The server picks
   * the intent from the job's actual state -- see AdvanceWorkOrderDto.
   */
  advance(id: string, passed: boolean, note?: string): Observable<unknown> {
    return this.http.post(`/api/v1/branch-manager/work-orders/${id}/advance`, { passed, note });
  }

  journey(id: string): Observable<PresentedJourney> {
    return this.http.get<PresentedJourney>(`/api/v1/branch-manager/work-orders/${id}/journey`);
  }

  detail(id: string): Observable<WorkOrderDetail> {
    return this.http.get<WorkOrderDetail>(`/api/v1/branch-manager/work-orders/${id}`);
  }

  /**
   * CONTRACTS-v0 C3. The manager adds work the technician did not think
   * to raise -- the counter's own "and while it is in, do this too".
   */
  createTask(
    workOrderId: string,
    task: { title: string; serviceKey?: string; assignToStaffUserId?: string },
  ): Observable<WorkOrderTask> {
    return this.http.post<WorkOrderTask>(`/api/v1/branch-manager/work-orders/${workOrderId}/tasks`, task);
  }

  /**
   * CONTRACTS-v0 C4. The manager's explicit door to "ask the customer",
   * for the job that has a priced recommendation sitting on it and never
   * moved. Refused with 409 `transition_not_allowed` when the live graph
   * has no such edge from where the job is -- the refusal message is the
   * server's and is shown verbatim.
   */
  requestApproval(workOrderId: string): Observable<{ workOrderId: string; status: string }> {
    return this.http.post<{ workOrderId: string; status: string }>(
      `/api/v1/branch-manager/work-orders/${workOrderId}/request-approval`,
      {},
    );
  }
}
