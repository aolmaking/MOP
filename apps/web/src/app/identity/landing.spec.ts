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

  /**
   * Both roles have complete, working shells; the launch sprint holds
   * their whole surface back (TEAMS is off in the launch profile, and a
   * one-bay shop employs no analyst). Landing them on an empty rail
   * would be worse than telling them plainly.
   */
  it('sends a team leader to the access boundary while their surface is held back', () => {
    expect(landingRouteFor({ role: 'TEAM_LEADER', landingPage: 'team-leader-home' } as SessionContext)).toBe(
      '/access-denied',
    );
  });

  it('sends an owner to their real home, not just the audit log', () => {
    expect(landingRouteFor({ role: 'TENANT_OWNER', landingPage: 'owner-home' } as SessionContext)).toBe(
      '/owner/home',
    );
  });

  it('sends a customer to their own portal', () => {
    expect(landingRouteFor({ role: 'CUSTOMER', landingPage: 'customer-portal-home' } as SessionContext)).toBe(
      '/customer',
    );
  });

  it('sends a data analyst to the access boundary while their surface is held back', () => {
    expect(landingRouteFor({ role: 'DATA_ANALYST', landingPage: 'analytics-home' } as SessionContext)).toBe(
      '/access-denied',
    );
  });

  it('falls back to access denied when the server names no known landing page', () => {
    // Deliberately not a role guess: an unknown server landing page is
    // safer as a permission boundary than as the generic home shell.
    expect(
      landingRouteFor({ role: 'DATA_ANALYST', landingPage: 'not-yet-built-home' } as unknown as SessionContext),
    ).toBe('/access-denied');
  });

  it('handles no session without throwing', () => {
    expect(landingRouteFor(null)).toBe('/');
  });
});
