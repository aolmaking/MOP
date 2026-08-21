import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { SessionContext } from '@mop/shared';
import { LoginPage } from './login-page';
import { AuthStore } from '../../../identity/auth.store';

describe('LoginPage', () => {
  function configure(queryParams: Record<string, string> = {}) {
    const authStoreStub = { login: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: authStoreStub },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });
    return authStoreStub;
  }

  it('does not call AuthStore.login when the form is invalid', async () => {
    const authStoreStub = configure();
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    await fixture.componentInstance.submit();

    expect(authStoreStub.login).not.toHaveBeenCalled();
  });

  it('lands on the home the server picked for the role, not a generic page', async () => {
    const authStoreStub = configure();
    authStoreStub.login.mockResolvedValue({ landingPage: 'branch-home' } as SessionContext);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({ email: 'owner@example.com', password: 'secret123' });
    await fixture.componentInstance.submit();

    expect(authStoreStub.login).toHaveBeenCalledWith('owner@example.com', 'secret123');
    expect(navigateSpy).toHaveBeenCalledWith('/branch/attention');
  });

  it('falls back to the placeholder when that role has no page yet', async () => {
    const authStoreStub = configure();
    // Every role that has since gained a real home (Team Leader,
    // Inventory, Data Analyst) stopped being a valid example here the
    // moment its own phase built one -- an unrecognized landing page key
    // is the only thing this test can still assert against.
    authStoreStub.login.mockResolvedValue({ landingPage: 'not-yet-built-home' } as unknown as SessionContext);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({ email: 'stores@example.com', password: 'secret123' });
    await fixture.componentInstance.submit();

    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('navigates to redirectTo when the guard sent one along', async () => {
    const authStoreStub = configure({ redirectTo: '/some/protected/page' });
    authStoreStub.login.mockResolvedValue({ landingPage: 'branch-home' } as SessionContext);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({ email: 'owner@example.com', password: 'secret123' });
    await fixture.componentInstance.submit();

    expect(navigateSpy).toHaveBeenCalledWith('/some/protected/page');
  });

  it('shows the presented error inline and does not navigate on failure', async () => {
    const authStoreStub = configure();
    authStoreStub.login.mockRejectedValue({ code: 'unauthorized', message: 'Incorrect email or password', httpStatus: 401 });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    fixture.componentInstance['form'].setValue({ email: 'owner@example.com', password: 'wrong' });
    await fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(navigateSpy).not.toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error-banner')?.textContent).toContain('Incorrect email or password');
  });
});
