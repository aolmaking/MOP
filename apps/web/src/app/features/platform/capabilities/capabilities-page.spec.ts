import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CapabilitiesPage } from './capabilities-page';
import { CapabilitiesApi, type CapabilityImpactPreview, type CapabilityRow } from './capabilities.api';

function row(overrides: Partial<CapabilityRow> = {}): CapabilityRow {
  return {
    key: 'INVENTORY',
    status: 'ENABLED',
    owningSystem: 'INVENTORY',
    dependencies: [],
    reversible: true,
    removable: true,
    behaviorOnRemoval: 'DROP_STEP',
    ...overrides,
  };
}

function emptyPreview(overrides: Partial<CapabilityImpactPreview> = {}): CapabilityImpactPreview {
  return {
    validation: { valid: true, errors: [] },
    affectedRecords: [],
    orphanedRoles: [],
    orphanedStaffCount: 0,
    droppedGates: [],
    reversible: true,
    blockers: [],
    ...overrides,
  };
}

async function render(rows: CapabilityRow[], preview: CapabilityImpactPreview | { error: unknown } = emptyPreview()) {
  const api = {
    current: () => of({ capabilities: rows }),
    preview: vi.fn(() => ('error' in preview ? throwError(() => preview.error) : of(preview))),
    apply: vi.fn(() => of({ ok: true as const })),
  };
  TestBed.configureTestingModule({ providers: [{ provide: CapabilitiesApi, useValue: api }] });
  const fixture = TestBed.createComponent(CapabilitiesPage);
  fixture.componentRef.setInput('id', 'w1');
  fixture.detectChanges();
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, api, page: fixture.componentInstance as never as Internals, element: fixture.nativeElement as HTMLElement };
}

interface Internals {
  stage(row: CapabilityRow, status: string): void;
  hasChanges(): boolean;
  canApply(): boolean;
  blocked(): boolean;
  reason: { set(v: string): void };
  apply(): void;
}

describe('CapabilitiesPage', () => {
  it('offers no control at all for a core capability', async () => {
    // "Cannot be switched off" and "would be disruptive" are different
    // claims; a greyed-out toggle would say neither.
    const { element } = await render([row({ key: 'OPERATIONS', removable: false, behaviorOnRemoval: null })]);

    expect(element.querySelector('.row-status')).toBeNull();
    expect(element.textContent).toContain('cannot be removed');
  });

  it('staging a change previews it without applying anything', async () => {
    const { page, api, fixture } = await render([row()]);

    page.stage(row(), 'DISABLED');
    fixture.detectChanges();

    expect(api.preview).toHaveBeenCalled();
    expect(api.apply).not.toHaveBeenCalled();
    expect(page.hasChanges()).toBe(true);
  });

  it('setting a capability back to where it started is not a change', async () => {
    // Otherwise the operator would be asked to justify a no-op, and the
    // audit trail would record one.
    const { page, fixture } = await render([row()]);

    page.stage(row(), 'DISABLED');
    page.stage(row(), 'ENABLED');
    fixture.detectChanges();

    expect(page.hasChanges()).toBe(false);
  });

  it('refuses to apply while the validator reports a blocker', async () => {
    // This is the reachability guarantee reaching the screen.
    const { page, fixture, element } = await render(
      [row()],
      emptyPreview({ blockers: ['3 work orders would be stranded with no path to a terminal state.'] }),
    );

    page.stage(row(), 'DISABLED');
    page.reason.set('Customer no longer stocks parts');
    fixture.detectChanges();

    expect(page.blocked()).toBe(true);
    expect(page.canApply()).toBe(false);
    expect(element.textContent).toContain('stranded');
  });

  it('requires a reason before applying', async () => {
    // Reshaping a workshop is the most consequential thing the platform
    // can do to a tenant; the audit entry is worthless without why.
    const { page, fixture } = await render([row()]);

    page.stage(row(), 'DISABLED');
    fixture.detectChanges();
    expect(page.canApply()).toBe(false);

    page.reason.set('Workshop stopped holding stock');
    fixture.detectChanges();
    expect(page.canApply()).toBe(true);
  });

  it('shows the live record counts the change would hit', async () => {
    const { page, fixture, element } = await render(
      [row()],
      emptyPreview({
        affectedRecords: [{ entity: 'PartRequest', states: ['REQUESTED'], count: 12, policy: 'PRESERVE_READ_ONLY' }],
      }),
    );

    page.stage(row(), 'DISABLED');
    fixture.detectChanges();

    expect(element.querySelector('.affected-count')?.textContent?.trim()).toBe('12');
    expect(element.textContent).toContain('PartRequest');
  });

  it('says plainly when nothing in progress is affected', async () => {
    const { page, fixture, element } = await render([row()]);

    page.stage(row(), 'DISABLED');
    fixture.detectChanges();

    expect(element.textContent).toContain('Nothing currently in progress is affected');
  });
});
