import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import type { BuilderPreviewResponse, PageSection } from "@mop/shared";

@Component({
  selector: "mop-schema-renderer",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section *ngIf="preview; else empty" class="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
      <div class="border-b border-[#f2d38a] bg-[#fff8e6] px-4 py-3 text-xs font-black uppercase text-[#7a5200]">
        Preview Mode - actions are not saved.
      </div>
      <header class="border-b border-black/10 p-4" [style.background]="preview.designTokens.primaryColor" [style.color]="'white'">
        <div class="text-xs font-bold uppercase opacity-70">{{ preview.previewIdentity?.displayName || preview.page.role }} - {{ preview.device }}</div>
        <h3 class="mt-1 text-xl font-black">{{ preview.page.pageKey }}</h3>
      </header>
      <div class="mx-auto grid gap-3 p-4 transition-all" [ngClass]="[preview.designTokens.density === 'compact' ? 'text-sm' : 'text-base', deviceClass()]">
        <article *ngFor="let section of preview.page.sections" class="rounded-md border border-black/10 p-4"
          [style.background]="preview.designTokens.surfaceColor"
          [style.boxShadow]="section.safetyCritical ? '0 0 0 2px ' + preview.designTokens.accentColor : ''">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs font-bold uppercase text-ink-500">{{ section.type }}</div>
              <h4 class="mt-1 font-black">{{ section.title }}</h4>
            </div>
            <span class="mop-pill">{{ section.enabled ? "Visible" : "Hidden" }}</span>
          </div>
          <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span class="rounded-full bg-black/[0.05] px-3 py-1">Order {{ section.order }}</span>
            <span *ngIf="section.locked" class="rounded-full bg-signal-rose px-3 py-1 text-signal-red">Locked</span>
            <span *ngIf="section.safetyCritical" class="rounded-full bg-[#fff4d8] px-3 py-1 text-[#8a5a00]">Safety critical</span>
          </div>
          <div *ngIf="settingKeys(section).length" class="mt-3 grid gap-2 text-xs text-ink-500">
            <div *ngFor="let key of settingKeys(section)" class="flex justify-between gap-3 rounded-md bg-black/[0.03] px-3 py-2">
              <span class="font-bold">{{ key }}</span>
              <span>{{ section.settings[key] }}</span>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <button *ngFor="let action of preview.readonlyActions.slice(0, 2)" type="button" disabled class="rounded-md border border-black/10 bg-black/[0.04] px-3 py-2 text-xs font-bold text-ink-500">
              {{ action }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <ng-template #empty>
      <section class="rounded-lg border border-dashed border-black/20 bg-white p-8 text-center text-sm font-bold text-ink-500">
        Select a page and role to preview the schema-driven experience.
      </section>
    </ng-template>
  `
})
export class SchemaRendererComponent {
  @Input() preview?: BuilderPreviewResponse | null;

  settingKeys(section: PageSection) {
    return Object.keys(section.settings || {});
  }

  deviceClass() {
    if (!this.preview) return "";
    if (this.preview.device === "mobile") return "max-w-[390px]";
    if (this.preview.device === "tablet") return "max-w-[760px]";
    return "max-w-full";
  }
}
