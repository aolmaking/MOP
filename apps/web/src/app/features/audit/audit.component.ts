import { CommonModule } from "@angular/common";
import { Component, OnInit, inject, signal } from "@angular/core";
import type { AuditLogDto } from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "../../core/api/api-client.service";

@Component({
  selector: "mop-audit",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="px-5 py-8 lg:px-8">
      <header class="mop-panel p-6">
        <span class="mop-pill">Audit</span>
        <h1 class="mt-4 text-3xl font-black tracking-normal">Operational audit trail</h1>
        <p class="mt-2 text-sm text-ink-500">Every sensitive backend action writes an event.</p>
      </header>

      <div class="mt-5 grid gap-3">
        <article *ngFor="let row of rows()" class="mop-card">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="font-black">{{ row.action }}</div>
              <div class="mt-1 text-sm text-ink-500">{{ row.actorName }} · {{ row.targetType }} {{ row.targetId || "" }}</div>
            </div>
            <span class="mop-pill">{{ row.actorType }}</span>
          </div>
          <p class="mt-3 text-sm text-ink-500">{{ row.reason }}</p>
        </article>
      </div>
    </section>
  `
})
export class AuditComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly rows = signal<AuditLogDto[]>([]);

  async ngOnInit() {
    this.rows.set(await firstValueFrom(this.api.get<AuditLogDto[]>("/audit")));
  }
}
