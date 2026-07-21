import { CommonModule } from "@angular/common";
import { Component, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import type {
  BuilderConfiguration,
  BuilderDevicePreview,
  BuilderHomeDto,
  BuilderImpactPreview,
  BuilderPageKey,
  BuilderPreset,
  BuilderPreviewIdentity,
  BuilderPreviewResponse,
  BuilderRole,
  BuilderValidationResult,
  FormFieldSchema,
  MessageTemplate,
  OwnerConfigurationDraftDto,
  OwnerConfigurationPermissionsDto,
  OwnerConfigurationSectionDto,
  OwnerPermissionCellDto,
  OwnerPermissionDefinition,
  OwnerPermissionImpactPreviewDto,
  OwnerRoleTemplateDto,
  OwnerScopeRuleDto,
  OwnerUserPermissionDto,
  PageSection,
  PageTemplate
} from "@mop/shared";
import { BuilderApiService, type BuilderHistoryRow } from "../../core/api/builder-api.service";
import { SchemaRendererComponent } from "../../shared/schema-renderer/schema-renderer.component";

type BuilderStudioPage = "home" | "brand-theme" | "page-builder" | "role-experience" | "workflow-feature" | "forms-fields" | "messages-templates" | "organization-access" | "configuration-permissions" | "publish-center" | "audit-rollback";
type OwnerConfigurationTab = "role-templates" | "user-permissions" | "permission-matrix" | "scope-rules" | "locked-platform" | "change-history";

@Component({
  selector: "mop-builder",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SchemaRendererComponent],
  template: `
    <section class="px-5 py-8 lg:px-8">
      <header class="overflow-hidden rounded-lg bg-ink-950 text-white shadow-panel">
        <div class="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
          <div>
            <div class="text-xs font-semibold uppercase text-white/50">Version 7.2 Hardening</div>
            <h1 class="mt-4 text-3xl font-black tracking-normal lg:text-4xl">Workshop Builder Engine</h1>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              Schema-based customization with safe boundaries, role preview, presets, impact analysis, and rollback.
            </p>
          </div>
          <div class="grid gap-3 rounded-lg border border-white/10 bg-white/10 p-4 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="font-bold text-white/65">Active</span>
              <b>{{ home?.activeVersionId || "Loading" }}</b>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="font-bold text-white/65">Risk</span>
              <b>{{ impact?.riskLevel || "pending" }}</b>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="font-bold text-white/65">Validation</span>
              <b>{{ validation?.errors?.length || 0 }} errors / {{ validation?.warnings?.length || 0 }} warnings</b>
            </div>
          </div>
        </div>
      </header>

      <nav class="mt-5 grid gap-2 rounded-lg border border-black/10 bg-white p-2 shadow-sm md:grid-cols-2 xl:grid-cols-5">
        <a *ngFor="let item of nav" [routerLink]="['/' + item.route]" class="rounded-md px-3 py-3 text-center text-sm font-black transition"
          [ngClass]="studioPage === item.page ? 'bg-ink-950 text-white' : 'bg-black/[0.03] text-ink-700 hover:bg-black/[0.06]'">
          {{ item.label }}
        </a>
      </nav>

      <div class="sticky top-0 z-10 mt-5 rounded-lg border border-black/10 bg-white p-3 shadow-sm">
        <div class="grid gap-3 xl:grid-cols-[1fr_auto]">
          <div class="flex flex-wrap gap-2">
            <select class="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-bold" [(ngModel)]="selectedPageKey" (ngModelChange)="previewSelected()">
              <option *ngFor="let page of draft?.pageTemplates || []" [value]="page.pageKey">{{ page.pageKey }}</option>
            </select>
            <select class="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-bold" [(ngModel)]="selectedIdentityId" (ngModelChange)="selectIdentity()">
              <option *ngFor="let identity of draft?.previewIdentities || []" [value]="identity.id">{{ identity.displayName }}</option>
            </select>
            <select class="rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-bold" [(ngModel)]="device" (ngModelChange)="previewSelected()">
              <option>desktop</option>
              <option>tablet</option>
              <option>mobile</option>
            </select>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="mop-button-secondary" type="button" (click)="undo()" [disabled]="!undoStack.length">Undo</button>
            <button class="mop-button-secondary" type="button" (click)="redo()" [disabled]="!redoStack.length">Redo</button>
            <button class="mop-button-secondary" type="button" (click)="discardDraft()">Discard Draft</button>
            <button class="mop-button-secondary" type="button" (click)="saveDraft('Builder draft saved')">Save Draft</button>
            <button class="mop-button-primary" type="button" (click)="publish()" [disabled]="!!validation?.errors?.length">Publish</button>
          </div>
        </div>
      </div>

      <div *ngIf="loading" class="mop-panel mt-5 p-8 text-center text-sm font-bold text-ink-500">Loading Builder configuration...</div>
      <div *ngIf="error" class="mt-5 rounded-lg border border-signal-red/20 bg-signal-rose p-4 text-sm font-bold text-signal-red">{{ error }}</div>

      <div class="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside class="grid content-start gap-4">
          <section class="mop-panel p-4">
            <h2 class="text-lg font-black">Page tree</h2>
            <div class="mt-3 grid gap-2">
              <button *ngFor="let page of draft?.pageTemplates || []" type="button" class="rounded-md px-3 py-2 text-left text-sm font-bold"
                [ngClass]="selectedPageKey === page.pageKey ? 'bg-ink-950 text-white' : 'bg-black/[0.04] text-ink-700'"
                (click)="selectedPageKey = page.pageKey; selectedRole = page.role; previewSelected()">
                {{ page.pageKey }}
              </button>
            </div>
          </section>

          <section class="mop-panel p-4">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-lg font-black">Sections</h2>
              <button class="mop-button-secondary px-3 py-1 text-xs" type="button" (click)="resetPage()">Reset Page</button>
            </div>
            <div class="mt-3 grid gap-2">
              <div *ngFor="let section of activeSections(); let i = index" draggable="true"
                (dragstart)="dragStart(i)" (dragover)="allowDrop($event)" (drop)="dropSection(i)"
                class="rounded-md border border-black/10 bg-white p-3 text-sm">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="text-xs font-bold uppercase text-ink-500">{{ section.type }}</div>
                    <div class="font-black">{{ section.title }}</div>
                  </div>
                  <span class="mop-pill">{{ section.order }}</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button class="mop-button-secondary px-3 py-1 text-xs" type="button" (click)="moveSection(section, -1)" [disabled]="i === 0">Up</button>
                  <button class="mop-button-secondary px-3 py-1 text-xs" type="button" (click)="moveSection(section, 1)" [disabled]="i === activeSections().length - 1">Down</button>
                  <button class="mop-button-secondary px-3 py-1 text-xs" type="button" (click)="hideSection(section)" [disabled]="section.locked || section.safetyCritical">Hide</button>
                </div>
              </div>
            </div>
          </section>

          <section class="mop-panel p-4">
            <h2 class="text-lg font-black">Hidden Sections</h2>
            <div class="mt-3 grid gap-2">
              <div *ngFor="let section of hiddenSections()" class="rounded-md bg-black/[0.04] p-3 text-sm">
                <div class="font-black">{{ section.title }}</div>
                <div class="mt-1 text-xs text-ink-500">{{ section.hiddenReason || "Hidden from page" }}</div>
                <button class="mop-button-secondary mt-3 px-3 py-1 text-xs" type="button" (click)="restoreSection(section)">Restore</button>
              </div>
              <div *ngIf="!hiddenSections().length" class="rounded-md bg-black/[0.04] p-4 text-sm font-bold text-ink-500">No hidden sections.</div>
            </div>
          </section>
        </aside>

        <main class="grid content-start gap-5">
          <section class="mop-panel p-5" *ngIf="studioPage === 'home'">
            <h2 class="text-xl font-black">Builder Home</h2>
            <div class="mop-grid mt-5">
              <article class="mop-card"><div class="mop-pill">Pages</div><h3 class="mt-4 text-3xl font-black">{{ home?.pagesCustomized || 0 }}</h3></article>
              <article class="mop-card"><div class="mop-pill">Roles</div><h3 class="mt-4 text-3xl font-black">{{ home?.rolesAffected?.length || 0 }}</h3></article>
              <article class="mop-card"><div class="mop-pill">Users</div><h3 class="mt-4 text-3xl font-black">{{ impact?.affectedUsersCount || 0 }}</h3></article>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'brand-theme' && draft">
            <h2 class="text-xl font-black">Brand & Theme</h2>
            <div class="mt-5 grid gap-4 md:grid-cols-2">
              <label class="grid gap-2 text-sm font-bold">Primary <input type="color" class="h-12 rounded-md border border-black/10 p-1" [(ngModel)]="draft.designTokens.primaryColor" (change)="markEdit()" /></label>
              <label class="grid gap-2 text-sm font-bold">Accent <input type="color" class="h-12 rounded-md border border-black/10 p-1" [(ngModel)]="draft.designTokens.accentColor" (change)="markEdit()" /></label>
              <label class="grid gap-2 text-sm font-bold">Text <input type="color" class="h-12 rounded-md border border-black/10 p-1" [(ngModel)]="draft.designTokens.textColor" (change)="markEdit()" /></label>
              <label class="grid gap-2 text-sm font-bold">Background <input type="color" class="h-12 rounded-md border border-black/10 p-1" [(ngModel)]="draft.designTokens.backgroundColor" (change)="markEdit()" /></label>
              <label class="grid gap-2 text-sm font-bold">Density
                <select class="rounded-md border border-black/10 bg-white p-3" [(ngModel)]="draft.designTokens.density" (change)="markEdit()"><option>comfortable</option><option>compact</option></select>
              </label>
              <label class="grid gap-2 text-sm font-bold">Radius
                <select class="rounded-md border border-black/10 bg-white p-3" [(ngModel)]="draft.designTokens.radius" (change)="markEdit()"><option>sharp</option><option>soft</option><option>round</option></select>
              </label>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'page-builder'">
            <h2 class="text-xl font-black">Page Builder</h2>
            <p class="mt-1 text-sm text-ink-500">Drag sections in the left tree, rename here, hide optional sections, restore hidden ones, or reset to default.</p>
            <div class="mt-5 grid gap-3">
              <article *ngFor="let section of activeSections()" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <label class="grid gap-2 text-sm font-bold">Section title
                    <input class="rounded-md border border-black/10 p-3" [(ngModel)]="section.title" [disabled]="section.locked" (change)="markEdit()" />
                  </label>
                  <div class="flex flex-wrap items-end gap-2">
                    <button class="mop-button-secondary" type="button" (click)="resetSection(section)">Reset Section</button>
                    <span *ngIf="section.safetyCritical" class="mop-pill">Safety critical</span>
                    <span *ngIf="section.locked" class="mop-pill">Locked</span>
                  </div>
                </div>
                <div class="mt-3 grid gap-2 md:grid-cols-2" *ngIf="settingKeys(section).length">
                  <label *ngFor="let key of settingKeys(section)" class="grid gap-1 text-xs font-bold text-ink-500">
                    {{ key }}
                    <input class="rounded-md border border-black/10 p-2 text-sm text-ink-900" [ngModel]="section.settings[key]" (ngModelChange)="setSetting(section, key, $event)" />
                  </label>
                </div>
              </article>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'role-experience'">
            <h2 class="text-xl font-black">Role Experience Studio</h2>
            <div class="mt-5 grid gap-3">
              <article *ngFor="let role of draft?.roleExperiences || []" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div><div class="text-xs font-bold uppercase text-ink-500">{{ role.role }}</div><h3 class="mt-1 font-black">{{ role.defaultLandingPage }}</h3></div>
                  <select class="rounded-md border border-black/10 bg-white p-3 text-sm font-bold" [(ngModel)]="role.mode" (change)="markEdit()"><option>simple</option><option>advanced</option></select>
                </div>
                <div class="mt-3 flex flex-wrap gap-2"><span *ngFor="let item of role.visibleNavigation" class="mop-pill">{{ item }}</span></div>
              </article>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'workflow-feature'">
            <h2 class="text-xl font-black">Workflow & Feature Studio</h2>
            <p class="mt-1 text-sm text-ink-500">Policy-based only. No arbitrary workflow automation, scripts, SQL, or custom API calls.</p>
            <div class="mt-5 grid gap-4">
              <article *ngFor="let policy of draft?.featurePolicies || []" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><b>{{ policy.key }}</b><div class="mt-1 text-xs text-ink-500">Dependencies: {{ policy.dependencies.join(", ") || "none" }}</div></div>
                  <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" [(ngModel)]="policy.enabled" [disabled]="policy.safetyLocked" (change)="markEdit()" /> Enabled</label>
                </div>
              </article>
              <article *ngFor="let policy of draft?.workflowPolicies || []" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><b>{{ policy.key }}</b><div class="mt-1 text-xs text-ink-500">Affects {{ policy.affectedRoles.join(", ") }}</div></div>
                  <span class="mop-pill">{{ policy.safetyLocked ? "Safety locked" : policy.value }}</span>
                </div>
              </article>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'forms-fields'">
            <h2 class="text-xl font-black">Forms & Fields</h2>
            <div class="mt-5 grid gap-4">
              <article *ngFor="let form of draft?.formSchemas || []" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3"><h3 class="text-lg font-black">{{ form.label }}</h3><span class="mop-pill">{{ form.fields.length }} fields</span></div>
                <div class="mt-3 grid gap-2">
                  <div *ngFor="let field of form.fields" class="rounded-md bg-black/[0.03] p-3 text-sm">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div><b>{{ field.label }}</b> <span class="text-ink-500">({{ field.type }})</span><div class="mt-1 text-xs text-ink-500">{{ field.fieldId }}</div></div>
                      <div class="flex flex-wrap gap-2">
                        <span *ngIf="field.core" class="mop-pill">Core</span>
                        <span *ngIf="field.archived" class="mop-pill">Archived</span>
                        <button class="mop-button-secondary px-3 py-1 text-xs" type="button" (click)="archiveField(field)" [disabled]="field.core || field.archived">Archive</button>
                        <button class="mop-button-secondary px-3 py-1 text-xs" type="button" (click)="restoreField(field)" [disabled]="!field.archived">Restore</button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'messages-templates'">
            <h2 class="text-xl font-black">Messages & Templates</h2>
            <div class="mt-5 grid gap-4">
              <article *ngFor="let template of draft?.messageTemplates || []" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><div class="text-xs font-bold uppercase text-ink-500">{{ template.channel }}</div><h3 class="text-lg font-black">{{ template.label }}</h3></div>
                  <button class="mop-button-secondary" type="button" (click)="resetMessage(template)">Reset to Default</button>
                </div>
                <textarea class="mt-3 min-h-28 w-full rounded-md border border-black/10 p-3 text-sm" [(ngModel)]="template.content" (change)="markEdit()"></textarea>
                <div class="mt-3 flex flex-wrap gap-2"><span *ngFor="let variable of template.requiredVariables" class="mop-pill">{{ variable }}</span></div>
                <div class="mt-3 rounded-md bg-black/[0.03] p-3 text-xs text-ink-500">Preview: {{ previewMessage(template) }}</div>
              </article>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'organization-access'">
            <h2 class="text-xl font-black">Organization & Access</h2>
            <p class="mt-1 text-sm text-ink-500">Organization is adjacent to Builder, but permissions and scopes remain backend-owned.</p>
            <div class="mop-grid mt-5">
              <article class="mop-card"><div class="mop-pill">Tenant Owner</div><h3 class="mt-4 text-lg font-black">Owner role is modeled for future high-risk approvals.</h3></article>
              <article class="mop-card"><div class="mop-pill">Tenant Admin</div><h3 class="mt-4 text-lg font-black">Admin permissions can be split by Builder area.</h3></article>
              <article class="mop-card"><div class="mop-pill">Scopes</div><h3 class="mt-4 text-lg font-black">Builder never overrides tenant, branch, warehouse, or customer privacy scope.</h3></article>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'configuration-permissions'">
            <div class="grid gap-4 xl:grid-cols-[1fr_280px]">
              <div>
                <div class="text-xs font-bold uppercase text-ink-500">Owner Configuration</div>
                <h2 class="mt-1 text-xl font-black">Configuration & Permissions</h2>
                <p class="mt-1 text-sm text-ink-500">Role templates, user overrides, scopes, platform locks, and permission impact stay controlled by the backend permission engine.</p>
              </div>
              <div class="grid gap-2">
                <textarea class="min-h-20 rounded-md border border-black/10 p-3 text-sm" placeholder="Reason for permission change" [(ngModel)]="configReason"></textarea>
                <div class="flex flex-wrap gap-2">
                  <button class="mop-button-secondary" type="button" (click)="previewOwnerConfigurationImpact()">Impact</button>
                  <button class="mop-button-secondary" type="button" (click)="saveOwnerConfigurationDraft()">Save Draft</button>
                  <button class="mop-button-primary" type="button" (click)="applyOwnerConfiguration()" [disabled]="ownerConfigurationImpact?.canApply === false">Apply</button>
                </div>
              </div>
            </div>

            <div class="mt-4 grid gap-2 rounded-lg border border-black/10 bg-black/[0.03] p-2 lg:grid-cols-6">
              <button *ngFor="let tab of configTabs" type="button" class="rounded-md px-3 py-2 text-sm font-black transition"
                [ngClass]="configTabClass(tab.id)" (click)="selectedConfigTab = tab.id">
                {{ tab.label }}
              </button>
            </div>

            <div *ngIf="configMessage" class="mt-4 rounded-lg border border-[#b8dcff] bg-[#eef7ff] p-3 text-sm font-bold text-[#155d8b]">{{ configMessage }}</div>

            <div *ngIf="ownerConfiguration as cfg" class="mt-5 grid gap-5">
              <section class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 class="text-lg font-black">Configuration Sections</h3><p class="mt-1 text-sm text-ink-500">Owner settings are grouped by domain so reports, inventory, operations, builder, and safety controls stay understandable.</p></div>
                  <span class="mop-pill">{{ activeConfigurationSection()?.label || "All" }}</span>
                </div>
                <div class="mop-adaptive-grid-sm mt-4">
                  <button *ngFor="let section of cfg.configurationSections" type="button" class="rounded-md border p-3 text-left text-sm transition"
                    [ngClass]="selectedConfigurationSectionId === section.id ? 'border-ink-950 bg-ink-950 text-white' : 'border-black/10 bg-black/[0.03] text-ink-700 hover:bg-black/[0.06]'"
                    (click)="selectConfigurationSection(section)">
                    <b>{{ section.label }}</b>
                    <span class="mt-1 block text-xs opacity-70">{{ section.permissionGroups.length }} groups / {{ section.routeIds.length }} pages</span>
                  </button>
                </div>
                <p class="mt-3 text-xs font-bold text-ink-500">{{ activeConfigurationSection()?.description }}</p>
              </section>

              <section class="grid gap-3 rounded-lg border border-black/10 bg-white p-4" *ngIf="selectedConfigTab === 'role-templates'">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 class="text-lg font-black">Role Templates</h3><p class="mt-1 text-sm text-ink-500">Template changes are drafted first and platform locks always win.</p></div>
                  <span class="mop-pill">{{ cfg.roleTemplates.length }} templates</span>
                </div>
                <div class="grid gap-4">
                  <article *ngFor="let template of cfg.roleTemplates" class="rounded-lg border border-black/10 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div><div class="text-xs font-bold uppercase text-ink-500">{{ template.baseRole }}</div><h4 class="font-black">{{ template.name }}</h4></div>
                      <div class="flex flex-wrap gap-2">
                        <span class="mop-pill">{{ template.usersCount }} users</span>
                        <button class="mop-button-secondary px-3 py-1 text-xs" type="button" (click)="resetOwnerRoleTemplate(template.baseRole)">Reset</button>
                      </div>
                    </div>
                    <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <button *ngFor="let definition of filteredPermissionDefinitions() | slice:0:24" type="button"
                        class="rounded-md border p-3 text-left text-xs font-bold transition"
                        [ngClass]="cellClass(templateCell(template, definition.code))"
                        [disabled]="templateCell(template, definition.code)?.locked"
                        (click)="toggleTemplatePermission(template, definition.code)">
                        <span class="block">{{ definition.label }}</span>
                        <span class="mt-1 block text-[11px] opacity-70">{{ cellLabel(templateCell(template, definition.code)) }}</span>
                      </button>
                    </div>
                  </article>
                </div>
              </section>

              <section class="grid gap-3 rounded-lg border border-black/10 bg-white p-4" *ngIf="selectedConfigTab === 'user-permissions'">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 class="text-lg font-black">User Permissions</h3><p class="mt-1 text-sm text-ink-500">Users inherit role templates, then scope and override rules are resolved by the backend.</p></div>
                  <span class="mop-pill">{{ cfg.userPermissions.length }} users</span>
                </div>
                <div class="grid gap-3">
                  <article *ngFor="let user of cfg.userPermissions" class="rounded-lg border border-black/10 p-4">
                    <div class="grid gap-3 lg:grid-cols-[1fr_auto]">
                      <div><div class="text-xs font-bold uppercase text-ink-500">{{ user.role }}</div><h4 class="font-black">{{ user.name }}</h4><p class="mt-1 text-xs text-ink-500">{{ scopeSummary(user) }}</p></div>
                      <span class="mop-pill">{{ user.overridesCount }} overrides</span>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2"><span *ngFor="let cell of user.permissions | slice:0:10" class="mop-pill">{{ cell.permission }}: {{ cell.state }}</span></div>
                  </article>
                </div>
              </section>

              <section class="grid gap-4 rounded-lg border border-black/10 bg-white p-4" *ngIf="selectedConfigTab === 'permission-matrix'">
                <div class="grid gap-3 xl:grid-cols-[1fr_auto]">
                  <div><h3 class="text-lg font-black">Permission Matrix</h3><p class="mt-1 text-sm text-ink-500">Search by feature, group, role, or user. Locked cells cannot be changed by tenant owners.</p></div>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="mop-button-secondary" [ngClass]="matrixMode === 'role' ? 'bg-ink-950 text-white' : ''" (click)="matrixMode = 'role'">Role</button>
                    <button type="button" class="mop-button-secondary" [ngClass]="matrixMode === 'user' ? 'bg-ink-950 text-white' : ''" (click)="matrixMode = 'user'">User</button>
                    <button type="button" class="mop-button-secondary" [ngClass]="matrixMode === 'feature' ? 'bg-ink-950 text-white' : ''" (click)="matrixMode = 'feature'">Feature</button>
                  </div>
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                  <input class="rounded-md border border-black/10 p-3 text-sm" placeholder="Search permissions" [(ngModel)]="permissionSearch" />
                  <select class="rounded-md border border-black/10 bg-white p-3 text-sm font-bold" [(ngModel)]="permissionGroupFilter">
                    <option *ngFor="let group of permissionGroups()" [value]="group">{{ group }}</option>
                  </select>
                </div>
                <div class="grid gap-3" *ngIf="matrixMode === 'role'">
                  <article *ngFor="let template of cfg.roleTemplates" class="rounded-lg border border-black/10 p-4">
                    <h4 class="font-black">{{ template.name }}</h4>
                    <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <div *ngFor="let definition of filteredPermissionDefinitions() | slice:0:36" class="rounded-md border p-3 text-xs" [ngClass]="cellClass(templateCell(template, definition.code))">
                        <b>{{ definition.label }}</b><div class="mt-1 opacity-70">{{ cellLabel(templateCell(template, definition.code)) }}</div>
                      </div>
                    </div>
                  </article>
                </div>
                <div class="grid gap-3" *ngIf="matrixMode === 'user'">
                  <article *ngFor="let user of cfg.userPermissions" class="rounded-lg border border-black/10 p-4">
                    <h4 class="font-black">{{ user.name }}</h4>
                    <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <div *ngFor="let definition of filteredPermissionDefinitions() | slice:0:24" class="rounded-md border p-3 text-xs" [ngClass]="cellClass(userCell(user, definition.code))">
                        <b>{{ definition.label }}</b><div class="mt-1 opacity-70">{{ cellLabel(userCell(user, definition.code)) }}</div>
                      </div>
                    </div>
                  </article>
                </div>
                <div class="grid gap-2" *ngIf="matrixMode === 'feature'">
                  <article *ngFor="let definition of filteredPermissionDefinitions()" class="rounded-lg border border-black/10 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3"><b>{{ definition.label }}</b><span class="mop-pill">{{ definition.group }}</span></div>
                    <p class="mt-2 text-sm text-ink-500">{{ definition.description }}</p>
                  </article>
                </div>
              </section>

              <section class="grid gap-3 rounded-lg border border-black/10 bg-white p-4" *ngIf="selectedConfigTab === 'scope-rules'">
                <div><h3 class="text-lg font-black">Scope Rules</h3><p class="mt-1 text-sm text-ink-500">Branch, warehouse, category, team, customer, report, and Builder scopes are resolved after templates and before runtime rules.</p></div>
                <div class="grid gap-3 md:grid-cols-2">
                  <article *ngFor="let scope of cfg.scopeRules" class="rounded-lg border border-black/10 p-4 text-sm">
                    <div class="font-black">{{ scope.targetType }}: {{ scope.targetId }}</div>
                    <div class="mt-3 grid gap-2 text-ink-500">
                      <div>Branches: {{ scope.branchScope.join(", ") || "all allowed" }}</div>
                      <div>Warehouses: {{ scope.warehouseScope.join(", ") || "all allowed" }}</div>
                      <div>Categories: {{ scope.categoryScope.join(", ") || "all allowed" }}</div>
                      <div>Reports: {{ scope.reportScope.join(", ") || "all allowed" }}</div>
                      <div>Builder: {{ scope.builderScope.join(", ") || "none" }}</div>
                    </div>
                  </article>
                </div>
              </section>

              <section class="grid gap-3 rounded-lg border border-black/10 bg-white p-4" *ngIf="selectedConfigTab === 'locked-platform'">
                <div><h3 class="text-lg font-black">Locked by Platform</h3><p class="mt-1 text-sm text-ink-500">MOP platform controls, package limits, privacy, stock correctness, and safety rules override owner configuration.</p></div>
                <div class="grid gap-3">
                  <article *ngFor="let lock of cfg.lockedByPlatform" class="rounded-lg border border-black/10 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3"><b>{{ lock.controlName }}</b><span class="mop-pill">{{ lock.source }}</span></div>
                    <div class="mt-2 text-sm text-ink-500">{{ lock.controlKey }} = {{ lock.currentValue }}</div>
                    <p class="mt-2 text-sm font-bold text-signal-red">{{ lock.reason || "Owner cannot change this control." }}</p>
                  </article>
                  <div *ngIf="!cfg.lockedByPlatform.length" class="rounded-lg bg-[#edf8f1] p-4 text-sm font-bold text-[#1f7a3d]">No platform locks are currently blocking tenant configuration.</div>
                </div>
              </section>

              <section class="grid gap-3 rounded-lg border border-black/10 bg-white p-4" *ngIf="selectedConfigTab === 'change-history'">
                <div><h3 class="text-lg font-black">Change History</h3><p class="mt-1 text-sm text-ink-500">Every draft save, high-risk apply, reset, and publish-equivalent permission event creates an audit entry.</p></div>
                <div class="grid gap-3">
                  <article *ngFor="let row of cfg.changeHistory" class="rounded-lg border border-black/10 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3"><b>{{ row.whatChanged }}</b><span class="mop-pill">{{ row.affectedUsers }} users</span></div>
                    <div class="mt-1 text-xs text-ink-500">{{ row.timestamp }} by {{ row.whoChanged }}</div>
                    <p class="mt-2 text-sm text-ink-500">{{ row.reason || "No reason recorded." }}</p>
                  </article>
                  <div *ngIf="!cfg.changeHistory.length" class="rounded-lg bg-black/[0.04] p-4 text-sm font-bold text-ink-500">No permission configuration changes yet.</div>
                </div>
              </section>

              <section class="rounded-lg border border-black/10 bg-black/[0.03] p-4">
                <div class="flex flex-wrap items-center justify-between gap-3"><h3 class="text-lg font-black">Impact Preview</h3><span class="mop-pill">{{ ownerConfigurationImpact?.canApply === false ? "Blocked" : "Can apply" }}</span></div>
                <div class="mt-3 grid gap-2 text-sm md:grid-cols-4">
                  <div class="rounded-md bg-white p-3"><b>{{ ownerConfigurationImpact?.affectedUsers || 0 }}</b><br />users</div>
                  <div class="rounded-md bg-white p-3"><b>{{ ownerConfigurationImpact?.affectedRoles?.length || 0 }}</b><br />roles</div>
                  <div class="rounded-md bg-white p-3"><b>{{ ownerConfigurationImpact?.affectedPages?.length || 0 }}</b><br />pages</div>
                  <div class="rounded-md bg-white p-3"><b>{{ ownerConfigurationImpact?.platformConflicts?.length || 0 }}</b><br />platform conflicts</div>
                </div>
              </section>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'publish-center'">
            <h2 class="text-xl font-black">Publish Center</h2>
            <div class="mt-4 grid gap-3">
              <div class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3"><b>Risk level</b><span class="mop-pill">{{ impact?.riskLevel || "pending" }}</span></div>
                <div class="mt-3 grid gap-2 text-sm text-ink-500"><div *ngFor="let reason of impact?.riskReasons || []">{{ reason }}</div></div>
              </div>
              <textarea class="min-h-20 rounded-md border border-black/10 p-3 text-sm" placeholder="Publish reason required for high-risk changes" [(ngModel)]="publishReason"></textarea>
              <button class="mop-button-primary" type="button" (click)="publish()" [disabled]="!!validation?.errors?.length">Publish Draft</button>
            </div>
          </section>

          <section class="mop-panel p-5" *ngIf="studioPage === 'audit-rollback'">
            <h2 class="text-xl font-black">Audit & Rollback</h2>
            <div class="mt-5 grid gap-3">
              <article *ngFor="let row of history" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div><div class="font-black">{{ row.versionId }}</div><div class="mt-1 text-xs text-ink-500">{{ row.publishedAt }} by {{ row.publishedBy }}</div></div>
                  <button class="mop-button-secondary" type="button" (click)="rollback(row.versionId)">Rollback</button>
                </div>
                <p class="mt-3 text-sm text-ink-500">{{ row.reason || "Published Builder snapshot" }}</p>
              </article>
            </div>
          </section>

          <section class="mop-panel p-5">
            <h2 class="text-xl font-black">Presets</h2>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <article *ngFor="let preset of presets" class="rounded-lg border border-black/10 bg-white p-4">
                <div class="flex items-start justify-between gap-3"><div><b>{{ preset.label }}</b><p class="mt-1 text-sm text-ink-500">{{ preset.description }}</p></div><span class="mop-pill">{{ preset.riskLevel }}</span></div>
                <button class="mop-button-secondary mt-4" type="button" (click)="applyPreset(preset.id)">Apply to Draft</button>
              </article>
            </div>
          </section>
        </main>

        <aside class="grid content-start gap-5">
          <mop-schema-renderer [preview]="preview"></mop-schema-renderer>
          <section class="mop-panel p-5">
            <h2 class="text-xl font-black">Impact Preview</h2>
            <div class="mt-3 grid gap-2 text-sm">
              <div class="rounded-md bg-black/[0.04] p-3"><b>{{ impact?.affectedPages?.length || 0 }}</b> pages affected</div>
              <div class="rounded-md bg-black/[0.04] p-3"><b>{{ impact?.affectedRoles?.length || 0 }}</b> roles affected</div>
              <div class="rounded-md bg-black/[0.04] p-3"><b>{{ impact?.affectedUsersCount || 0 }}</b> estimated users affected</div>
            </div>
          </section>
          <section class="mop-panel p-5">
            <h2 class="text-xl font-black">Validation</h2>
            <div class="mt-3 grid gap-2">
              <div *ngFor="let issue of allIssues()" class="rounded-md border p-3 text-sm"
                [ngClass]="issue.severity === 'error' ? 'border-signal-red/20 bg-signal-rose text-signal-red' : 'border-[#f2d38a] bg-[#fff8e6] text-[#7a5200]'">
                <b>{{ issue.area }}</b> - {{ issue.message }}
              </div>
              <div *ngIf="!allIssues().length" class="rounded-md bg-[#edf8f1] p-3 text-sm font-bold text-[#1f7a3d]">No Builder validation issues.</div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  `
})
export class BuilderComponent implements OnInit {
  private readonly api = inject(BuilderApiService);
  private readonly route = inject(ActivatedRoute);

