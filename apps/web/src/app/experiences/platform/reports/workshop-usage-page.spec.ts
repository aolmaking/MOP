import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WorkshopUsagePage } from './workshop-usage-page';
import { PlatformReportsApi, type PlatformReportDetail } from './platform-reports.api';

function data(overrides: Partial<PlatformReportDetail> = {}): PlatformReportDetail {
  return {
    workshop: { id: 'ws-1', name: 'Apex Motors', planName: 'Growth', status: 'ACTIVE', currency: 'EGP' },
    usageOverview: {
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
    },
    featureUsage: {
      windowDays: 30,
      from: '2026-07-13T00:00:00.000Z',
      to: '2026-08-12T00:00:00.000Z',
      enabledFeatureCount: 2,
      enabledUsedFeatureCount: 1,
      adoptionPercent: 50,
      rows: [
        {
          key: 'quick_inspection',
          label: 'Quick Inspection',
          capabilityKey: 'QUICK_INSPECTION',
          enabled: true,
          enablementStatus: 'ENABLED',
          currentUsage: 4,
          previousUsage: 1,
          trend: 'UP',
          adoptionSignal: 'USED',
          metric: 'Quick inspections recorded',
        },
        {
          key: 'inventory_requests',
          label: 'Inventory Requests',
          capabilityKey: 'INVENTORY',
          enabled: false,
          enablementStatus: 'DISABLED',
          currentUsage: 0,
          previousUsage: 0,
          trend: 'FLAT',
          adoptionSignal: 'DISABLED',
          metric: 'Part requests opened',
        },
      ],
    },
    builderAdoption: {
      themeCustomized: true,
      pagesCustomized: 1,
      formsCustomized: 2,
      messagesCustomized: 3,
      lastPublish: { at: '2026-08-10T10:00:00.000Z', by: 'admin', version: 2 },
      rollbackCount: 0,
      validationFailures: 1,
      highRiskChanges: [{ id: 'audit-1', action: 'capability.changed', at: '2026-08-10T10:00:00.000Z', riskLevel: 'HIGH' }],
      adoptionPercent: 100,
    },
    operationalActivity: {
      workOrders: { created: 10, completed: 6, completionRate: 60 },
      activeTasks: 3,
      waiting: { customer: 2, parts: 1 },
      blockers: { open: 1, resolvedThisPeriod: 2 },
      inventoryMovements: [{ type: 'ISSUE', count: 4 }],
      paymentsRecorded: { count: 2, totalAmount: 300, currency: 'EGP' },
      invoicesIssued: 2,
    },
    commercialSnapshot: {
      plan: 'Growth',
      subscriptionStatus: 'ACTIVE',
      paidStatus: null,
      renewalDate: null,
      overdueAmount: null,
      mrrContribution: null,
      note: 'Platform subscription billing is not backed yet.',
    },
    healthRisk: {
      status: 'AT_RISK',
      warnings: [{ code: 'low_staff_usage', message: 'No staff activity in the last 14 days.' }],
      ownerInactivityDays: 1,
      lowStaffUsageCount: 1,
      failedLogins: { count: 0, spike: null },
      builderValidationErrors: 1,
      paymentRisk: null,
      frozenOrSuspendedHistory: [],
      lowFeatureAdoptionCount: 1,
    },
    ...overrides,
  };
}

async function render(response: Partial<PlatformReportDetail> | { readonly error: unknown }, id = 'ws-1') {
  const api = { detail: () => ('error' in response ? throwError(() => response.error) : of(data(response))) };
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
    const base = data();
    const { element } = await render({
      usageOverview: { ...base.usageOverview, ownerLastLogin: { at: '2026-06-01T00:00:00.000Z', staleDays: 40, isStale: true } },
    });

    expect(element.querySelector('.stat--stale')).not.toBeNull();
    expect(element.textContent).toContain('Stale');
  });

  it('does not flag a recent owner login', async () => {
    const base = data();
    const { element } = await render({
      usageOverview: { ...base.usageOverview, ownerLastLogin: { at: '2026-08-12T09:00:00.000Z', staleDays: 1, isStale: false } },
      healthRisk: { ...base.healthRisk, status: 'HEALTHY', warnings: [] },
    });
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
    const base = data();
    const { element } = await render({
      usageOverview: { ...base.usageOverview, customerPortal: { sessions: 0, distinctCustomers: 0, decisionResponseRate: null } },
    });

    const rateStat = [...element.querySelectorAll('.stat')].find((s) => s.textContent?.includes('response rate'));
    expect(rateStat?.textContent).toContain('—');
    expect(rateStat?.textContent).not.toContain('0%');
  });

  it('renders the full detail report sections', async () => {
    const { element } = await render({});
    expect(element.textContent).toContain('Builder Adoption');
    expect(element.textContent).toContain('Feature Usage');
    expect(element.textContent).toContain('Operational Activity');
    expect(element.textContent).toContain('Commercial Snapshot');
    expect(element.textContent).toContain('Health & Risk');
  });

  it('shows a distinct no-access state on 403', async () => {
    const { element } = await render({ error: { httpStatus: 403, code: 'forbidden', message: 'No.' } });
    expect(element.textContent).toContain("don't have access");
  });
});
