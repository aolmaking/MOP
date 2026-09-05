import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AnalystApi, type DecisionsAnalyticsReport } from './analyst.api';
import { AnalystDecisionsPage } from './analyst-decisions-page';
import type { PresentedError } from '../../runtime/http/error.interceptor';

const mockReport: DecisionsAnalyticsReport = {
  range: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.999Z' },
  approvalRate: 75,
  rejectionRate: 25,
  planningRate: 80,
  executionRate: 60,
  fulfillmentRate: 50,
  dropOffRate: 50,
  byImportance: [
    {
      importance: 'CRITICAL',
      total: 10,
      approved: 8,
      rejected: 2,
      pending: 0,
      performed: 6,
      approvedValue: 4000,
      performedValue: 3000,
      lostValue: 1000,
    },
  ],
  averageResponseHours: 4.5,
  overdueRate: 5,
  criticalRejections: 2,
  criticalRejectionsLaterApproved: 1,
  linkOpenRate: 90,
  funnel: {
    recommendationsCreated: 20,
    sent: 18,
    viewed: 16,
    responded: 15,
    approved: 10,
    planned: 8,
    started: 6,
    performed: 5,
    invoiced: null,
    invoicedNotComputableReason: 'InvoiceLine lacks foreign key to CustomerDecisionItem',
    collected: null,
    collectedNotComputableReason: 'Payments settle invoices in aggregate',
  },
  rates: {
    responseRate: 83.3,
    approvalRate: 75,
    rejectionRate: 25,
    planningRate: 80,
    executionRate: 60,
    fulfillmentRate: 50,
    dropOffRate: 50,
  },
  value: {
    currency: 'USD',
    totalRecommendedValue: 10000,
    approvedValue: 6000,
    plannedValue: 4800,
    performedValue: 3000,
    unperformedApprovedValue: 3000,
    invoicedValue: null,
    invoicedValueNotComputableReason: 'InvoiceLine lacks foreign key to CustomerDecisionItem',
    collectedValue: null,
    collectedValueNotComputableReason: 'Payments settle invoices in aggregate',
  },
  unperformedBreakdown: {
    noWorkLinked: { count: 2, value: 1200 },
    plannedNotStarted: { count: 2, value: 1000 },
    inProgress: { count: 1, value: 800 },
    partiallyPerformed: { count: 0, value: 0 },
    abandonedTerminal: { count: 0, value: 0 },
  },
  outcomes: [
    { outcome: 'PERFORMED', label: 'Fully Performed', count: 5, totalValue: 3000 },
    { outcome: 'APPROVED_NO_WORK_LINKED', label: 'Approved (No Work Linked)', count: 2, totalValue: 1200 },
    { outcome: 'APPROVED_PLANNED', label: 'Approved & Planned', count: 2, totalValue: 1000 },
    { outcome: 'APPROVED_IN_PROGRESS', label: 'Approved & In Progress', count: 1, totalValue: 800 },
  ],
  timing: {
    averageResponseHours: 4.5,
    averagePlanningHours: 2.1,
    averageExecutionHours: 6.4,
  },
  integrity: {
    approvedWithoutTasks: 2,
    terminalWithoutExecution: 0,
  },
};

function renderComponent(reportObservable = of(mockReport)) {
  const api = {
    decisions: vi.fn().mockReturnValue(reportObservable),
    savedViews: vi.fn().mockReturnValue(of({ items: [] })),
  };

  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AnalystApi, useValue: api }],
  });

  const fixture = TestBed.createComponent(AnalystDecisionsPage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, api };
}

describe('AnalystDecisionsPage', () => {
  it('renders closed-loop decision analytics and KPIs when data loads successfully', () => {
    const { element, api } = renderComponent();

    expect(api.decisions).toHaveBeenCalled();
    expect(element.textContent).toContain('Customer Decision Analytics');
    expect(element.textContent).toContain('Closed-Loop Fulfillment Funnel');
    expect(element.textContent).toContain('Where Approved Work Gets Stuck');
    expect(element.textContent).toContain('Lifecycle Outcome Distribution');

    // KPIs
    expect(element.textContent).toContain('75%'); // Approval Rate
    expect(element.textContent).toContain('80%'); // Planning Rate
    expect(element.textContent).toContain('60%'); // Execution Rate
    expect(element.textContent).toContain('50%'); // Fulfillment Rate

    // Financial attribution boundary notice
    expect(element.textContent).toContain('Direct invoice line and collection attribution is declared non-computable');
  });

  it('renders forbidden state on 403 error', () => {
    const forbiddenError: PresentedError = {
      httpStatus: 403,
      code: 'FORBIDDEN',
      message: 'Access denied',
    };
    const { element } = renderComponent(throwError(() => forbiddenError));

    expect(element.textContent).toContain("You don't have access to this page");
  });
});