  readonly nav: Array<{ page: BuilderStudioPage; route: string; label: string }> = [
    { page: "home", route: "builder-home", label: "Home" },
    { page: "brand-theme", route: "builder-brand-theme", label: "Brand" },
    { page: "page-builder", route: "builder-page-builder", label: "Pages" },
    { page: "role-experience", route: "builder-role-experience", label: "Roles" },
    { page: "workflow-feature", route: "builder-workflow-feature", label: "Workflows" },
    { page: "forms-fields", route: "builder-forms-fields", label: "Forms" },
    { page: "messages-templates", route: "builder-messages-templates", label: "Messages" },
    { page: "organization-access", route: "builder-organization-access", label: "Org Access" },
    { page: "configuration-permissions", route: "builder-configuration-permissions", label: "Config" },
    { page: "publish-center", route: "builder-publish-center", label: "Publish" },
    { page: "audit-rollback", route: "builder-audit-rollback", label: "Rollback" }
  ];

  readonly configTabs: Array<{ id: OwnerConfigurationTab; label: string }> = [
    { id: "role-templates", label: "Role Templates" },
    { id: "user-permissions", label: "User Permissions" },
    { id: "permission-matrix", label: "Permission Matrix" },
    { id: "scope-rules", label: "Scope Rules" },
    { id: "locked-platform", label: "Locked by Platform" },
    { id: "change-history", label: "Change History" }
  ];

