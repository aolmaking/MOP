/**
 * The parts a technician has attached to each inspection finding, while the
 * inspection is still being written.
 *
 * This exists because attaching a part means leaving the work card: the button
 * on a finding opens the workshop's real Point of Sale — the same catalogue,
 * filters and stock the counter uses — rather than a second, smaller picker
 * living inside the card. Two pages therefore write one list, and it has to
 * survive the navigation between them.
 *
 * Session storage, per work order, for the same reason `parts-catalog.ts`
 * keeps its basket there: an unsent inspection belongs to this tab and this
 * shift, and losing it to a refresh is worse than any of the alternatives.
 * Nothing here is a source of truth — the report the technician submits is,
 * and the server prices it from the workshop's own catalogue.
 */

export interface AttachedFindingPart {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  /**
   * Absent when the workshop hides prices from technicians, and `null` rather
   * than `0` for exactly that reason: a part with no price is not a free part.
   */
  readonly unitPrice: number | null;
  /** What the shelf held when it was attached, or null when nothing counts it. */
  readonly stock?: number | null;
}

/** finding key (the subsystem, e.g. `brakes`) -> the parts attached to it. */
export type FindingParts = Record<string, AttachedFindingPart[]>;

/**
 * A finding as the technician has it part-written.
 *
 * Kept beside the parts for the same reason: attaching a part means leaving
 * the work card for the Point of Sale, and a technician who had marked the
 * brakes CRITICAL should not come back to find the card had forgotten.
 */
export interface DraftFinding {
  readonly id: string;
  readonly partKey: string;
  readonly title: string;
  readonly description: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly flagged: boolean;
}

const PREFIX = 'mop.finding-parts.';
const FINDINGS_PREFIX = 'mop.findings.';

function storageKey(workOrderId: string): string {
  return `${PREFIX}${workOrderId}`;
}

function findingsKey(workOrderId: string): string {
  return `${FINDINGS_PREFIX}${workOrderId}`;
}

export function readDraftFindings(workOrderId: string): DraftFinding[] {
  if (!workOrderId) return [];
  try {
    const raw = sessionStorage.getItem(findingsKey(workOrderId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DraftFinding[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeDraftFindings(workOrderId: string, findings: readonly DraftFinding[]): void {
  if (!workOrderId) return;
  try {
    sessionStorage.setItem(findingsKey(workOrderId), JSON.stringify(findings));
  } catch {
    // The copy in memory still works.
  }
}

export function readFindingParts(workOrderId: string): FindingParts {
  if (!workOrderId) return {};
  try {
    const raw = sessionStorage.getItem(storageKey(workOrderId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FindingParts;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Storage unavailable or corrupt. An empty card is recoverable; a crash
    // in the middle of an inspection is not.
    return {};
  }
}

export function writeFindingParts(workOrderId: string, value: FindingParts): void {
  if (!workOrderId) return;
  try {
    sessionStorage.setItem(storageKey(workOrderId), JSON.stringify(value));
  } catch {
    // Same reasoning as the read: the copy in memory still works.
  }
}

/**
 * Attach one part to one finding, or add to the quantity already there.
 *
 * Returns the whole updated map so the caller can render a count without
 * reading storage a second time.
 */
export function attachFindingPart(
  workOrderId: string,
  findingKey: string,
  part: AttachedFindingPart,
): FindingParts {
  const current = readFindingParts(workOrderId);
  const existing = current[findingKey] ?? [];
  const index = existing.findIndex((line) => line.sku === part.sku);
  const next =
    index >= 0
      ? existing.map((line, i) =>
          i === index ? { ...line, quantity: line.quantity + part.quantity } : line,
        )
      : [...existing, part];
  const updated = { ...current, [findingKey]: next };
  writeFindingParts(workOrderId, updated);
  return updated;
}

/** How many of this part are already on this finding. */
export function attachedQuantity(parts: FindingParts, findingKey: string, sku: string): number {
  return (parts[findingKey] ?? []).find((line) => line.sku === sku)?.quantity ?? 0;
}

/** Cleared when the report is sent, so the next inspection starts empty. */
export function clearFindingParts(workOrderId: string): void {
  if (!workOrderId) return;
  try {
    sessionStorage.removeItem(storageKey(workOrderId));
    sessionStorage.removeItem(findingsKey(workOrderId));
  } catch {
    // Nothing to do: the caller has already cleared its own copy.
  }
}
