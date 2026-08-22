import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { PresentedError } from '../../../runtime/http/error.interceptor';

type State = 'request' | 'requested' | 'checking' | 'ready' | 'invalid' | 'done';

@Component({
  selector: 'app-password-reset-page',
  imports: [RouterLink],
  templateUrl: './password-reset-page.html',
  styleUrl: './password-reset-page.css',
})
export class PasswordResetPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly state = signal<State>('request');
  protected readonly identifier = signal('');
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  constructor() {
    if (!this.token) return;

    this.state.set('checking');
    this.http.post<{ ok: true }>('/api/v1/auth/password-reset/describe', { token: this.token }).subscribe({
      next: () => this.state.set('ready'),
      error: () => this.state.set('invalid'),
    });
  }

  protected readonly longEnough = computed(() => this.password().length >= 12);
  protected readonly matches = computed(() => this.password() === this.confirm() && this.confirm().length > 0);
  protected readonly canSubmit = computed(() => this.longEnough() && this.matches() && !this.submitting());
  protected readonly canRequest = computed(() => this.identifier().trim().length >= 3 && !this.submitting());

  protected requestReset(): void {
    if (!this.canRequest()) return;

    this.submitting.set(true);
    this.error.set(null);
    this.http.post<{ ok: true }>('/api/v1/auth/password-reset/request', { identifier: this.identifier().trim() }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.state.set('requested');
      },
      error: (err: PresentedError) => {
        this.submitting.set(false);
        this.error.set(err.message ?? 'That did not work.');
      },
    });
  }

  protected completeReset(): void {
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.error.set(null);
    this.http
      .post<{ ok: true }>('/api/v1/auth/password-reset/complete', {
        token: this.token,
        password: this.password(),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.password.set('');
          this.confirm.set('');
          this.state.set('done');
        },
        error: (err: PresentedError) => {
          this.submitting.set(false);
          this.error.set(err.message ?? 'That did not work.');
          if (err.code === 'password_reset_invalid') this.state.set('invalid');
        },
      });
  }

  protected goToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
