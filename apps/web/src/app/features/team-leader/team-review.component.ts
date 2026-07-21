import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";

interface ReviewRow {
  taskId: string;
  workOrderNumber: string;
  title: string;
  status: string;
  customerName: string;
  assetName: string;
  assetIdentifier: string;
  branchName: string;
  technicians: string[];
  checklist: Record<string, boolean>;
  updatedAt: string;
}
interface ReviewResponse {
  counts: { awaiting: number; rework: number; readyQc: number };
  rows: ReviewRow[];
}

@Component({
  selector: "mop-team-review",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="min-h-screen bg-[#f4f6f8] px-4 py-6 lg:ml-72 lg:px-8">
      <header class="mx-auto max-w-[1500px] border-b border-black/10 pb-5">
        <p class="text-xs font-bold uppercase text-emerald-700">Team Leader</p>
        <h1 class="mt-1 text-3xl font-black">Team Review</h1>
        <p class="mt-2 text-sm text-black/50">Review finished work from managed technicians before QC.</p>
      </header>

      <section class="mx-auto mt-6 grid max-w-[1500px] gap-3 sm:grid-cols-3">
        <article *ngFor="let metric of metrics()" class="rounded-md border border-black/10 bg-white p-4"><p class="text-xs font-bold uppercase text-black/45">{{ metric.label }}</p><p class="mt-2 text-3xl font-black">{{ metric.value }}</p></article>
      </section>
      <div *ngIf="error()" class="mx-auto mt-5 max-w-[1500px] rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error() }}</div>

      <section class="mx-auto mt-6 grid max-w-[1500px] gap-4">
        <article *ngFor="let row of rows()" class="rounded-md border border-black/10 bg-white p-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div><p class="text-xs font-black uppercase text-[#e43d30]">{{ row.workOrderNumber }}</p><h2 class="mt-1 text-xl font-black">{{ row.assetName }} · {{ row.assetIdentifier }}</h2><p class="mt-1 text-sm text-black/50">{{ row.title }} · {{ row.technicians.join(', ') }}</p></div>
            <span class="rounded bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-900">{{ row.status }}</span>
          </div>
          <div class="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div *ngFor="let check of checklist(row)" class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold" [class.border-emerald-200]="check.ok" [class.bg-emerald-50]="check.ok" [class.border-red-200]="!check.ok" [class.bg-red-50]="!check.ok"><span>{{ check.ok ? '✓' : '×' }}</span>{{ check.label }}</div>
          </div>
          <div class="mt-5 flex flex-wrap gap-3">
            <button class="mop-button-primary min-h-12" type="button" [disabled]="busy()" (click)="act(row, 'approve_qc')">Approve for QC</button>
            <button class="mop-button-secondary min-h-12" type="button" [disabled]="busy()" (click)="selected.set(row)">Return for Rework</button>
          </div>
        </article>
        <div *ngIf="!rows().length && !error()" class="rounded-md border border-dashed border-black/20 bg-white p-10 text-center"><h2 class="text-xl font-black">Review queue is clear</h2><p class="mt-2 text-sm text-black/45">Completed technician work will appear here.</p></div>
      </section>

      <div *ngIf="selected()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
        <form class="w-full max-w-lg rounded-md bg-white p-6" (ngSubmit)="act(selected()!, 'return_rework')">
          <h2 class="text-xl font-black">Return for Rework</h2><p class="mt-2 text-sm text-black/50">Give the technician a specific correction to complete.</p>
          <textarea class="mop-input mt-5 min-h-32 w-full" name="reason" [(ngModel)]="reason" required minlength="5"></textarea>
          <div class="mt-5 flex justify-end gap-3"><button class="mop-button-secondary" type="button" (click)="selected.set(null)">Cancel</button><button class="mop-button-primary" type="submit" [disabled]="reason.trim().length < 5 || busy()">Send Rework</button></div>
        </form>
      </div>
    </main>
  `
})
export class TeamReviewComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly rows = signal<ReviewRow[]>([]);
  readonly counts = signal({ awaiting: 0, rework: 0, readyQc: 0 });
  readonly error = signal("");
  readonly busy = signal(false);
  readonly selected = signal<ReviewRow | null>(null);
  reason = "";

  async ngOnInit() { await this.load(); }

  async load() {
    try {
      const response = await firstValueFrom(this.api.get<ReviewResponse>("/team-leader/review"));
      this.counts.set(response.counts);
      this.rows.set(response.rows);
    } catch (error: any) {
      this.error.set(error?.error?.message || "Team review queue could not be loaded.");
    }
  }

  metrics() {
    return [
      { label: "Awaiting review", value: this.counts().awaiting },
      { label: "Returned rework", value: this.counts().rework },
      { label: "Ready for QC", value: this.counts().readyQc }
    ];
  }

  checklist(row: ReviewRow) {
    const labels: Record<string, string> = { subtasksComplete: "Subtasks complete", noOpenBlockers: "No blockers", partsResolved: "Parts resolved", decisionsResolved: "Decisions resolved" };
    return Object.entries(row.checklist).map(([key, ok]) => ({ label: labels[key] || key, ok }));
  }

  async act(row: ReviewRow, action: "approve_qc" | "return_rework") {
    this.busy.set(true);
    this.error.set("");
    try {
      await firstValueFrom(this.api.post(`/team-leader/review/${row.taskId}/action`, { action, reason: this.reason }));
      this.selected.set(null);
      this.reason = "";
      await this.load();
    } catch (error: any) {
      this.error.set(error?.error?.message || "Review action could not be completed.");
    } finally {
      this.busy.set(false);
    }
  }
}
