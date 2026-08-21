import { TestBed } from '@angular/core/testing';
import type { SessionContext } from '@mop/shared';
import { PlaceholderHome } from './placeholder-home';
import { AuthStore } from '../../identity/auth.store';

describe('PlaceholderHome', () => {
  it("renders the signed-in user's role from the real session", () => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: { session: () => ({ role: 'TECHNICIAN' } as SessionContext) } }],
    });

    const fixture = TestBed.createComponent(PlaceholderHome);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('TECHNICIAN');
  });
});
