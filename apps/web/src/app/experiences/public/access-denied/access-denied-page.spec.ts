import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AccessDeniedPage } from './access-denied-page';

describe('AccessDeniedPage', () => {
  it('renders the access boundary and the alternate sign-in action', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AccessDeniedPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Access denied');
    expect(text).toContain('Sign in with another account');
  });
});