  studioPage: BuilderStudioPage = "home";
  loading = true;
  error = "";
  home?: BuilderHomeDto;
  draft?: BuilderConfiguration;
  validation?: BuilderValidationResult;
  impact?: BuilderImpactPreview;
  preview?: BuilderPreviewResponse;
  ownerConfiguration?: OwnerConfigurationPermissionsDto;
  ownerConfigurationImpact?: OwnerPermissionImpactPreviewDto;
  presets: BuilderPreset[] = [];
  history: BuilderHistoryRow[] = [];
  selectedPageKey: BuilderPageKey = "technician.home";
  selectedRole: BuilderRole = "technician";
  selectedIdentityId = "preview-tech-ahmed";
  device: BuilderDevicePreview = "desktop";
  publishReason = "";
  selectedConfigTab: OwnerConfigurationTab = "role-templates";
  selectedConfigurationSectionId = "reports-intelligence";
  permissionSearch = "";
  permissionGroupFilter = "All";
  matrixMode: "role" | "user" | "feature" = "role";
  configReason = "";
  configMessage = "";
  undoStack: BuilderConfiguration[] = [];
  redoStack: BuilderConfiguration[] = [];
  private dragIndex?: number;

  ngOnInit() {
    this.route.data.subscribe((data) => this.studioPage = (data["builderPage"] || "home") as BuilderStudioPage);
    void this.load();
  }

