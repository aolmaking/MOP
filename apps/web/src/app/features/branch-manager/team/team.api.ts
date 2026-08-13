import { HttpClient } from '@angular/common/http';
import { InjectionToken, Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

/**
 * Lets Owner's Organization & Access reuse this exact service (and the
 * component built on it) against `/organization/teams` instead of
 * `/branch/teams` -- same TeamSetupService server-side, same shape,
 * different mount point. Defaults to the Branch Manager path so every
 * existing call site is unaffected; the Owner route overrides it.
 */
export const TEAM_API_BASE_PATH = new InjectionToken<string>('TEAM_API_BASE_PATH', {
  providedIn: 'root',
  factory: () => '/api/v1/branch/teams',
});

export interface TeamMemberView {
  readonly membershipId: string;
  readonly technicianId: string;
  readonly fullName: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export interface TeamView {
  readonly id: string;
  readonly name: string;
  readonly branchId: string | null;
  readonly branchName: string | null;
  readonly isActive: boolean;
  readonly leader: { id: string; fullName: string } | null;
  readonly members: readonly TeamMemberView[];
  readonly past: readonly TeamMemberView[];
}

export interface TeamSetupPage {
  readonly teams: readonly TeamView[];
  readonly branches: readonly { id: string; name: string }[];
  readonly eligibleLeaders: readonly { id: string; fullName: string }[];
  readonly technicians: readonly { id: string; fullName: string; currentTeamId: string | null }[];
}

@Injectable({ providedIn: 'root' })
export class TeamApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(TEAM_API_BASE_PATH);

  page(): Observable<TeamSetupPage> {
    return this.http.get<TeamSetupPage>(this.base);
  }

  createTeam(name: string, branchId: string, teamLeaderId: string): Observable<TeamView> {
    return this.http.post<TeamView>(this.base, { name, branchId, teamLeaderId });
  }

  assignLeader(teamId: string, teamLeaderId: string): Observable<TeamView> {
    return this.http.post<TeamView>(`${this.base}/${teamId}/leader`, { teamLeaderId });
  }

  /** `teamId: null` takes them off every team, which is a real choice. */
  moveTechnician(technicianId: string, teamId: string | null): Observable<TeamSetupPage> {
    return this.http.post<TeamSetupPage>(`${this.base}/members`, { technicianId, teamId });
  }
}
