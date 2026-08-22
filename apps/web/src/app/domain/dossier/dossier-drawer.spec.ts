import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DossierDrawer } from './dossier-drawer';
import { DossierApi, type WorkOrderDossier } from './dossier.api';

function dossier(overrides: Partial<WorkOrderDossier> = {}): WorkOrderDossier {
  return {
    workOrderId: 'wo1',
    status: 'IN_PROGRESS',
    openedAt: new Date().toISOString(),
    closedAt: null,
    customer: null,
    asset: { id: 'asset1', category: 'CARS', identifier: 'ABC-123' },
    servicesPerformed: [],
    people: [],
    parts: [],
    stockMovements: [],
    money: {
      lines: [],
      runningTotal: null,
      invoiceNumber: null,
      invoiceTotal: null,
      paid: null,
      outstanding: null,
    },
    capabilityDeviationsAtOpen: [],
    timeline: [],
    priorVisits: 0,
    ...overrides,
  };
}

describe('DossierDrawer', () => {
  it('renders the workshop capability shape that was in force when the job opened', () => {
    const api = {
      dossier: () =>
        of(
          dossier({
            capabilityDeviationsAtOpen: [{ key: 'INVENTORY', status: 'DISABLED' }],
          }),
        ),
    };

    TestBed.configureTestingModule({ providers: [{ provide: DossierApi, useValue: api }] });
    const fixture = TestBed.createComponent(DossierDrawer);
    fixture.componentRef.setInput('workOrderId', 'wo1');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Workshop shape at open');
    expect(text).toContain('inventory');
    expect(text).toContain('disabled');
  });
});
