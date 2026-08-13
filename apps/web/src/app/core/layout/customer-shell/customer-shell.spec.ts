import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { SessionContext } from '@mop/shared';
import { CustomerShell } from './customer-shell';
import { AuthStore } from '../../auth/auth.store';

describe('CustomerShell', () => {
  function render(session: SessionContext | null) {
    const authStoreStub = { session: () => session, logout: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    });

    const fixture = TestBed.createComponent(CustomerShell);
    fixture.detectChanges();
    return { fixture, stub: authStoreStub, element: fixture.nativeElement as HTMLElement };
  }

  it('links to all five portal pages, none dead', () => {
    const { element } = render({ displayName: 'Ahmed', role: 'CUSTOMER' } as SessionContext);

    const routes = [...element.querySelectorAll('.portal-nav-link')].map((a) => a.getAttribute('href'));
    expect(routes).toEqual([
      '/customer',
      '/customer/assets',
      '/customer/service',
      '/customer/invoices',
      '/customer/history',
    ]);
  });

  it('uses plain nav labels, never internal jargon', () => {
    const { element } = render({ displayName: 'Ahmed', role: 'CUSTOMER' } as SessionContext);

    const labels = [...element.querySelectorAll('.portal-nav-link')].map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Home', 'Assets', 'Service', 'Invoices', 'History']);
  });

  it('signing out clears the session and returns to /login', async () => {
    const { fixture, stub } = render({ displayName: 'Ahmed', role: 'CUSTOMER' } as SessionContext);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.logout();

    expect(stub.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