  async load() {
    this.loading = true;
    this.error = "";
    try {
      const [home, draft, validation, impact, history, presets, ownerConfiguration] = await Promise.all([
        this.api.home(),
        this.api.draft(),
        this.api.validate(),
        this.api.impact(),
        this.api.history(),
        this.api.presets(),
        this.api.configurationPermissions()
      ]);
      this.home = home;
      this.draft = draft;
      this.validation = validation;
      this.impact = impact;
      this.history = history;
      this.presets = presets;
      this.ownerConfiguration = ownerConfiguration;
      this.ownerConfigurationImpact = ownerConfiguration.draftImpact;
      this.syncIdentityWithRole();
      await this.previewSelected();
    } catch (error: unknown) {
      this.error = this.messageFor(error, "Builder failed to load.");
    } finally {
      this.loading = false;
    }
  }

  selectedTemplate(): PageTemplate | undefined {
    return this.draft?.pageTemplates.find((page) => page.pageKey === this.selectedPageKey);
  }

  activeSections() {
    return [...(this.selectedTemplate()?.sections || [])].filter((section) => section.enabled).sort((a, b) => a.order - b.order);
  }

  hiddenSections() {
    return [...(this.selectedTemplate()?.sections || [])].filter((section) => !section.enabled).sort((a, b) => a.order - b.order);
  }

