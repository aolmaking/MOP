import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { SessionContext } from '@mop/shared';
import { PlatformShell } from './platform-shell';
import { AuthStore } from '../../../identity/auth.store';

describe('PlatformShell', () => {
  function configure() {
    const authStoreStub = {
      session: () => ({ displayName: 'platform-admin@mop.local', role: 'PLATFORM_SUPER_ADMIN' } as SessionContext),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    });
    return authStoreStub;
  }

  it('renders the four spec-defined nav links, and nothing for Add Workshop', () => {
    configure();
    const fixture = TestBed.createComponent(PlatformShell);
    fixture.detectChanges();

    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.rail-link')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['/platform/workshops', '/platform/control-center', '/platform/reports', '/platform/live-view']);
  });

  it("shows the signed-in account's display name", () => {
    configure();
    const fixture = TestBed.createComponent(PlatformShell);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.rail-account-name')?.textContent).toContain(
      'platform-admin@mop.local',
    );
  });

  it('logging out calls AuthStore.logout() and navigates to /login', async () => {
    const authStoreStub = configure();
    const fixture = TestBed.createComponent(PlatformShell);
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.logout();

    expect(authStoreStub.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });
});
