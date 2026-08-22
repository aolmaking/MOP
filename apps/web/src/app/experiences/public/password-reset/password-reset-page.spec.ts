import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { PasswordResetPage } from './password-reset-page';

function configure(token?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(PasswordResetPage);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, http, element: fixture.nativeElement as HTMLElement };
}

describe('PasswordResetPage', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('requests a reset without revealing whether the account exists', () => {
    const { fixture, http, element } = configure();

    const input = element.querySelector('input') as HTMLInputElement;
    input.value = 'owner@example.com';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector('button') as HTMLButtonElement).click();
    const req = http.expectOne('/api/v1/auth/password-reset/request');
    expect(req.request.body).toEqual({ identifier: 'owner@example.com' });
    req.flush({ ok: true });
    fixture.detectChanges();

    expect(element.textContent).toContain('Check your messages');
    expect(element.textContent).toContain('does not reveal whether the account exists');
  });

  it('validates a token and submits the new password', () => {
    const { fixture, http, element } = configure('reset-token');

    http.expectOne('/api/v1/auth/password-reset/describe').flush({ ok: true });
    fixture.detectChanges();

    const inputs = element.querySelectorAll('input');
    (inputs[0] as HTMLInputElement).value = 'new-password-123';
    inputs[0].dispatchEvent(new Event('input'));
    (inputs[1] as HTMLInputElement).value = 'new-password-123';
    inputs[1].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (element.querySelector('button') as HTMLButtonElement).click();
    const req = http.expectOne('/api/v1/auth/password-reset/complete');
    expect(req.request.body).toEqual({ token: 'reset-token', password: 'new-password-123' });
    req.flush({ ok: true });
    fixture.detectChanges();

    expect(element.textContent).toContain('Your password is reset');
  });
});