  allIssues() {
    return [...(this.validation?.errors || []), ...(this.validation?.warnings || [])];
  }

  settingKeys(section: PageSection) {
    return Object.keys(section.settings || {});
  }

  markEdit() {
    if (!this.draft) return;
    this.undoStack.push(this.clone(this.draft));
    this.redoStack = [];
  }

  hideSection(section: PageSection) {
    if (section.locked || section.safetyCritical) return;
    this.markEdit();
    section.enabled = false;
    section.hiddenAt = new Date().toISOString();
    section.hiddenReason = "Hidden by Builder editor.";
    void this.previewSelected();
  }

  restoreSection(section: PageSection) {
    this.markEdit();
    section.enabled = true;
    section.restoredAt = new Date().toISOString();
    section.hiddenReason = undefined;
    void this.previewSelected();
  }

  moveSection(section: PageSection, direction: -1 | 1) {
    const sections = this.activeSections();
    const index = sections.findIndex((item) => item.id === section.id);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    this.reorderActive(index, nextIndex);
  }

  dragStart(index: number) {
    this.dragIndex = index;
  }

  allowDrop(event: DragEvent) {
    event.preventDefault();
  }

  dropSection(index: number) {
    if (this.dragIndex === undefined || this.dragIndex === index) return;
    this.reorderActive(this.dragIndex, index);
    this.dragIndex = undefined;
  }

