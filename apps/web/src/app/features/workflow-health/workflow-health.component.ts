import { CommonModule } from "@angular/common";
import { Component, OnInit, inject } from "@angular/core";
import type { WorkflowHealthIssueDto, WorkflowHealthResultDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { OperationsApiService } from "../../core/api/operations-api.service";

@Component({
  selector: "mop-workflow-health",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="px-4 py-6 lg:px-8 lg:py-8">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p class="text-xs font-bold uppercase text-ink-500">Operations Integrity</p>
          <h1 class="mt-2 text-2xl font-black lg:text-3xl">Workflow Health</h1>
        </div>
        <button type="button" class="mop-button-secondary" (click)="load()" [disabled]="loading">
          {{ loading ? "Checking..." : "Refresh" }}
        </button>
      </header>

      <div *ngIf="error" class="mt-5 border-l-4 border-signal-red bg-signal-rose px-4 py-3 text-sm font-bold text-signal-red">
        {{ error }}
      </div>

      <ng-container *ngIf="health as result">
        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div class="border-b-2 border-ink-950 bg-white p-4">
            <div class="text-xs font-bold uppercase text-ink-500">Integrity Score</div>
            <div class="mt-2 text-3xl font-black">{{ result.score }}</div>
          </div>
          <div class="border-b-2 border-signal-red bg-white p-4">
            <div class="text-xs font-bold uppercase text-ink-500">Critical</div>
            <div class="mt-2 text-3xl font-black text-signal-red">{{ result.summary.critical }}</div>
          </div>
          <div class="border-b-2 border-[#c44b2b] bg-white p-4">
            <div class="text-xs font-bold uppercase text-ink-500">High</div>
            <div class="mt-2 text-3xl font-black text-[#9b341f]">{{ result.summary.high }}</div>
          </div>
          <div class="border-b-2 border-[#c28b18] bg-white p-4">
            <div class="text-xs font-bold uppercase text-ink-500">Medium</div>
            <div class="mt-2 text-3xl font-black text-[#855d0d]">{{ result.summary.medium }}</div>
          </div>
          <div class="border-b-2 border-[#2f7b52] bg-white p-4">
            <div class="text-xs font-bold uppercase text-ink-500">Status</div>
            <div class="mt-2 text-lg font-black uppercase">{{ result.status }}</div>
          </div>
        </div>

        <div class="mt-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-xl font-black">Detected Issues</h2>
            <p class="mt-1 text-sm text-ink-500">{{ result.issues.length }} active integrity checks require attention.</p>
          </div>
          <div class="text-xs font-semibold text-ink-500">Checked {{ result.checkedAt | date:"medium" }}</div>
        </div>

        <div *ngIf="!result.issues.length" class="mt-4 border border-[#2f7b52]/20 bg-[#edf8f1] p-5 text-sm font-bold text-[#1f6a43]">
          No broken workflow states were detected.
        </div>

        <div class="mt-4 grid gap-3">
          <article *ngFor="let issue of result.issues; trackBy: trackIssue" class="grid gap-4 border border-black/10 bg-white p-4 lg:grid-cols-[150px_minmax(0,1fr)_minmax(240px,0.7fr)]">
            <div>
              <span class="inline-flex px-2 py-1 text-xs font-black uppercase" [ngClass]="severityClass(issue.severity)">
                {{ issue.severity }}
              </span>
              <div class="mt-3 text-xs font-bold text-ink-500">{{ issue.affectedWorkflow }}</div>
            </div>
            <div class="min-w-0">
              <h3 class="text-base font-black">{{ issue.title }}</h3>
              <p class="mt-2 break-words text-sm leading-6 text-ink-500">{{ issue.detail }}</p>
              <div class="mt-2 break-all text-xs font-semibold text-ink-500" *ngIf="issue.affectedEntityId">
                {{ issue.affectedEntityType }}: {{ issue.affectedEntityId }}
              </div>
            </div>
            <div class="border-l-2 border-black/10 pl-4">
              <div class="text-xs font-bold uppercase text-ink-500">Suggested Fix</div>
              <p class="mt-2 text-sm leading-6">{{ issue.suggestedFix }}</p>
              <div class="mt-3 text-xs font-bold text-signal-red" *ngIf="issue.platformLocked">Locked by Platform</div>
              <div class="mt-3 text-xs font-bold text-[#855d0d]" *ngIf="issue.ownerLocked">Owner action required</div>
            </div>
          </article>
        </div>
      </ng-container>
    </section>
  `
})
export class WorkflowHealthComponent implements OnInit {
  private readonly api = inject(OperationsApiService);

  health?: WorkflowHealthResultDto;
  loading = false;
  error = "";

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading = true;
    this.error = "";
    try {
      this.health = await firstValueFrom(this.api.health());
    } catch {
      this.error = "Workflow health could not be loaded.";
    } finally {
      this.loading = false;
    }
  }

  trackIssue(_index: number, issue: WorkflowHealthIssueDto) {
    return issue.id;
  }

  severityClass(severity: WorkflowHealthIssueDto["severity"]) {
    if (severity === "critical") return "bg-signal-rose text-signal-red";
    if (severity === "high") return "bg-[#fff0e9] text-[#9b341f]";
    if (severity === "medium") return "bg-[#fff6d8] text-[#855d0d]";
    return "bg-[#edf8f1] text-[#1f6a43]";
  }
}
