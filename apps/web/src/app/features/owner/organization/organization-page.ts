import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { OrganizationApi, type InviteStaffInput, type StaffListItem, type StaffRole } from './organization.api';

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
 * Organization & Access -- Staff tab, per docs/detailed-specs/tenant-owner.md:
 * "This is the first page that has to work -- nothing else in the product
 * is usable for a given workshop until staff exist."
 *
 * Branches, Warehouses, and Teams are the same spec'd page's remaining
 * three tabs, not built this pass -- named as owed in PAGE_INVENTORY.md
 * rather than stubbed here, matching Owner Home's established precedent
 * for absent-vs-empty.
 */
@Component({
  selector: 'app-organization-page',
  imports: [FormsModule, ErrorBanner, ButtonDirective],
  templateUrl: './organization-page.html',
  styleUrl: './organization-page.css',
})
export class OrganizationPage {
  private readonly api = inject(OrganizationApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly roles = INVITABLE_ROLES;
  protected readonly state = signal<State>('loading');
  protected readonly staff = signal<readonly StaffListItem[]>([]);
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly showInvite = signal(false);
  protected readonly inviteForm = signal<InviteStaffInput>({ fullName: '', email: '', phone: '', role: 'DATA_ANALYST' });
  protected readonly inviteError = signal<PresentedError | null>(null);
  protected readonly submitting = signal(false);

  protected readonly needsBranch = computed(() => this.inviteForm().role === 'BRANCH_MANAGER');
  protected readonly needsWarehouse = computed(() => this.inviteForm().role === 'INVENTORY_MANAGER');
  protected readonly branchScopeText = signal('');
  protected readonly warehouseScopeText = signal('');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .listStaff()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.staff.set(page.items);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }

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
}
