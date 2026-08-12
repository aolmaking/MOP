import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';

interface AuditRow {
  readonly id: string;
  readonly actorName: string;
  readonly actorType: string;
  readonly actorIsPlatform: boolean;
  readonly action: string;
  readonly category: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string | null;
  readonly riskLevel: string;
  readonly createdAt: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly hasDiff: boolean;
}

interface AuditResponse {
  readonly rows: readonly AuditRow[];
  readonly nextCursor: string | null;
  readonly categories: readonly string[];
}

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const ACTORS = [
  { key: 'PLATFORM', label: 'Platform' },
  { key: 'TENANT_STAFF', label: 'This workshop' },
  { key: 'CUSTOMER', label: 'Customer' },
  { key: 'SYSTEM', label: 'System' },
] as const;

/**
 * Audit & Change History.
 *
 * Every risky action in the product has written an `AuditLog` row since
 * Phase 1, and nothing has ever read one -- the audit-boundary linter has
 * spent the whole project guarding a system no human could see. This is
 * the reader.
 *
 * The page's job is answering "who changed this, and why", so the reason
 * is a column rather than something hidden behind an expand, and the diff
 * opens inline rather than on its own page: comparing two states means
 * seeing them next to the row they belong to.
 */
@Component({
  selector: 'app-audit-page',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './audit-page.html',
  styleUrl: './audit-page.css',
})
export class AuditPage {
  private readonly http = inject(HttpClient);

  protected readonly rows = signal<readonly AuditRow[]>([]);
  protected readonly categories = signal<readonly string[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly loadingMore = signal(false);

  protected readonly risks = RISKS;
  protected readonly actors = ACTORS;

  protected readonly actorType = signal('');
  protected readonly category = signal('');
  protected readonly riskLevel = signal('');

  /** Which rows have their diff open. Several at once, for comparison. */
  protected readonly expanded = signal<Set<string>>(new Set());

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.expanded.set(new Set());

    this.http.get<AuditResponse>('/api/v1/audit', { params: this.params() }).subscribe({
      next: (page) => {
        this.rows.set(page.rows);
        this.categories.set(page.categories);
        this.nextCursor.set(page.nextCursor);
        this.state.set(page.rows.length === 0 ? 'empty' : 'ready');
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      },
    });
  }

  /**
   * Appends rather than replaces. An audit trail is read by scrolling
   * back through time, and paging that discards what you just read makes
   * comparing two entries impossible.
   */
  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;

    this.loadingMore.set(true);
    this.http.get<AuditResponse>('/api/v1/audit', { params: { ...this.params(), cursor } }).subscribe({
      next: (page) => {
        this.rows.update((current) => [...current, ...page.rows]);
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  protected setFilter(which: 'actorType' | 'category' | 'riskLevel', value: string): void {
    if (which === 'actorType') this.actorType.set(value);
    if (which === 'category') this.category.set(value);
    if (which === 'riskLevel') this.riskLevel.set(value);
    this.load();
  }

  protected toggle(row: AuditRow): void {
    if (!row.hasDiff) return;
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  protected isExpanded(row: AuditRow): boolean {
    return this.expanded().has(row.id);
  }

  /** Readable JSON. A one-line blob is not a diff anybody can check. */
  protected format(value: unknown): string {
    if (value === null || value === undefined) return '—';
    return JSON.stringify(value, null, 2);
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/[._]/g, ' ');
  }

  /**
   * Rendered in the reader's own locale.
   *
   * The spec asks for the workshop's timezone. That needs a tenant
   * setting the session does not carry yet, so this is the browser's for
   * now -- correct for staff sitting in the workshop, and wrong for a
   * platform admin reading from elsewhere. Recorded in PAGE_INVENTORY
   * rather than left to be discovered.
   */
  protected when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private params(): Record<string, string> {
    const params: Record<string, string> = {};
    if (this.actorType()) params['actorType'] = this.actorType();
    if (this.category()) params['category'] = this.category();
    if (this.riskLevel()) params['riskLevel'] = this.riskLevel();
    return params;
  }
}
