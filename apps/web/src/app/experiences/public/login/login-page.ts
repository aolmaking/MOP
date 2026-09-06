import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../../identity/auth.store';
import { landingRouteFor } from '../../../identity/landing';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ThemeToggle } from '../../../ui/theme-toggle/theme-toggle';
import { WorkshopBrandingService } from '../../../ui/workshop-branding.service';
import type { PresentedError } from '../../../runtime/http/error.interceptor';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, ErrorBanner, RouterLink, ThemeToggle],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly branding = inject(WorkshopBrandingService);

  // 2-step journey: 'workshop' -> 'credentials'
  protected readonly step = signal<'workshop' | 'credentials'>('workshop');
  protected readonly workshopCode = signal(this.route.snapshot.queryParamMap.get('code') || 'DFED5C5C92');
  protected readonly resolvingWorkshop = signal(false);
  protected readonly workshopError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    email: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    // If workshop code provided in query params, resolve it automatically
    const queryCode = this.route.snapshot.queryParamMap.get('code') || this.route.snapshot.queryParamMap.get('workshop');
    if (queryCode) {
      this.workshopCode.set(queryCode);
      this.proceedToCredentials();
    }
  }

  async proceedToCredentials(): Promise<void> {
    const code = this.workshopCode().trim();
    if (!code) {
      this.workshopError.set('Please enter your workshop code.');
      return;
    }

    this.resolvingWorkshop.set(true);
    this.workshopError.set(null);

    try {
      await this.branding.resolveWorkshop(code);
      this.step.set('credentials');
    } catch {
      this.workshopError.set('Workshop code could not be verified. Please check the code.');
    } finally {
      this.resolvingWorkshop.set(false);
    }
  }

  skipToCredentials(): void {
    this.workshopError.set(null);
    this.step.set('credentials');
  }

  switchWorkshop(): void {
    this.step.set('workshop');
    this.error.set(null);
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();

    try {
      const session = await this.authStore.login(email, password);
      const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
      const target =
        redirectTo && redirectTo !== '/login' && redirectTo !== '/' ? redirectTo : landingRouteFor(session);
      await this.router.navigateByUrl(target);
    } catch (err) {
      const presented = err as PresentedError;
      if (presented.code === 'tenant_unavailable') {
        await this.router.navigateByUrl('/tenant-frozen');
        return;
      }
      this.error.set(presented);
    } finally {
      this.submitting.set(false);
    }
  }
}
