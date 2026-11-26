/**
 * Archiving, in one place.
 *
 * Nothing is deleted by accident: Archive hides a row from every total,
 * balance and chart while keeping it intact, and the Archived page is the only
 * route to permanent deletion.
 *
 * The one rule that matters: ANY query that feeds a number the user reads must
 * carry `LIVE`. Forget it in one place and a balance silently disagrees with
 * the ledger that explains it, so all the filters live here rather than being
 * retyped at each call site.
 */

/** Matches only live (not archived) rows. Spread into a Prisma `where`. */
export const LIVE = { archivedAt: null } as const;

/** Matches only archived rows. */
export const ARCHIVED = { archivedAt: { not: null } } as const;

/**
 * Turn `?include=live|archived|all` into a `where` fragment.
 * Anything unrecognised means live only — the safe default.
 */
export function scopeFilter(raw: string | null) {
  if (raw === "archived") return ARCHIVED;
  if (raw === "all") return {};
  return LIVE;
}

/** The client works with a boolean; the column is a timestamp. */
export function shapeArchivable<T extends { archivedAt: Date | null }>(row: T) {
  return { ...row, archived: row.archivedAt !== null };
}

/** Shape an `archivedAt` column for the client, which also wants a boolean. */
export function archiveFields(archivedAt: Date | null) {
  return {
    archived: archivedAt !== null,
    archivedAt: archivedAt ? archivedAt.toISOString() : null,
  };
}
