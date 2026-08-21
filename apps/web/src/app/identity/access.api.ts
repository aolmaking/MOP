import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, type Observable } from 'rxjs';

export interface AccessDecision {
  readonly allowed: boolean;
  readonly locked: boolean;
  readonly reason: string;
}

/**
 * "May I?" for the current session.
 *
 * Used to decide what to SHOW. The server still enforces the real check
 * on the action itself, so a wrong answer here costs a wasted click, not
 * a security hole -- which is why a failed check falls back to `false`
 * rather than surfacing an error: a rail that renders an entry because
 * the permission call timed out is worse than a rail missing one.
 */
@Injectable({ providedIn: 'root' })
export class AccessApi {
  private readonly http = inject(HttpClient);

  can(key: string): Observable<boolean> {
    return this.http
      .get<AccessDecision>('/api/v1/access/check', { params: { key } })
      .pipe(
        map((decision) => decision.allowed),
        catchError(() => of(false)),
      );
  }
}
