import { Injectable } from "@nestjs/common";

export type HealthStatus = "HEALTHY" | "AT_RISK" | "CRITICAL";

export interface HealthWarning {
  code: string;
  message: string;
}

export interface HealthInput {
  ownerLastLoginAt: Date | null;
  staffLastActivityAt: Date | null;
  ownerFailedLoginCount: number;
  frozenOrSuspendedInLast90Days: boolean;
}

const OWNER_INACTIVITY_CRITICAL_DAYS = 30;
const OWNER_INACTIVITY_WARNING_DAYS = 14;
const STAFF_INACTIVITY_WARNING_DAYS = 14;
const FAILED_LOGIN_SPIKE_THRESHOLD = 3;

/**
 * The ONE health formula -- used by both the Workshops list (badge per
 * row) and Platform Reports section F (the itemized breakdown behind that
 * same badge), per the spec's own rule: "the same one, so a Super Admin
 * who drills into 'why is this workshop At Risk' always finds the literal
 * answer." A second, slightly-different copy in Reports would be exactly
 * the kind of drift this platform is rebuilt to avoid.
 */
@Injectable()
export class WorkshopHealthService {
  evaluate(input: HealthInput, now: Date = new Date()): { status: HealthStatus; warnings: HealthWarning[] } {
    const warnings: HealthWarning[] = [];

    const ownerInactivityDays = input.ownerLastLoginAt ? daysBetween(input.ownerLastLoginAt, now) : null;
    const staffInactivityDays = input.staffLastActivityAt ? daysBetween(input.staffLastActivityAt, now) : null;

    if (ownerInactivityDays === null) {
      warnings.push({ code: "owner_never_logged_in", message: "Owner has never logged in." });
    } else if (ownerInactivityDays >= OWNER_INACTIVITY_CRITICAL_DAYS) {
      warnings.push({ code: "owner_inactive", message: `Owner has not logged in for ${ownerInactivityDays} days.` });
    } else if (ownerInactivityDays >= OWNER_INACTIVITY_WARNING_DAYS) {
      warnings.push({ code: "owner_inactive", message: `Owner has not logged in for ${ownerInactivityDays} days.` });
    }

    if (staffInactivityDays !== null && staffInactivityDays >= STAFF_INACTIVITY_WARNING_DAYS) {
      warnings.push({ code: "low_staff_usage", message: `No staff activity in the last ${staffInactivityDays} days.` });
    }

    if (input.ownerFailedLoginCount >= FAILED_LOGIN_SPIKE_THRESHOLD) {
      warnings.push({
        code: "failed_login_spike",
        message: `${input.ownerFailedLoginCount} failed login attempts on the owner account.`,
      });
    }

    if (input.frozenOrSuspendedInLast90Days) {
      warnings.push({ code: "recent_freeze_or_suspend", message: "Frozen or suspended within the last 90 days." });
    }

    const isCritical =
      (ownerInactivityDays !== null && ownerInactivityDays >= OWNER_INACTIVITY_CRITICAL_DAYS) ||
      ownerInactivityDays === null ||
      input.frozenOrSuspendedInLast90Days;

    const status: HealthStatus = isCritical ? "CRITICAL" : warnings.length > 0 ? "AT_RISK" : "HEALTHY";
    return { status, warnings };
  }
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}
