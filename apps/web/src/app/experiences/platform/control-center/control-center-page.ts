import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PERMISSION_KEYS, type StaffRole } from '@mop/shared';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import {
  ControlCenterApi,
  type EntitlementField,
  type EntitlementFieldSummary,
  type RoleLock,
  type RoleLockHistoryEntry,
  type TenantEntitlementsSummary,
  type WorkshopSummary,
} from './control-center.api';

type State = 'loading' | 'ready' | 'error';

const ROLES: readonly StaffRole[] = [
  'TENANT_OWNER',
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'TECHNICIAN',
  'INVENTORY_MANAGER',
  'TEAM_LEADER',
  'DATA_ANALYST',
];

/**
 * Governance Controls.
 *
 * The rail has pointed here since Phase 2 with nothing behind it, while
 * the backend it needs -- permission locks and tenant archive/reactivate,
 * both platform-only and both audited -- has existed and been reachable
 * only by calling the API directly.
 *
 * A lock is the platform overriding a workshop's own permission matrix:
 * once set, the Owner cannot move that permission, in either direction.
 * That is a heavy act, so every control here demands a written reason and
 * none of them fire on a single click.
 */
@Component({
  selector: 'app-control-center-page',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './control-center-page.html',
  styleUrl: './control-center-page.css',
})
export class ControlCenterPage {
  private readonly api = inject(ControlCenterApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly roles = ROLES;
  /** Every key the product actually declares -- never a hand-kept list. */
  protected readonly permissionKeys = [...PERMISSION_KEYS].sort();

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly workshops = signal<readonly WorkshopSummary[]>([]);
  protected readonly selectedId = signal<string | null>(null);

  protected readonly locks = signal<readonly RoleLock[]>([]);
  protected readonly history = signal<readonly RoleLockHistoryEntry[]>([]);
  protected readonly entitlements = signal<TenantEntitlementsSummary | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  // -- new lock form
  protected readonly formRole = signal<string>('BRANCH_MANAGER');
  protected readonly formKey = signal<string>('');
  protected readonly formAllowed = signal(false);
  protected readonly formReason = signal('');

  // -- Limits & Entitlements form
  protected readonly entitlementField = signal<EntitlementField>('maxBranches');
  protected readonly entitlementNumber = signal(1);
  protected readonly entitlementExports = signal<readonly string[]>([]);
  protected readonly entitlementReason = signal('');

  // -- lifecycle form
  protected readonly lifecycleReason = signal('');

  protected readonly selected = computed(
    () => this.workshops().find((w) => w.id === this.selectedId()) ?? null,
  );
  protected readonly selectedEntitlement = computed(
    () => this.entitlements()?.fields.find((field) => field.field === this.entitlementField()) ?? null,
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .workshops()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.workshops.set(page.items);
          this.state.set('ready');
          const first = page.items[0];
          if (first && !this.selectedId()) this.select(first.id);
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set('error');
        },
      });
  }

  protected select(tenantId: string): void {
    this.selectedId.set(tenantId);
    this.actionError.set(null);
    this.refreshLocks();
    this.refreshEntitlements();
  }

  private refreshLocks(): void {
    const id = this.selectedId();
    if (!id) return;

    this.api
      .activeLocks(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (rows) => this.locks.set(rows) });

    this.api
      .lockHistory(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (rows) => this.history.set(rows) });
  }

  private refreshEntitlements(): void {
    const id = this.selectedId();
    if (!id) return;

    this.api
      .entitlements(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.entitlements.set(summary);
          this.syncEntitlementForm(summary);
        },
        error: (err: PresentedError) => this.actionError.set(err.message ?? 'Could not load limits.'),
      });
  }

  protected addLock(): void {
    const id = this.selectedId();
    const key = this.formKey();
    const reason = this.formReason().trim();
    if (!id) return;

    // Mirrors the server rule rather than replacing it. A lock with no
    // stated reason is unreviewable later, which defeats the point of an
    // audited override.
    if (!key) return this.actionError.set('Choose the permission to lock.');
    if (reason.length < 3) return this.actionError.set('Say why this workshop is being overridden.');

    this.busy.set(true);
    this.actionError.set(null);
    this.api
      .setLock(id, { role: this.formRole(), permissionKey: key, allowed: this.formAllowed(), reason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.formKey.set('');
          this.formReason.set('');
          this.refreshLocks();
        },
        error: (err: PresentedError) => {
          this.busy.set(false);
          this.actionError.set(err.message ?? 'That did not save.');
        },
      });
  }

  protected removeLock(lock: RoleLock): void {
    const id = this.selectedId();
    const reason = this.formReason().trim();
    if (!id) return;
    if (reason.length < 3) {
      return this.actionError.set('Removing a lock is also a governance change -- say why.');
    }

    this.busy.set(true);
    this.api
      .removeLock(id, { role: lock.role, permissionKey: lock.permissionKey, reason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.formReason.set('');
          this.refreshLocks();
        },
        error: (err: PresentedError) => {
          this.busy.set(false);
          this.actionError.set(err.message ?? 'That did not save.');
        },
      });
  }

  protected chooseEntitlementField(field: EntitlementField): void {
    this.entitlementField.set(field);
    const summary = this.entitlements();
    if (summary) this.syncEntitlementForm(summary);
  }

  protected setEntitlementOverride(): void {
    const id = this.selectedId();
    const field = this.selectedEntitlement();
    const reason = this.entitlementReason().trim();
    if (!id || !field) return;
    if (reason.length < 3) return this.actionError.set('Limits and entitlement overrides need a reason.');

    this.busy.set(true);
    this.actionError.set(null);
    const body =
      field.field === 'allowedExports'
        ? { field: field.field, stringValues: this.entitlementExports(), reason }
        : { field: field.field, numericValue: this.entitlementNumber(), reason };

    this.api
      .setEntitlementOverride(id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.busy.set(false);
          this.entitlementReason.set('');
          this.entitlements.set(summary);
          this.syncEntitlementForm(summary);
        },
        error: (err: PresentedError) => {
          this.busy.set(false);
          this.actionError.set(err.message ?? 'That limit did not save.');
        },
      });
  }

  protected clearEntitlementOverride(field: EntitlementFieldSummary): void {
    const id = this.selectedId();
    const reason = this.entitlementReason().trim();
    if (!id) return;
    if (reason.length < 3) return this.actionError.set('Clearing an override also needs a reason.');

    this.busy.set(true);
    this.actionError.set(null);
    this.api
      .clearEntitlementOverride(id, { field: field.field, reason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.busy.set(false);
          this.entitlementReason.set('');
          this.entitlements.set(summary);
          this.syncEntitlementForm(summary);
        },
        error: (err: PresentedError) => {
          this.busy.set(false);
          this.actionError.set(err.message ?? 'That override was not cleared.');
        },
      });
  }

  protected archive(): void {
    this.lifecycle('archive');
  }

  protected reactivate(): void {
    this.lifecycle('reactivate');
  }

  private lifecycle(action: 'archive' | 'reactivate'): void {
    const id = this.selectedId();
    const reason = this.lifecycleReason().trim();
    if (!id) return;
    if (reason.length < 3) {
      return this.actionError.set('Archiving or restoring a workshop needs a reason on the record.');
    }

    this.busy.set(true);
    this.actionError.set(null);
    const call = action === 'archive' ? this.api.archive(id, reason) : this.api.reactivate(id, reason);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.lifecycleReason.set('');
        this.load();
      },
      error: (err: PresentedError) => {
        this.busy.set(false);
        this.actionError.set(err.message ?? 'That did not save.');
      },
    });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected displayEntitlementValue(value: number | readonly string[]): string {
    return Array.isArray(value) ? (value.length ? value.map((item) => this.label(item)).join(', ') : 'None') : value.toString();
  }

  protected toggleExportOption(option: string, checked: boolean): void {
    const current = new Set(this.entitlementExports());
    if (checked) current.add(option);
    else current.delete(option);
    this.entitlementExports.set([...current]);
  }

  protected isExportSelected(option: string): boolean {
    return this.entitlementExports().includes(option);
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  private syncEntitlementForm(summary: TenantEntitlementsSummary): void {
    const field = summary.fields.find((item) => item.field === this.entitlementField()) ?? summary.fields[0] ?? null;
    if (!field) return;
    this.entitlementField.set(field.field);
    if (field.kind === 'number' && typeof field.effective === 'number') {
      this.entitlementNumber.set(field.effective);
    }
    if (field.kind === 'list' && Array.isArray(field.effective)) {
      this.entitlementExports.set(field.effective);
    }
  }
}