  reorderActive(from: number, to: number) {
    const template = this.selectedTemplate();
    if (!template) return;
    this.markEdit();
    const active = this.activeSections();
    const [moved] = active.splice(from, 1);
    active.splice(to, 0, moved);
    active.forEach((section, orderIndex) => section.order = orderIndex + 1);
    const hidden = template.sections.filter((section) => !section.enabled);
    template.sections = [...active, ...hidden];
    void this.previewSelected();
  }

  setSetting(section: PageSection, key: string, value: string) {
    this.markEdit();
    section.settings[key] = value;
  }

  archiveField(field: FormFieldSchema) {
    if (field.core) return;
    this.markEdit();
    field.archived = true;
    field.required = false;
    field.updatedAt = new Date().toISOString();
  }

  restoreField(field: FormFieldSchema) {
    this.markEdit();
    field.archived = false;
    field.updatedAt = new Date().toISOString();
  }

  resetMessage(template: MessageTemplate) {
    this.markEdit();
    template.versionHistory.push({ versionId: `local-${Date.now()}`, content: template.content, changedAt: new Date().toISOString(), changedBy: "tenant_admin", reason: "Reset to default." });
    template.content = template.defaultContent;
  }

  previewMessage(template: MessageTemplate) {
    return [
      ["{{customer_name}}", "Omar"],
      ["{{asset_identifier}}", "ABC-1234"],
      ["{{branch_name}}", "Nasr City Branch"],
      ["{{decision_link}}", "https://mop.example/decision/demo"],
      ["{{work_order_id}}", "WO-2026-0001"]
    ].reduce((text, [token, value]) => text.split(token).join(value), template.content);
  }

