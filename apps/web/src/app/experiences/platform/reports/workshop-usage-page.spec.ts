import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WorkshopUsagePage } from './workshop-usage-page';
import { PlatformReportsApi, type UsageOverview } from './platform-reports.api';

function data(overrides: Partial<UsageOverview> = {}): UsageOverview {
  return {
    activeUsers: { staff: 2, customer: 5 },
    loginsByDay: [
      { date: '2026-08-11', count: 3 },
      { date: '2026-08-12', count: 1 },
    ],
    ownerLastLogin: { at: '2026-08-12T09:00:00.000Z', staleDays: 1, isStale: false },
    staffActivity: [
      { staffUserId: 's1', fullName: 'Mona Adel', role: 'BRANCH_MANAGER', lastAction: 'workorder.status.changed', lastActionAt: '2026-08-12T09:00:00.000Z' },
      { staffUserId: 's2', fullName: 'Owner Person', role: 'TENANT_OWNER', lastAction: null, lastActionAt: null },
    ],
    customerPortal: { sessions: 12, distinctCustomers: 8, decisionResponseRate: 75 },
    ...overrides,
  };
}

async function render(response: Partial<UsageOverview> | { readonly error: unknown }, id = 'ws-1') {
  const api = { usage: () => ('error' in response ? throwError(() => response.error) : of(data(response))) };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: PlatformReportsApi, useValue: api }] });
  const fixture = TestBed.createComponent(WorkshopUsagePage);
  fixture.componentRef.setInput('id', id);
  fixture.detectChanges();
  // The initial load is queued as a microtask so the route input is set before it runs.
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('WorkshopUsagePage', () => {
  it('shows the active-user split', async () => {
    const { element } = await render({});

    expect(element.textContent).toContain('Active staff');
    expect(element.textContent).toContain('Active customers');
  });

  it('flags a stale owner login', async () => {
    const { element } = await render({ ownerLastLogin: { at: '2026-06-01T00:00:00.000Z', staleDays: 40, isStale: true } });

    expect(element.querySelector('.stat--stale')).not.toBeNull();
    expect(element.textContent).toContain('Stale');
  });

  it('does not flag a recent owner login', async () => {
    const { element } = await render({ ownerLastLogin: { at: '2026-08-12T09:00:00.000Z', staleDays: 1, isStale: false } });
    expect(element.querySelector('.stat--stale')).toBeNull();
  });

  it('shows "No recent activity" for a staff member with none, never a blank cell', async () => {
    const { element } = await render({});
    expect(element.textContent).toContain('No recent activity');
  });

  it('renders a bar per day in the logins chart', async () => {
    const { element } = await render({});
    expect(element.querySelectorAll('.bar-col').length).toBe(2);
  });

  it('shows an em dash for a null response rate rather than a misleading 0%', async () => {
    const { element } = await render({ customerPortal: { sessions: 0, distinctCustomers: 0, decisionResponseRate: null } });

    const rateStat = [...element.querySelectorAll('.stat')].find((s) => s.textContent?.includes('response rate'));
    expect(rateStat?.textContent).toContain('—');
    expect(rateStat?.textContent).not.toContain('0%');
  });

  it('names the sections not built yet, rather than showing an empty tab', async () => {
    const { element } = await render({});
    expect(element.textContent).toContain('Builder Adoption');
  });

  it('shows a distinct no-access state on 403', async () => {
    const { element } = await render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });
    expect(element.textContent).toContain("don't have access");
  });
});
