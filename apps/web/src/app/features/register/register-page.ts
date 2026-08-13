import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import type { PresentedError } from '../../core/api/error.interceptor';

type Step = 'code' | 'form' | 'done';

interface WorkshopContext {
  readonly tenantId: string;
  readonly tenantName: string;
}

/**
 * Register as Customer, per docs/detailed-specs/shared-system-pages.md.
 *
 * The only self-registration path in the whole product -- no role
 * selector, no owner/staff option, exactly one outcome. The workshop
 * code resolves as its own step before the rest of the form is even
 * shown, matching the spec's own rule that nothing else here is
 * meaningful without a resolved tenant.
 *
 * Public, like Invite Accept and Login -- no shell, centred and narrow,
 * the same visual language both of those already use.
 */
@Component({
  selector: 'app-register-page',
  imports: [RouterLink],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly step = signal<Step>('code');
  protected readonly workshop = signal<WorkshopContext | null>(null);
  protected readonly workshopCode = signal('');
  protected readonly resolving = signal(false);
  protected readonly codeError = signal<string | null>(null);

  protected readonly fullName = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly longEnough = computed(() => this.password().length >= 12);
  protected readonly canSubmit = computed(
    () =>
      this.fullName().trim().length >= 2 &&
      /^\+[1-9]\d{1,14}$/.test(this.phone().trim()) &&
      this.longEnough() &&
      !this.submitting(),
  );

  constructor() {
    // Pre-filled from a branch QR code / invite link's ?workshop= or
    // ?code= query param, per the spec -- resolved immediately rather
    // than waiting for the person to retype what a link already carried.
    const prefilled = this.route.snapshot.queryParamMap.get('workshop') ?? this.route.snapshot.queryParamMap.get('code');
    if (prefilled) {
      this.workshopCode.set(prefilled);
      this.resolveWorkshop();
    }
  }

  protected resolveWorkshop(): void {
    const code = this.workshopCode().trim();
    if (!code) return;

    this.resolving.set(true);
    this.codeError.set(null);

    this.http.get<WorkshopContext>('/api/v1/public/register/workshop', { params: { code } }).subscribe({
      next: (found) => {
        this.resolving.set(false);
        this.workshop.set(found);
        this.step.set('form');
      },
      error: (err: PresentedError) => {
        this.resolving.set(false);
        this.codeError.set(err.message ?? "We couldn't find a workshop with that code.");
      },
    });
  }

  protected changeWorkshop(): void {
    this.step.set('code');
    this.workshop.set(null);
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const workshop = this.workshop();
    if (!workshop) return;

    this.submitting.set(true);
    this.formError.set(null);

    this.http
      .post<{ customerId: string }>('/api/v1/public/register', {
        workshopCode: this.workshopCode().trim(),
        fullName: this.fullName().trim(),
        phone: this.phone().trim(),
        email: this.email().trim() || undefined,
        password: this.password(),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.password.set('');
          this.step.set('done');
        },
        error: (err: PresentedError) => {
          this.submitting.set(false);
          this.formError.set(err.message ?? 'That did not work.');
        },
      });
  }

  protected goToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
