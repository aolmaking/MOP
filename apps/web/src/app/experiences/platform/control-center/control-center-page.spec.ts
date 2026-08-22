import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ControlCenterApi, type TenantEntitlementsSummary } from './control-center.api';
import { ControlCenterPage } from './control-center-page';

const SUMMARY: TenantEntitlementsSummary = {
  tenant: { id: 'ws1', name: 'Apex Motors', plan: { id: 'plan-1', code: 'GROWTH', name: 'Growth' } },
  usage: { branches: 2, users: 6, warehouses: 1 },
  fields: [
    {
      field: 'maxBranches',
      label: 'Max Branches',
      kind: 'number',
      planDefault: 5,
      effective: 3,
      usage: 2,
      override: {
        id: 'override-1',
        field: 'maxBranches',
        value: 3,
        reason: 'Temporary limit',
        createdBy: 'platform-1',
        createdAt: '2026-08-22T10:00:00.000Z',
        active: true,
      },
    },
    {
      field: 'allowedExports',
      label: 'Allowed Exports',
      kind: 'list',
      planDefault: ['OPERATIONS', 'PEOPLE'],
      effective: ['OPERATIONS'],
      options: ['OPERATIONS', 'PEOPLE'],
      override: null,
    },
  ],
};

function render(summary: TenantEntitlementsSummary = SUMMARY) {
  const api = {
    workshops: vi.fn().mockReturnValue(of({ items: [{ id: 'ws1', name: 'Apex Motors', slug: 'apex', status: 'ACTIVE' }] })),
    activeLocks: vi.fn().mockReturnValue(of([])),
    lockHistory: vi.fn().mockReturnValue(of([])),
    entitlements: vi.fn().mockReturnValue(of(summary)),
    setEntitlementOverride: vi.fn().mockReturnValue(of(summary)),
    clearEntitlementOverride: vi.fn().mockReturnValue(of(summary)),
    setLock: vi.fn().mockReturnValue(of({})),
    removeLock: vi.fn().mockReturnValue(of({ ok: true })),
    archive: vi.fn().mockReturnValue(of({ ok: true })),
    reactivate: vi.fn().mockReturnValue(of({ ok: true })),
  };

  TestBed.configureTestingModule({ providers: [{ provide: ControlCenterApi, useValue: api }] });
  const fixture = TestBed.createComponent(ControlCenterPage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, api };
}

describe('ControlCenterPage entitlements', () => {
  it('renders effective limits beside their plan defaults and usage floors', () => {
    const { element, api } = render();

    expect(api.entitlements).toHaveBeenCalledWith('ws1');
    expect(element.textContent).toContain('Limits & Entitlements');
    expect(element.textContent).toContain('Max Branches');
    expect(element.textContent).toContain('Plan: 5');
    expect(element.textContent).toContain('Used: 2');
  });

  it('posts one numeric entitlement override with a reason', () => {
    const { fixture, element, api } = render();
    const input = element.querySelector<HTMLInputElement>('input[type="number"]')!;
    input.value = '4';
    input.dispatchEvent(new Event('input'));

    const reason = element.querySelector<HTMLTextAreaElement>('textarea[placeholder="Why should this workshop differ from the plan default?"]')!;
    reason.value = 'Short term exception';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const button = [...element.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
      item.textContent?.includes('Apply entitlement override'),
    )!;
    button.click();

    expect(api.setEntitlementOverride).toHaveBeenCalledWith('ws1', {
      field: 'maxBranches',
      numericValue: 4,
      reason: 'Short term exception',
    });
  });
});
