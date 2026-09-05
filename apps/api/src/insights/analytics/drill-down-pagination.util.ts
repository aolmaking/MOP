export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;

export interface CursorPayload {
  occurredAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decodeCursor(cursor?: string): CursorPayload | null {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.occurredAt === "string" && typeof parsed.id === "string") {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolvePageLimit(limit?: number): number {
  if (!limit || isNaN(limit) || limit <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(limit), MAX_PAGE_LIMIT);
}

export function paginateRecords<T extends { occurredAt: string; entityId: string }>(
  records: T[],
  limit: number,
  cursor: CursorPayload | null,
): { items: T[]; nextCursor?: string } {
  // Sort deterministically: occurredAt DESC, entityId DESC
  const sorted = [...records].sort((a, b) => {
    const tA = new Date(a.occurredAt).getTime();
    const tB = new Date(b.occurredAt).getTime();
    if (tA !== tB) return tB - tA;
    return b.entityId.localeCompare(a.entityId);
  });

  let startIndex = 0;
  if (cursor) {
    const cursorTime = new Date(cursor.occurredAt).getTime();
    const foundIndex = sorted.findIndex((r) => {
      const rTime = new Date(r.occurredAt).getTime();
      if (rTime < cursorTime) return true;
      if (rTime === cursorTime && r.entityId < cursor.id) return true;
      return false;
    });
    if (foundIndex >= 0) {
      startIndex = foundIndex;
    } else {
      // Past the end
      return { items: [], nextCursor: undefined };
    }
  }

  const slice = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;
  const nextCursor = hasMore && slice.length > 0
    ? encodeCursor({
        occurredAt: slice[slice.length - 1]!.occurredAt,
        id: slice[slice.length - 1]!.entityId,
      })
    : undefined;

  return { items: slice, nextCursor };
}
