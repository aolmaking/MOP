import type { SessionContext } from '@mop/shared';
import { landingRouteFor } from './landing';

describe('landingRouteFor', () => {
  it('sends a branch manager to their queue rather than a placeholder', () => {
    // The server already decided this per role; throwing it away was why
    // signing in landed everyone on the same empty page.
    expect(landingRouteFor({ role: 'BRANCH_MANAGER', landingPage: 'branch-home' } as SessionContext)).toBe(
      '/branch/attention',
    );
  });

  it('sends a technician to their own shell', () => {
    expect(landingRouteFor({ role: 'TECHNICIAN', landingPage: 'technician-home' } as SessionContext)).toBe('/tech');
  });

  it('sends a super admin to the workshops list', () => {
    expect(
      landingRouteFor({ role: 'PLATFORM_SUPER_ADMIN', landingPage: 'platform-workshops' } as SessionContext),
    ).toBe('/platform/workshops');
  });

  it('sends a team leader to their own shell', () => {
    expect(landingRouteFor({ role: 'TEAM_LEADER', landingPage: 'team-leader-home' } as SessionContext)).toBe(
      '/team-leader',
    );
  });

  it('sends an owner to their real home, not just the audit log', () => {
    expect(landingRouteFor({ role: 'TENANT_OWNER', landingPage: 'owner-home' } as SessionContext)).toBe(
      '/owner/home',
    );
  });

  it('falls back to the placeholder for roles whose home is not built', () => {
    // Deliberately '/' and not a guess: the placeholder names the phase
    // that builds their home, which is more honest than a wrong page.
    expect(landingRouteFor({ role: 'DATA_ANALYST', landingPage: 'analytics-home' } as SessionContext)).toBe('/');
  });

  it('handles no session without throwing', () => {
    expect(landingRouteFor(null)).toBe('/');
  });
});
