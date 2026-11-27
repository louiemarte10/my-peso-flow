// The short note that sits under every category with a monthly limit.
//
// A bar shows you a ratio; a sentence tells you what to do about it. The
// difference that matters is pace: ₱500 of a ₱1,000 limit is comfortable on
// the 28th and a problem on the 3rd, and only the date knows which.
//
// Pure functions, no database and no clock of their own — the caller passes
// the Manila day in — so the same note can be produced on the server or in the
// browser and will always agree.

import { formatPeso } from "./money";
import { budgetState, type BudgetState } from "./budget-state";

export type Reminder = {
  state: BudgetState;
  /** The one line to show. Complete sentence, already formatted. */
  text: string;
  /** Spend per remaining day that would just reach the limit. */
  perDayCents: number;
  daysLeft: number;
};

/** Days remaining in the Manila month, counting today. The 27th of a 30-day month leaves 4. */
export function daysLeftInMonth(todayYmd: string): number {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.max(1, lastDay - d + 1);
}

/**
 * The note for one category.
 *
 * `todayYmd` is a Manila "YYYY-MM-DD". Nothing here blocks anything — the
 * wording stays plain even when you are over, because a tracker that nags gets
 * ignored, and an ignored tracker records nothing.
 */
export function limitReminder({
  spentCents,
  limitCents,
  todayYmd,
}: {
  spentCents: number;
  limitCents: number;
  todayYmd: string;
}): Reminder {
  const state = budgetState(spentCents, limitCents);
  const daysLeft = daysLeftInMonth(todayYmd);
  const leftCents = limitCents - spentCents;
  const perDayCents = Math.max(0, Math.floor(leftCents / daysLeft));
  const days = `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;

  if (state === "over") {
    return {
      state,
      daysLeft,
      perDayCents: 0,
      text:
        `You are ${formatPeso(-leftCents)} over your ${formatPeso(limitCents)} limit, ` +
        `with ${days} still to go this month.`,
    };
  }

  // Exactly on the limit is "near", but "₱0.00 left ... ₱0.00 a day" reads
  // like a bug. Say what actually happened.
  if (leftCents === 0) {
    return {
      state,
      daysLeft,
      perDayCents: 0,
      text:
        `You have used the whole ${formatPeso(limitCents)}, with ${days} ` +
        `still to go this month.`,
    };
  }

  if (spentCents === 0) {
    return {
      state,
      daysLeft,
      perDayCents,
      text:
        `Nothing spent yet. ${formatPeso(limitCents)} for the month — ` +
        `about ${formatPeso(perDayCents)} a day over the next ${days}.`,
    };
  }

  if (state === "near") {
    return {
      state,
      daysLeft,
      perDayCents,
      text:
        `Only ${formatPeso(leftCents)} left of ${formatPeso(limitCents)}, and ` +
        `${days} to go — that is ${formatPeso(perDayCents)} a day from here.`,
    };
  }

  return {
    state,
    daysLeft,
    perDayCents,
    text:
      `${formatPeso(leftCents)} left with ${days} to go — ` +
      `stay under ${formatPeso(perDayCents)} a day and you finish on budget.`,
  };
}

/** The headline above a list of limits: the one thing worth knowing at a glance. */
export function limitsSummary(
  limits: { spentCents: number; limitCents: number }[],
): { state: BudgetState; text: string } {
  if (limits.length === 0) {
    return { state: "none", text: "No limits set yet." };
  }
  const over = limits.filter(
    (l) => budgetState(l.spentCents, l.limitCents) === "over",
  ).length;
  const near = limits.filter(
    (l) => budgetState(l.spentCents, l.limitCents) === "near",
  ).length;

  if (over > 0) {
    return {
      state: "over",
      text: `${over} ${over === 1 ? "category is" : "categories are"} over budget.`,
    };
  }
  if (near > 0) {
    return {
      state: "near",
      text: `${near} ${near === 1 ? "category is" : "categories are"} close to the limit.`,
    };
  }
  return {
    state: "ok",
    text: `All ${limits.length} within budget.`,
  };
}
