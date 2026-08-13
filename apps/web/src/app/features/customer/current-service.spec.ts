import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CurrentService } from './current-service';
import { CustomerPortalApi, type CurrentServiceItem } from './customer-portal.api';

function item(overrides: Partial<CurrentServiceItem> = {}): CurrentServiceItem {
  return {
    workOrderId: 'wo-1',
    status: 'IN_PROGRESS',
    asset: 'ABC 1234',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function render(response: readonly CurrentServiceItem[] | { readonly error: unknown }) {
  const api = { currentService: () => ('error' in response ? throwError(() => response.error) : of(response)) };
  TestBed.configureTestingModule({ providers: [{ provide: CustomerPortalApi, useValue: api }] });
  const fixture = TestBed.createComponent(CurrentService);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement };
}

describe('CurrentService', () => {
  it('shows the no-active-service state, distinct from an error', () => {
    const { element } = render([]);
    expect(element.textContent).toContain('No active service right now');
  });

  it('translates a raw status enum into plain words', () => {
    const { element } = render([item({ status: 'WAITING_PARTS' })]);

    expect(element.textContent).toContain('Waiting for parts');
    expect(element.textContent).not.toContain('WAITING_PARTS');
  });

  it('flags a job waiting on the customer as needing them', () => {
    const { element } = render([item({ status: 'AWAITING_CUSTOMER_APPROVAL' })]);

    expect(element.querySelector('.job--needs-you')).not.toBeNull();
    expect(element.textContent).toContain('Needs you');
  });

  it('does not flag an ordinary in-progress job', () => {
    const { element } = render([item({ status: 'IN_PROGRESS' })]);
    expect(element.querySelector('.job--needs-you')).toBeNull();
  });
});
