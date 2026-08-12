import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

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

  page(): Observable<TeamSetupPage> {
    return this.http.get<TeamSetupPage>('/api/v1/branch/teams');
  }

  createTeam(name: string, branchId: string, teamLeaderId: string): Observable<TeamView> {
    return this.http.post<TeamView>('/api/v1/branch/teams', { name, branchId, teamLeaderId });
  }

  assignLeader(teamId: string, teamLeaderId: string): Observable<TeamView> {
    return this.http.post<TeamView>(`/api/v1/branch/teams/${teamId}/leader`, { teamLeaderId });
  }

  /** `teamId: null` takes them off every team, which is a real choice. */
  moveTechnician(technicianId: string, teamId: string | null): Observable<TeamSetupPage> {
    return this.http.post<TeamSetupPage>('/api/v1/branch/teams/members', { technicianId, teamId });
  }
}
