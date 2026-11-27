// Where a category stands against its monthly limit — the one rule, in one
// place. Deliberately free of any server import so the API, the pages and the
// client components can all share it and can never disagree about what
// "near the limit" means.

/** Amber from 80% of the limit — close enough to be worth saying something. */
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