  permissionGroups() {
    const active = this.activeConfigurationSection();
    const groups = active?.permissionGroups?.length ? active.permissionGroups : this.ownerConfiguration?.permissionGroups || [];
    return ["All", ...groups];
  }

  activeConfigurationSection(): OwnerConfigurationSectionDto | undefined {
    return this.ownerConfiguration?.configurationSections.find((section) => section.id === this.selectedConfigurationSectionId)
      || this.ownerConfiguration?.configurationSections[0];
  }

  selectConfigurationSection(section: OwnerConfigurationSectionDto) {
    this.selectedConfigurationSectionId = section.id;
    this.permissionGroupFilter = "All";
    this.configMessage = `${section.label} configuration selected.`;
  }

  filteredPermissionDefinitions(): OwnerPermissionDefinition[] {
    const search = this.permissionSearch.trim().toLowerCase();
    const activeGroups = this.activeConfigurationSection()?.permissionGroups || [];
    return (this.ownerConfiguration?.permissionDefinitions || []).filter((definition) => {
      const matchesSection = !activeGroups.length || activeGroups.includes(definition.group);
      const matchesGroup = this.permissionGroupFilter === "All" || definition.group === this.permissionGroupFilter;
      const matchesSearch = !search || `${definition.code} ${definition.label} ${definition.description} ${definition.group}`.toLowerCase().includes(search);
      return matchesSection && matchesGroup && matchesSearch;
    });
  }

  templateCell(template: OwnerRoleTemplateDto, permission: string): OwnerPermissionCellDto | undefined {
    return template.permissions.find((cell) => cell.permission === permission);
  }

  userCell(user: OwnerUserPermissionDto, permission: string): OwnerPermissionCellDto | undefined {
    return user.permissions.find((cell) => cell.permission === permission);
  }

  cellClass(cell?: OwnerPermissionCellDto) {
    if (!cell) return "border-black/10 bg-black/[0.03] text-ink-400";
    if (cell.locked || cell.state === "locked_by_platform" || cell.state === "locked_by_plan") return "border-signal-red/20 bg-signal-rose text-signal-red";
    if (cell.effectiveValue) return "border-[#b8e0c5] bg-[#edf8f1] text-[#1f7a3d]";
    if (cell.state === "inherited") return "border-[#b8dcff] bg-[#eef7ff] text-[#155d8b]";
    return "border-black/10 bg-black/[0.04] text-ink-500";
  }

  cellLabel(cell?: OwnerPermissionCellDto) {
    if (!cell) return "Not available";
    if (cell.locked) return cell.reason || cell.state;
    return `${cell.effectiveValue ? "Allowed" : "Denied"} - ${cell.source}`;
  }

  toggleTemplatePermission(template: OwnerRoleTemplateDto, permission: string) {
    const cell = this.templateCell(template, permission);
    if (!cell || cell.locked) return;
    cell.effectiveValue = !cell.effectiveValue;
    cell.state = cell.effectiveValue ? "allowed" : "denied";
    cell.source = "tenant_configuration";
    this.configMessage = "Permission draft changed. Run Impact before applying.";
    this.ownerConfigurationImpact = {
      affectedUsers: this.ownerConfiguration?.userPermissions.length || 0,
      affectedRoles: this.ownerConfiguration?.roleTemplates.map((item) => item.baseRole) || [],
      affectedPages: this.ownerConfiguration?.draftImpact.affectedPages || [],
      affectedActions: [permission],
      platformConflicts: [],
      canApply: true
    };
  }

