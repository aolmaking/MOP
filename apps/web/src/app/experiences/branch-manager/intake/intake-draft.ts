import type { CustomerMatch, VehicleMatch } from './intake.api';

/**
 * Everything an interrupted advisor would otherwise have to retype.
 *
 * Chosen records are stored whole rather than as ids, so a restored draft
 * can be shown back as "Mona Adel — DEMO-4471" without a round trip. The
 * ids are still what gets submitted; the names are for the human.
 */
export interface IntakeDraft {
  readonly version: 1;
  readonly savedAt: string;
  customer: CustomerMatch | null;
  newCustomer: { fullName: string; phone: string; email: string } | null;
  vehicle: VehicleMatch | null;
  newVehicle: { category: string; plateNumber: string; vinOrChassisNumber: string } | null;
  complaint: string;
  inspectionDeclined: boolean;
  branchId: string;
}

const KEY = 'mop.intake.draft';

/**
 * A draft older than this is not offered back. An advisor returning the
 * next morning to yesterday's half-finished intake is far more likely to
 * submit it against the wrong customer than to want it -- the car has
 * long since been booked in by someone else or driven away.
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function emptyDraft(): IntakeDraft {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    customer: null,
    newCustomer: null,
    vehicle: null,
    newVehicle: null,
    complaint: '',
    inspectionDeclined: false,
    branchId: '',
  };
}

/** True when the draft holds anything worth offering back. */
export function isWorthKeeping(draft: IntakeDraft): boolean {
  return Boolean(
    draft.customer ||
      draft.vehicle ||
      draft.complaint.trim() ||
      draft.newCustomer?.fullName?.trim() ||
      draft.newVehicle?.plateNumber?.trim(),
  );
}

export function saveDraft(draft: IntakeDraft, storage: Storage = localStorage): void {
  try {
    if (!isWorthKeeping(draft)) {
      storage.removeItem(KEY);
      return;
    }
    storage.setItem(KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // Private browsing and full quotas both throw here. Losing the draft
    // is bad; taking the page down with it is worse.
  }
}

export function loadDraft(storage: Storage = localStorage): IntakeDraft | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<IntakeDraft>;
    // An older shape is discarded rather than migrated. A draft is worth
    // minutes of typing, not a migration path that has to stay correct.
    if (parsed.version !== 1 || typeof parsed.savedAt !== 'string') return null;
    if (Date.now() - new Date(parsed.savedAt).getTime() > MAX_AGE_MS) return null;

    const draft = { ...emptyDraft(), ...parsed } as IntakeDraft;
    return isWorthKeeping(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function clearDraft(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // See saveDraft.
  }
}
