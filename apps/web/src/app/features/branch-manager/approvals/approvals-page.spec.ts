import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApprovalsPage } from './approvals-page';
import { ApprovalsApi, type ApprovalRow, type ApprovalsResult } from './approvals.api';

function row(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    requestId: 'r1',
    workOrderId: 'wo1',
    identifier: 'DEMO-1188',
    customerName: 'Sara Nabil',
    customerPhone: '01002030424',
    status: 'SENT',
    waitingHours: 3,
    sent: true,
    itemCount: 3,
    decidedCount: 1,
    pendingTotal: '1800.00',
    hasCritical: false,
    ...overrides,
  };
}

function render(result: Partial<ApprovalsResult> | { error: unknown }) {
  const api = {
    approvals: () => ('error' in result ? throwError(() => result.error) : of({ waiting: [], unsent: [], ...result })),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ApprovalsApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(ApprovalsPage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('ApprovalsPage', () => {
  it('separates our unsent drafts from the customer chase list', () => {
    // They look identical in the database and call for opposite actions:
    // send it, versus chase them.
    const { element } = render({
      waiting: [row()],
      unsent: [row({ requestId: 'r2', sent: false })],
    });

    const titles = [...element.querySelectorAll('.band-title')].map((n) => n.textContent?.trim());
    expect(titles).toEqual(['Not sent yet', 'Waiting on the customer']);
  });

  it('puts our own delay first, because it is cheaper to fix than chasing', () => {
    const { element } = render({ waiting: [row()], unsent: [row({ requestId: 'r2', sent: false })] });

    const first = element.querySelector('.band-title')?.textContent?.trim();
    expect(first).toBe('Not sent yet');
  });

  it('shows the phone number on the row, since dialling is the action', () => {
    const { element } = render({ waiting: [row()] });

    expect(element.querySelector('.row-phone')?.textContent?.trim()).toBe('01002030424');
  });

  it('marks a safety-critical request over an overdue one', () => {
    // Safety wins over age; both edges cannot show at once.
    const { element } = render({ waiting: [row({ hasCritical: true, waitingHours: 100 })] });

    const item = element.querySelector('.row');
    expect(item?.classList.contains('row--critical')).toBe(true);
    expect(element.querySelector('.row-flag')?.textContent?.trim()).toBe('safety-critical');
  });

  it('prints the pending total exactly as the API sent it', () => {
    const { element } = render({ waiting: [row({ pendingTotal: '1800.50' })] });

    expect(element.querySelector('.row-total')?.textContent?.trim()).toBe('1800.50');
  });

  it('shows a calm empty state when nobody needs chasing', () => {
    const { element } = render({ waiting: [], unsent: [] });

    expect(element.textContent).toContain('Nobody to chase');
  });

  it('rounds waits to words past a day', () => {
    const { element } = render({ waiting: [row({ waitingHours: 74 })] });

    expect(element.querySelector('.row-waited')?.textContent?.trim()).toBe('3 days');
  });
});