  scopeSummary(user: OwnerUserPermissionDto) {
    const scopes = [
      `branches ${user.branchScope.length || "all"}`,
      `warehouses ${user.warehouseScope.length || "all"}`,
      `categories ${user.categoryScope.length || "all"}`,
      `reports ${user.reportScope.length || "all"}`
    ];
    return scopes.join(" / ");
  }

  configTabClass(tab: OwnerConfigurationTab) {
    return this.selectedConfigTab === tab ? "bg-ink-950 text-white" : "bg-white text-ink-700 hover:bg-black/[0.06]";
  }

  ownerConfigDraft(): OwnerConfigurationDraftDto | undefined {
    if (!this.ownerConfiguration) return undefined;
    return {
      roleTemplates: this.ownerConfiguration.roleTemplates,
      userPermissions: this.ownerConfiguration.userPermissions,
      scopeRules: this.ownerConfiguration.scopeRules as OwnerScopeRuleDto[],
      reason: this.configReason || "Owner configuration permission update."
    };
  }

  async saveOwnerConfigurationDraft() {
    const draft = this.ownerConfigDraft();
    if (!draft) return;
    try {
      const ownerConfiguration = await this.api.saveConfigurationPermissionsDraft(draft);
      this.ownerConfiguration = ownerConfiguration;
      this.ownerConfigurationImpact = ownerConfiguration.draftImpact;
      this.configMessage = "Configuration permission draft saved.";
    } catch (error: unknown) {
      this.error = this.messageFor(error, "Configuration permission draft failed.");
    }
  }

  async previewOwnerConfigurationImpact() {
    const draft = this.ownerConfigDraft();
    if (!draft) return;
    try {
      this.ownerConfigurationImpact = await this.api.previewConfigurationPermissions(draft);
      this.configMessage = this.ownerConfigurationImpact?.canApply ? "Impact preview is clear." : "Impact preview found platform conflicts.";
    } catch (error: unknown) {
      this.error = this.messageFor(error, "Configuration impact preview failed.");
    }
  }

  async applyOwnerConfiguration() {
    const draft = this.ownerConfigDraft();
    if (!draft) return;
    try {
      const ownerConfiguration = await this.api.applyConfigurationPermissions(draft);
      this.ownerConfiguration = ownerConfiguration;
      this.ownerConfigurationImpact = ownerConfiguration.draftImpact;
      this.configMessage = "Configuration permissions applied and audited.";
    } catch (error: unknown) {
      this.error = this.messageFor(error, "Configuration permission apply failed.");
    }
  }

  async resetOwnerRoleTemplate(role: string) {
    try {
      const ownerConfiguration = await this.api.resetConfigurationRoleTemplate(role);
      this.ownerConfiguration = ownerConfiguration;
      this.ownerConfigurationImpact = ownerConfiguration.draftImpact;
      this.configMessage = `${role} template reset to default.`;
    } catch (error: unknown) {
      this.error = this.messageFor(error, "Configuration role template reset failed.");
    }
  }

  async saveDraft(reason: string) {
    if (!this.draft) return;
    try {
      this.draft = await this.api.updateDraft({
        designTokens: this.draft.designTokens,
        pageTemplates: this.draft.pageTemplates,
        roleExperiences: this.draft.roleExperiences,
        featurePolicies: this.draft.featurePolicies,
        workflowPolicies: this.draft.workflowPolicies,
        formSchemas: this.draft.formSchemas,
        messageTemplates: this.draft.messageTemplates,
        reason
      });
      await this.refreshChecks();
      await this.previewSelected();
    } catch (error: unknown) {
      this.error = this.messageFor(error, "Builder draft save failed.");
    }
  }

  async discardDraft() {
    this.draft = await this.api.discardDraft();
    this.undoStack = [];
    this.redoStack = [];
    await this.refreshChecks();
    await this.previewSelected();
  }

  async resetPage() {
    this.draft = await this.api.resetPage(this.selectedPageKey);
    await this.refreshChecks();
    await this.previewSelected();
  }

  async resetSection(section: PageSection) {
    this.draft = await this.api.resetSection(this.selectedPageKey, section.id);
    await this.refreshChecks();
    await this.previewSelected();
  }

  async applyPreset(presetId: string) {
    this.draft = await this.api.applyPreset(presetId);
    await this.refreshChecks();
    await this.previewSelected();
  }

  async previewSelected() {
    if (!this.draft) return;
    this.syncRoleWithPage();
    try {
      this.preview = await this.api.preview({
        pageKey: this.selectedPageKey,
        asRole: this.selectedRole,
        asIdentityId: this.selectedIdentityId,
        device: this.device
      });
    } catch (error: unknown) {
      this.error = this.messageFor(error, "Builder preview failed.");
    }
  }

  async publish() {
    await this.api.publish(this.publishReason || undefined);
    await this.load();
  }

  async rollback(versionId: string) {
    await this.api.rollback(versionId);
    await this.load();
  }

  async refreshChecks() {
    const [validation, impact, home] = await Promise.all([this.api.validate(), this.api.impact(), this.api.home()]);
    this.validation = validation;
    this.impact = impact;
    this.home = home;
  }

  undo() {
    if (!this.draft || !this.undoStack.length) return;
    this.redoStack.push(this.clone(this.draft));
    this.draft = this.undoStack.pop();
    void this.previewSelected();
  }

  redo() {
    if (!this.draft || !this.redoStack.length) return;
    this.undoStack.push(this.clone(this.draft));
    this.draft = this.redoStack.pop();
    void this.previewSelected();
  }

  selectIdentity() {
    const identity = this.currentIdentity();
    if (identity) this.selectedRole = identity.role;
    void this.previewSelected();
  }

  currentIdentity(): BuilderPreviewIdentity | undefined {
    return this.draft?.previewIdentities.find((identity) => identity.id === this.selectedIdentityId);
  }

  syncRoleWithPage() {
    const page = this.selectedTemplate();
    if (page) this.selectedRole = page.role;
    const identity = this.currentIdentity();
    if (!identity || identity.role !== this.selectedRole) this.syncIdentityWithRole();
  }

  syncIdentityWithRole() {
    const identity = this.draft?.previewIdentities.find((item) => item.role === this.selectedRole);
    if (identity) this.selectedIdentityId = identity.id;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private messageFor(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }
}
