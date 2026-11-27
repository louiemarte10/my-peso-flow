// Monthly spending limits per category.
//
// A limit is a mirror, not a lock: nothing is ever blocked and no entry is
// refused. The point is that you can see where you stand before you spend,
// which is the only part a tracker can actually help with.

import { prisma } from "./db";
import { LIVE } from "./archive";
import { manilaRangeUTC, monthStartKey, todayKey } from "./date";

/** Amber from here on — close enough to be worth saying something. */
export const NEAR_LIMIT_RATIO = 0.8;

export type BudgetState = "none" | "ok" | "near" | "over";

export function budgetState(
  spentCents: number,
  limitCents: number | null | undefined,
): BudgetState {
  if (!limitCents || limitCents <= 0) return "none";
  if (spentCents > limitCents) return "over";
  if (spentCents >= limitCents * NEAR_LIMIT_RATIO) return "near";
  return "ok";
}

/**
 * What each category has cost so far this Manila month, keyed by category id.
 *
 * Expenses only, live entries only. Uses manilaRangeUTC rather than a sliced
 * ISO string: 00:00 Manila is 16:00 UTC on the previous date, so a naive bound
 * silently drops the 1st of the month.
 */
export async function monthSpendByCategory(
  userId: string,
): Promise<Map<string, number>> {
  const today = todayKey();
  const rows = await prisma.entry.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      kind: "EXPENSE",
      ...LIVE,
      date: manilaRangeUTC(monthStartKey(today), today),
    },
    _sum: { amountCents: true },
  });

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.categoryId) map.set(r.categoryId, r._sum.amountCents ?? 0);
  }
  return map;
}

/**
 * Parse a limit coming from a form. "" / null clears it; anything that isn't a
 * positive number is rejected so a typo cannot silently wipe a limit.
 */
export function parseMonthlyLimit(
  raw: unknown,
): { ok: true; cents: number | null } | { ok: false; error: string } {
  if (raw === null || raw === "" || raw === undefined) {
    return { ok: true, cents: null };
  }
  const pesos = Number(raw);
  if (!Number.isFinite(pesos)) return { ok: false, error: "Enter a number" };
  if (pesos < 0) return { ok: false, error: "A limit cannot be negative" };
  if (pesos === 0) return { ok: true, cents: null };
  return { ok: true, cents: Math.round(pesos * 100) };
}
