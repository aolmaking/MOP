import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import type { PresentedError } from '../../core/api/error.interceptor';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, ErrorBanner],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<PresentedError | null>(null);

  async submit(): Promise<void> {
    // Client-side validation is UX only -- the server re-validates and
    // re-authenticates regardless, so there's no security check to skip
    // here, just an early exit to avoid a request we know will fail.
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();

    try {
      await this.authStore.login(email, password);
      // No per-role pages exist yet (Phase 2+ registers real routes keyed
      // by SessionContext.landingPage) -- send the user back to whatever
      // guarded route they originally asked for, or the one placeholder
      // home page otherwise.
      const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
      await this.router.navigateByUrl(redirectTo && redirectTo !== '/login' ? redirectTo : '/');
    } catch (err) {
      this.error.set(err as PresentedError);
    } finally {
      this.submitting.set(false);
    }
  }
}
