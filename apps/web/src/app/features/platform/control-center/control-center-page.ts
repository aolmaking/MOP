import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PERMISSION_KEYS, type StaffRole } from '@mop/shared';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { ControlCenterApi, type RoleLock, type RoleLockHistoryEntry, type WorkshopSummary } from './control-center.api';

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
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  // -- new lock form
  protected readonly formRole = signal<string>('BRANCH_MANAGER');
  protected readonly formKey = signal<string>('');
  protected readonly formAllowed = signal(false);
  protected readonly formReason = signal('');

  // -- lifecycle form
  protected readonly lifecycleReason = signal('');

  protected readonly selected = computed(
    () => this.workshops().find((w) => w.id === this.selectedId()) ?? null,
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

  protected when(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}
