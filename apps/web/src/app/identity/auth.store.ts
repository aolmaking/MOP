import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SessionContext } from '@mop/shared';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

/**
 * The single source of truth for "who is signed in" on the client. Never
 * decodes or trusts anything client-side -- every method here round-trips
 * to the server, which is the only place a session is actually validated
 * (opaque httpOnly cookie, see apps/api/src/identity/auth).
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);

  private readonly _session = signal<SessionContext | null>(null);
  private readonly _status = signal<AuthStatus>('idle');

  readonly session = this._session.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');

  /** Asks the server whether the current cookie resolves to a real session. Safe to call repeatedly -- e.g. once per guarded navigation. */
  async bootstrap(): Promise<SessionContext | null> {
    this._status.set('loading');
    try {
      const session = await firstValueFrom(this.http.get<SessionContext>('/api/v1/auth/me'));
      this._session.set(session);
      this._status.set('authenticated');
      return session;
    } catch {
      this._session.set(null);
      this._status.set('unauthenticated');
      return null;
    }
  }

  /**
   * Take a session the server just handed us -- today, the one that comes
   * back from a silent refresh (`runtime/http/refresh.interceptor.ts`).
   *
   * Not a shortcut around `bootstrap()`: the argument is a server
   * response, never anything this client decided for itself. A refresh
   * can legitimately return a DIFFERENT context than the one held here
   * (a role changed, a responsibility was revoked, a branch scope
   * narrowed), so adopting the answer is the honest move -- keeping the
   * old one would let a stale rail outlive the permission behind it.
   */
  adopt(session: SessionContext): void {
    this._session.set(session);
    this._status.set('authenticated');
  }

  async login(email: string, password: string): Promise<SessionContext> {
    this._status.set('loading');
    try {
      const session = await firstValueFrom(this.http.post<SessionContext>('/api/v1/auth/login', { email, password }));
      this._session.set(session);
      this._status.set('authenticated');
      return session;
    } catch (error) {
      this._session.set(null);
      this._status.set('unauthenticated');
      throw error;
    }
  }

  async logout(): Promise<void> {
    // Best-effort: clearing local state must never be blocked by a flaky
    // network call. If the server call fails, the session cookie may
    // outlive this attempt server-side, but it still expires on its own
    // (20 min access / 14 day refresh) -- swallowing here is deliberate,
    // not a missed error.
    try {
      await firstValueFrom(this.http.post('/api/v1/auth/logout', {}));
    } catch {
      // ignored -- see comment above
    } finally {
      this._session.set(null);
      this._status.set('unauthenticated');
    }
  }
}
