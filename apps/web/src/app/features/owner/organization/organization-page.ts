import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import type { PresentedError } from '../../../core/api/error.interceptor';
import {
  OrganizationApi,
  type BranchListItem,
  type InviteStaffInput,
  type OrganizationInfrastructure,
  type StaffListItem,
  type StaffRole,
} from './organization.api';

type Tab = 'staff' | 'branches' | 'warehouses';
type State = 'loading' | 'ready' | 'forbidden' | 'error';

const INVITABLE_ROLES: readonly StaffRole[] = [
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'TECHNICIAN',
  'INVENTORY_MANAGER',
  'TEAM_LEADER',
  'DATA_ANALYST',
];

/**
 * Organization & Access, per docs/detailed-specs/tenant-owner.md:
 * "This is the first page that has to work -- nothing else in the product
 * is usable for a given workshop until staff exist."
 *
 * Three of the spec's four tabs live here (Staff, Branches, Warehouses);
 * Teams is a separate route (`/owner/organization/teams`) that reuses
 * Branch Manager's TeamSetupPage verbatim rather than a fourth
 * implementation of the same CRUD -- see app.routes.ts's comment there.
 */
@Component({
  selector: 'app-organization-page',
  imports: [FormsModule, RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './organization-page.html',
  styleUrl: './organization-page.css',
})
export class OrganizationPage {
  private readonly api = inject(OrganizationApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly roles = INVITABLE_ROLES;
  protected readonly tab = signal<Tab>('staff');
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly staff = signal<readonly StaffListItem[]>([]);
  protected readonly infra = signal<OrganizationInfrastructure | null>(null);

  // Independent of the tab-scoped `infra` load below: the Staff tab needs
  // branch names to resolve a row's branchScope ids, but only fetches
  // staff itself, so this is loaded once, separately, on init.
  private readonly branchNameById = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly showInvite = signal(false);
  protected readonly inviteForm = signal<InviteStaffInput>({ fullName: '', email: '', phone: '', role: 'DATA_ANALYST' });
  protected readonly inviteError = signal<PresentedError | null>(null);
  protected readonly submitting = signal(false);

  protected readonly needsBranch = computed(() => this.inviteForm().role === 'BRANCH_MANAGER');
  protected readonly needsWarehouse = computed(() => this.inviteForm().role === 'INVENTORY_MANAGER');
  protected readonly branchScopeText = signal('');
  protected readonly warehouseScopeText = signal('');

  protected readonly showCreateBranch = signal(false);
  protected readonly branchDraft = signal({ name: '', code: '', city: '' });
  protected readonly showCreateWarehouse = signal(false);
  protected readonly warehouseDraft = signal({ name: '', code: '' });
  protected readonly createError = signal<PresentedError | null>(null);

  constructor() {
    this.load();
    this.api
      .infrastructure()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((infra) => this.branchNameById.set(new Map(infra.branches.map((b) => [b.id, b.name]))));
  }

  protected branchNames(ids: readonly string[]): string {
    if (ids.length === 0) return 'All branches';
    const names = this.branchNameById();
    return ids.map((id) => names.get(id) ?? id).join(', ');
  }

  protected switchTab(tab: Tab): void {
    this.tab.set(tab);
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    const onError = (err: PresentedError) => {
      this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      this.error.set(err);
    };

    if (this.tab() === 'staff') {
      this.api
        .listStaff()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (page) => {
            this.staff.set(page.items);
            this.state.set('ready');
          },
          error: onError,
        });
    } else {
      this.api
        .infrastructure()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (page) => {
            this.infra.set(page);
            this.state.set('ready');
          },
          error: onError,
        });
    }
  }

  // -- Staff ------------------------------------------------------------

  protected openInvite(): void {
    this.inviteForm.set({ fullName: '', email: '', phone: '', role: 'DATA_ANALYST' });
    this.branchScopeText.set('');
    this.warehouseScopeText.set('');
    this.inviteError.set(null);
    this.showInvite.set(true);
  }

  protected closeInvite(): void {
    this.showInvite.set(false);
  }

  protected updateField<K extends keyof InviteStaffInput>(key: K, value: InviteStaffInput[K]): void {
    this.inviteForm.set({ ...this.inviteForm(), [key]: value });
  }

  protected submitInvite(): void {
    const form = this.inviteForm();
    const input: InviteStaffInput = {
      ...form,
      branchScope: this.branchScopeText().trim() ? this.branchScopeText().split(',').map((s) => s.trim()) : undefined,
      warehouseScope: this.warehouseScopeText().trim()
        ? this.warehouseScopeText().split(',').map((s) => s.trim())
        : undefined,
    };

    this.submitting.set(true);
    this.inviteError.set(null);
    this.api
      .inviteStaff(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.showInvite.set(false);
          this.load();
        },
        error: (err: PresentedError) => {
          this.submitting.set(false);
          this.inviteError.set(err);
        },
      });
  }

  protected toggleActive(row: StaffListItem): void {
    this.api
      .setActive(row.id, !row.isActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load() });
  }

  protected toggleLocked(row: StaffListItem): void {
    this.api
      .setLocked(row.id, row.lockedAt === null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load() });
  }

  // -- Branches -----------------------------------------------------------

  protected openCreateBranch(): void {
    this.branchDraft.set({ name: '', code: '', city: '' });
    this.createError.set(null);
    this.showCreateBranch.set(true);
  }

  protected submitBranch(): void {
    const draft = this.branchDraft();
    this.createError.set(null);
    this.api
      .createBranch({ name: draft.name, code: draft.code || undefined, city: draft.city || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showCreateBranch.set(false);
          this.load();
        },
        error: (err: PresentedError) => this.createError.set(err),
      });
  }

  protected toggleBranchActive(branch: BranchListItem): void {
    this.api
      .setBranchActive(branch.id, !branch.isActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (err: PresentedError) => this.error.set(err),
      });
  }

  // -- Warehouses + matrix --------------------------------------------------

  protected openCreateWarehouse(): void {
    this.warehouseDraft.set({ name: '', code: '' });
    this.createError.set(null);
    this.showCreateWarehouse.set(true);
  }

  protected submitWarehouse(): void {
    const draft = this.warehouseDraft();
    this.createError.set(null);
    this.api
      .createWarehouse({ name: draft.name, code: draft.code || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showCreateWarehouse.set(false);
          this.load();
        },
        error: (err: PresentedError) => this.createError.set(err),
      });
  }

  protected isLinked(branchId: string, warehouseId: string): boolean {
    return this.infra()?.links.some((l) => l.branchId === branchId && l.warehouseId === warehouseId) ?? false;
  }

  protected toggleLink(branchId: string, warehouseId: string): void {
    const linked = this.isLinked(branchId, warehouseId);
    this.api
      .setLink(branchId, warehouseId, !linked)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load() });
  }
}
