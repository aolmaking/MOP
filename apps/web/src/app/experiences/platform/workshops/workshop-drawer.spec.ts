import { TestBed } from '@angular/core/testing';
import type { WorkshopDetails } from './platform-workshops.api';
import { WorkshopDrawer } from './workshop-drawer';

function details(overrides: Partial<WorkshopDetails> = {}): WorkshopDetails {
  return {
    basicInfo: {
      id: 'ws1',
      name: 'Apex Motors',
      slug: 'apex-motors',
      country: 'EG',
      city: 'Cairo',
      businessType: 'WORKSHOP',
      primaryCategory: 'CARS',
      currency: 'EGP',
      timezone: 'Africa/Cairo',
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
    },
    ownerInfo: null,
    planInfo: {
      name: 'Growth',
      monthlyPrice: '900.00',
      limits: {
        branches: { used: 1, max: 5 },
        users: { used: 3, max: 25 },
        warehouses: { used: 0, max: 3 },
      },
    },
    branches: { items: [], total: 0 },
    warehouses: { items: [], total: 0 },
    usersByRole: [],
    enabledModules: [],
    recentActivity: [],
    recentPlatformControls: [],
    subscription: {
      planName: 'Growth',
      monthlyPrice: '900.00',
      currency: 'EGP',
      renewalDate: null,
      paidThroughDate: null,
    },
    compliantBlocked: false,
    health: { status: 'HEALTHY', warnings: [] },
    ...overrides,
  };
}

describe('WorkshopDrawer', () => {
  it('shows a compliance warning when billing is not locally covered', () => {
    const fixture = TestBed.createComponent(WorkshopDrawer);
    fixture.componentRef.setInput('details', details({ compliantBlocked: true }));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Billing documents for this country');
  });
});
