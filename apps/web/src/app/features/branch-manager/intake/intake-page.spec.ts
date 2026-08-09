import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { IntakePage } from './intake-page';
import { IntakeApi, type CustomerMatch } from './intake.api';
import { clearDraft } from './intake-draft';

const customer: CustomerMatch = {
  id: 'c1',
  fullName: 'Mona Adel',
  phone: '01002030424',
  vehicles: [{ id: 'a1', category: 'CARS', identifier: 'DEMO-4471', ownerCustomerId: 'c1', ownerName: 'Mona Adel' }],
};

function render(overrides: Partial<Record<'branches' | 'search' | 'create', unknown>> = {}) {
  const api = {
    branches: () => overrides.branches ?? of({ branches: [{ id: 'b1', name: 'Giza', code: 'GZ' }] }),
    search: () => overrides.search ?? of({ customers: [customer], vehicles: [] }),
    create: vi.fn(() => overrides.create ?? of({ workOrderId: 'wo1', customerId: 'c1', assetId: 'a1', status: 'RECEIVED', ownershipTransferred: false })),
  };

  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: IntakeApi, useValue: api }],
  });

  const fixture = TestBed.createComponent(IntakePage);
  fixture.detectChanges();
  return { fixture, api, page: fixture.componentInstance as never as IntakePageInternals, element: fixture.nativeElement as HTMLElement };
}

/** The component's protected surface, as the template sees it. */
interface IntakePageInternals {
  chooseCustomer(c: CustomerMatch): void;
  patch(change: Record<string, unknown>): void;
  submit(confirm?: boolean): void;
  missing(): readonly string[];
  canSubmit(): boolean;
  ownershipConflict(): { from: string; to: string } | null;
  forbidden(): boolean;
  booked(): { workOrderId: string; ownershipTransferred: boolean } | null;
}

describe('IntakePage', () => {
  beforeEach(() => clearDraft());

  it('says what is still missing rather than counting steps', () => {
    // A step count describes the form. The advisor needs to know whether
    // they can finish, which is a different question.
    const { page } = render();

    expect(page.missing()).toContain('who the customer is');
    expect(page.missing()).toContain('which vehicle');
    expect(page.canSubmit()).toBe(false);
  });

  it('choosing a customer with exactly one vehicle picks the vehicle too', () => {
    // Asking "which car?" of someone who owns one is a question with a
    // single possible answer, which is a click spent on nothing.
    const { page, fixture } = render();

    page.chooseCustomer(customer);
    fixture.detectChanges();

    expect(page.missing()).not.toContain('which vehicle');
    expect(page.canSubmit()).toBe(true);
  });

  it('turns the ownership refusal into a decision, not an error', () => {
    // Only the advisor can tell a genuine sale from a typo in the plate,
    // so this must never surface as a generic failure banner.
    const { page, fixture } = render({
      create: throwError(() => ({ code: 'ownership_transfer_required', httpStatus: 409, message: 'no' })),
    });

    page.chooseCustomer(customer);
    page.submit();
    fixture.detectChanges();

    expect(page.ownershipConflict()).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('registered to');
  });

  it('only confirms an ownership transfer when explicitly told to', () => {
    const { page, api } = render();

    page.chooseCustomer(customer);
    page.submit();

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ confirmOwnershipTransfer: false }));
  });

  it('carries the declined-inspection fact through to the request', () => {
    // SCENARIOS.md 1.2 -- dropping this silently would let the Finish
    // Gate block a job for a step the customer refused.
    const { page, api } = render();

    page.chooseCustomer(customer);
    page.patch({ inspectionDeclined: true });
    page.submit();

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ inspectionDeclined: true }));
  });

  it('confirms on the page with the job number instead of routing to an unbuilt page', () => {
    // The Work Order Workspace is 5.D. Navigating there on success would
    // drop the advisor on a 404 redirect the instant they finish.
    const { page, fixture } = render();

    page.chooseCustomer(customer);
    page.submit();
    fixture.detectChanges();

    expect(page.booked()?.workOrderId).toBe('wo1');
    expect(fixture.nativeElement.textContent).toContain('Booked in');
    expect(fixture.nativeElement.textContent).toContain('wo1');
  });

  it('shows a no-access state when intake is not permitted', () => {
    const { page, element } = render({ branches: throwError(() => ({ httpStatus: 403, code: 'forbidden', message: 'no' })) });

    expect(page.forbidden()).toBe(true);
    expect(element.textContent).toContain("don't have access");
  });
});
