import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WorkshopsPage } from './workshops-page';
import {
  PlatformWorkshopsApi,
  type WorkshopListResult,
  type WorkshopRow,
} from './platform-workshops.api';

function row(overrides: Partial<WorkshopRow> = {}): WorkshopRow {
  return {
    id: 'ws1',
    name: 'Apex Motors',
    slug: 'apex-motors',
    status: 'ACTIVE',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    createdAt: new Date().toISOString(),
    plan: { id: 'p1', name: 'Growth', monthlyPrice: '900.00' },
    owner: { fullName: 'Amira Hassan', email: 'amira@apex.local', invitePending: false },
    branchCount: 3,
    userCount: 12,
    activeWorkOrderCount: 7,
    lastActivityAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    builderStatus: 'NOT_CUSTOMIZED',
    health: 'HEALTHY',
    ...overrides,
  };
}

function render(result: Partial<WorkshopListResult> | { error: unknown }) {
  const calls: unknown[] = [];
  const api = {
    listWorkshops: (filters: unknown) => {
      calls.push(filters);
      return 'error' in result
        ? throwError(() => result.error)
        : of({ items: [], total: 0, page: 1, pageSize: 25, ...result });
    },
    listPlans: () => of([]),
    workshopDetails: () => of({}),
    freezeImpact: () => of({ staffSessionsToRevoke: 4, customerSessionsToRevoke: 11 }),
    freezeWorkshop: () => of({ ok: true as const }),
    reactivateWorkshop: () => of({ ok: true as const }),
  };

  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: PlatformWorkshopsApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(WorkshopsPage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, calls };
}

describe('WorkshopsPage', () => {
  it('asks the server to page, sort and filter -- never the browser', () => {
    // The page must read the same at 3 workshops and at 30,000, which is
    // only true if the list was never fully loaded here.
    const { calls } = render({ items: [row()], total: 1 });

    expect(calls[0]).toMatchObject({ page: 1, pageSize: 25, sort: 'last_activity_desc' });
  });

  it('shows a fixed-shape row whatever the size of the workshop behind it', () => {
    const { element } = render({ items: [row({ branchCount: 200, userCount: 4300 })], total: 1 });

    const cells = [...element.querySelectorAll('tbody td')].map((n) => n.textContent?.trim());
    expect(cells).toContain('200');
    expect(cells).toContain('4300');
    // One row, not a row that grew a nested list of 200 branches.
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('marks an owner who never accepted the invite', () => {
    const { element } = render({
      items: [row({ owner: { fullName: 'Amira Hassan', email: 'a@b.c', invitePending: true } })],
      total: 1,
    });

    expect(element.querySelector('.tag')?.textContent).toContain('Invite pending');
  });

  it('offers Freeze on a live workshop and Reactivate on a frozen one', () => {
    const live = render({ items: [row({ status: 'ACTIVE' })], total: 1 });
    expect([...live.element.querySelectorAll('.action')].map((n) => n.textContent?.trim())).toContain('Freeze');

    TestBed.resetTestingModule();

    const frozen = render({ items: [row({ status: 'FROZEN' })], total: 1 });
    const actions = [...frozen.element.querySelectorAll('.action')].map((n) => n.textContent?.trim());
    expect(actions).toContain('Reactivate');
    expect(actions).not.toContain('Freeze');
  });
});

describe('the two empty states', () => {
  it('offers to add the first workshop when the platform is genuinely empty', () => {
    const { element } = render({ items: [], total: 0 });

    expect(element.querySelector('.state-headline')?.textContent).toContain('No workshops yet');
    // The filter bar is gone, not sitting empty above the message.
    expect(element.querySelector('.controls')).toBeNull();
  });

  it('offers to clear filters when workshops exist but none match', () => {
    const { fixture, element } = render({ items: [], total: 0 });
    // A chip rather than the search box: search is debounced 400ms, and
    // driving it here would test the timer, not the empty state.
    const page = fixture.componentInstance as unknown as { toggleStatus(value: string): void };

    page.toggleStatus('FROZEN');
    fixture.detectChanges();

    // A materially different state: the data is there, the filter hides
    // it, and the fix is one click.
    expect(element.textContent).toContain('No workshops match these filters');
    expect(element.querySelector('.clear')).not.toBeNull();
  });
});

describe('freeze confirmation', () => {
  it('never acts on the click -- it opens a dialog first', () => {
    const { fixture, element } = render({ items: [row()], total: 1 });

    element.querySelector<HTMLButtonElement>('.action-danger')?.click();
    fixture.detectChanges();

    expect(element.querySelector('.dialog')).not.toBeNull();
  });

  it('shows how many people it is about to sign out', () => {
    const { fixture, element } = render({ items: [row()], total: 1 });

    element.querySelector<HTMLButtonElement>('.action-danger')?.click();
    fixture.detectChanges();

    // Live counts at dialog-open time. A cached number would tell a
    // super admin they are signing out four people when it is forty.
    expect(element.querySelector('.dialog-impact')?.textContent).toContain('4 staff');
    expect(element.querySelector('.dialog-impact')?.textContent).toContain('11 customers');
  });

  it('keeps confirm disabled until a real reason is written', () => {
    const { fixture, element } = render({ items: [row()], total: 1 });
    const page = fixture.componentInstance as unknown as {
      confirm(r: WorkshopRow): void;
      reason: { set(v: string): void };
    };

    page.confirm(row());
    fixture.detectChanges();

    const confirmButton = [...element.querySelectorAll('.dialog-actions button')].at(-1) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    page.reason.set('too short');
    fixture.detectChanges();
    expect(confirmButton.disabled).toBe(true);

    page.reason.set('Non-payment for three consecutive months.');
    fixture.detectChanges();
    expect(confirmButton.disabled).toBe(false);
  });

  it('asks for a reason to reactivate too, not only to freeze', () => {
    // Restoring access to a workshop frozen for abuse or non-payment is
    // not the lighter action just because it gives rather than takes.
    const { fixture, element } = render({ items: [row({ status: 'FROZEN' })], total: 1 });
    const page = fixture.componentInstance as unknown as { confirm(r: WorkshopRow): void };

    page.confirm(row({ status: 'FROZEN' }));
    fixture.detectChanges();

    expect(element.querySelector('.dialog-required')).not.toBeNull();
    const confirmButton = [...element.querySelectorAll('.dialog-actions button')].at(-1) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });
});
