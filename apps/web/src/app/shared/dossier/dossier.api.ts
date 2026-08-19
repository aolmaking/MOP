import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface DossierTimelineEntry {
  readonly at: string;
  readonly kind: 'STATUS' | 'TASK' | 'INSPECTION' | 'FAULT' | 'BLOCKER' | 'DECISION' | 'PART' | 'STOCK' | 'MONEY';
  readonly summary: string;
  readonly actorId: string | null;
  readonly detail: Record<string, unknown>;
}

export interface DossierPartLine {
  readonly name: string;
  readonly quantity: number;
  readonly provenance: string;
  readonly inventoryItemId: string | null;
  /** Money crosses the API as a string, never a JS number. */
  readonly charged: string;
  /** Null when the reader does not hold inventory.cost.view. */
  readonly cost: string | null;
  readonly workshopWarranted: boolean;
  readonly taskId: string | null;
}

export interface DossierMoney {
  readonly lines: readonly { name: string; itemType: string; quantity: number; total: string }[];
  readonly runningTotal: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceTotal: string | null;
  readonly paid: string | null;
  readonly outstanding: string | null;
}

export interface WorkOrderDossier {
  readonly workOrderId: string;
  readonly status: string;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly customer: { id: string; fullName: string; phone: string } | null;
  readonly asset: { id: string; category: string; identifier: string | null } | null;
  readonly servicesPerformed: readonly { taskId: string; serviceKey: string | null; title: string; status: string }[];
  readonly people: readonly { staffUserId: string; fullName: string; role: string }[];
  readonly parts: readonly DossierPartLine[];
  readonly stockMovements: readonly {
    itemId: string;
    type: string;
    quantity: number;
    beforeQty: number;
    afterQty: number;
    at: string;
  }[];
  readonly money: DossierMoney;
  readonly timeline: readonly DossierTimelineEntry[];
  readonly priorVisits: number;
}

@Injectable({ providedIn: 'root' })
export class DossierApi {
  private readonly http = inject(HttpClient);

  dossier(workOrderId: string): Observable<WorkOrderDossier> {
    return this.http.get<WorkOrderDossier>(`/api/v1/branch-manager/work-orders/${workOrderId}/dossier`);
  }
}
