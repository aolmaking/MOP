import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import type { PresentedError } from '../../../runtime/http/error.interceptor';

type State = 'checking' | 'ready' | 'invalid' | 'done';

interface InviteSummary {
  readonly email: string | null;
  readonly fullName: string | null;
  readonly workshopName: string | null;
}

/**
 * Redeem an invitation.
 *
 * This page is the door that was missing. Add Workshop has created owner
 * accounts since Phase 2 with `status = INVITED` and no password, and
 * nothing could redeem them -- so every workshop the platform created had
 * an owner who could not log in.
 *
 * Public by necessity: the person arriving here has no account yet, which
 * is the entire point. The token in the URL is the only credential they
 * have, and it is single-use.
 */
@Component({
  selector: 'app-invite-accept',
  imports: [RouterLink],
  templateUrl: './invite-accept.html',
  styleUrl: './invite-accept.css',
})
export class InviteAccept {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly state = signal<State>('checking');
  protected readonly invite = signal<InviteSummary | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly submitting = signal(false);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  constructor() {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }

    // POST rather than GET, so the token never lands in a server access
    // log or a browser history entry beyond the one the recipient already
    // has.
    this.http.post<InviteSummary>('/api/v1/auth/invite/describe', { token: this.token }).subscribe({
      next: (invite) => {
        this.invite.set(invite);
        this.state.set('ready');
      },
      error: () => this.state.set('invalid'),
    });
  }

  protected readonly longEnough = computed(() => this.password().length >= 12);
  protected readonly matches = computed(() => this.password() === this.confirm() && this.confirm().length > 0);
  protected readonly canSubmit = computed(() => this.longEnough() && this.matches() && !this.submitting());

  protected submit(): void {
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.error.set(null);

    this.http
      .post<{ email: string | null }>('/api/v1/auth/invite/accept', {
        token: this.token,
        password: this.password(),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          // Cleared immediately. There is no reason for a chosen password
          // to sit in memory once it has been sent.
          this.password.set('');
          this.confirm.set('');
          this.state.set('done');
        },
        error: (err: PresentedError) => {
          this.submitting.set(false);
          this.error.set(err.message ?? 'That did not work.');
          // An invalid token here means it was consumed or expired
          // between loading the page and pressing the button.
          if (err.code === 'invite_invalid') this.state.set('invalid');
        },
      });
  }

  protected goToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
