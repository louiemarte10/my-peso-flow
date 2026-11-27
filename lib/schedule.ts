// Schedule Peso — the rules, and the dates they fall on.
//
// Everything here is a pure function with no database and no clock of its own:
// the caller passes the Manila day in. That keeps the server and the browser
// agreeing about which dates a rule proposes, and makes the awkward cases
// (the 31st of a 30-day month, February) answerable by reading one function
// rather than by running the app and hoping.
//
// The one rule that matters: NOTHING in here writes to the ledger. A rule
// proposes; a person approves. See prisma/schema.prisma's ScheduledEntry.

import type { EntryKind } from "./client";

/** How many rules one person may keep. Plenty for a month's worth of fixed costs. */
export const MAX_SCHEDULE_RULES = 20;

/** How many months ahead generating looks, counting the current one. */
export const GENERATE_MONTHS = 2;

/**
 * The hour a scheduled entry actually posts, in Manila time.
 *
 * Approving does NOT encode anything: it arms the row. It becomes a real
 * earning or expense at 4pm on its own date and not a moment before, so the
 * ledger reads the way the month actually happened rather than the way it was
 * planned a fortnight earlier.
 */
export const POST_HOUR_MANILA = 16;
export const POST_HOUR_LABEL = "4:00 PM";
const POST_OFFSET_MS = POST_HOUR_MANILA * 60 * 60 * 1000;

/**
 * The instant a row posts. `date` is 00:00 Manila stored as UTC, so adding the
 * hour gives 4pm Manila on that same calendar day wherever this runs.
 */
export function postMomentUTC(date: Date | string): Date {
  return new Date(new Date(date).getTime() + POST_OFFSET_MS);
}

/** Everything due at or before now is ready to post. */
export function isDueToPost(date: Date | string, now = new Date()): boolean {
  return postMomentUTC(date).getTime() <= now.getTime();
}

/** The cutoff for a query: a row posts once its `date` is at or before this. */
export function postCutoff(now = new Date()): Date {
  return new Date(now.getTime() - POST_OFFSET_MS);
}

/** "1st", "2nd", "3rd", "5th", "21st"… */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Number of days in the Manila month "YYYY-MM". */
export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The day a rule actually lands on in a given month.
 *
 * A "pay me on the 31st" rule must still pay in February, so a day past the
 * end of the month is pulled back to the last day rather than skipped.
 */
export function clampDayToMonth(day: number, monthKey: string): number {
  const last = daysInMonth(monthKey);
  return Math.min(Math.max(1, day), last);
}

/** The Manila days ("YYYY-MM-DD") a rule falls on in one month, in order. */
export function datesForMonth(
  daysOfMonth: number[],
  monthKey: string,
): string[] {
  const seen = new Set<string>();
  for (const d of daysOfMonth) {
    const day = clampDayToMonth(d, monthKey);
    seen.add(`${monthKey}-${String(day).padStart(2, "0")}`);
  }
  return [...seen].sort();
}

/** The month keys generating covers, starting with the one `todayYmd` is in. */
export function monthsToGenerate(
  todayYmd: string,
  count = GENERATE_MONTHS,
): string[] {
  const [y, m] = todayYmd.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  return keys;
}

/**
 * Every date a rule proposes across the generation window.
 *
 * A rule that does not repeat is a one-off: it offers the next date that has
 * not gone yet, and nothing after it.
 */
export function datesForRule(
  daysOfMonth: number[],
  todayYmd: string,
  opts: { repeatMonthly?: boolean; count?: number } = {},
): string[] {
  const { repeatMonthly = true, count = GENERATE_MONTHS } = opts;
  const all = monthsToGenerate(todayYmd, count).flatMap((mk) =>
    datesForMonth(daysOfMonth, mk),
  );
  if (repeatMonthly) return all;
  const next = all.find((ymd) => ymd >= todayYmd);
  return next ? [next] : [];
}

/**
 * Read the days-of-month a person typed: "5, 20" or "5 20" or "20,5".
 * Deduplicated and sorted, so the stored value is always canonical.
 */
export function parseDaysOfMonth(
  raw: unknown,
): { ok: true; days: number[] } | { ok: false; error: string } {
  const parts: unknown[] = Array.isArray(raw)
    ? raw
    : String(raw ?? "")
        .split(/[\s,]+/)
        .filter(Boolean);

  if (parts.length === 0) {
    return { ok: false, error: "Pick at least one day of the month" };
  }
  if (parts.length > 10) {
    return { ok: false, error: "That is more than 10 days in one rule" };
  }

  const days: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      return { ok: false, error: `"${String(p)}" is not a day between 1 and 31` };
    }
    if (!days.includes(n)) days.push(n);
  }
  return { ok: true, days: days.sort((a, b) => a - b) };
}

/** "the 5th and 20th", "the 1st", "the 5th, 15th and 25th". */
export function describeDays(days: number[]): string {
  const labels = [...days].sort((a, b) => a - b).map(ordinal);
  if (labels.length === 0) return "no day yet";
  if (labels.length === 1) return `the ${labels[0]}`;
  const last = labels.pop()!;
  return `the ${labels.join(", ")} and ${last}`;
}

/** Days above 28 don't exist every month — worth saying so on the rule. */
export function shortMonthWarning(days: number[]): string | null {
  const risky = days.filter((d) => d > 28);
  if (risky.length === 0) return null;
  return `The ${risky.map(ordinal).join(" and ")} doesn't exist in every month — in a short one it moves to the last day.`;
}

// ---- The starter set -------------------------------------------------------

export type PresetRule = {
  name: string;
  kind: EntryKind;
  /** Pesos, as a person says them. Converted to centavos on the way in. */
  amount: number;
  daysOfMonth: number[];
  /** Category names to look for, best first. No match means you pick one. */
  categoryHints: string[];
  note: string;
};

/**
 * The usual month, ready to drop in: payday twice a month, the allowance on
 * the 1st, and what goes out on the same two days.
 *
 * It is a starting point, not a decision — every field is editable afterwards,
 * and the proposals it makes still wait for approval like any other.
 */
export const STANDARD_RULES: PresetRule[] = [
  {
    name: "Salary",
    kind: "EARNING",
    amount: 8000,
    daysOfMonth: [5, 20],
    categoryHints: ["salary"],
    note: "Payday",
  },
  {
    name: "Salary Allowance",
    kind: "EARNING",
    amount: 5000,
    daysOfMonth: [1],
    categoryHints: ["salary allowance", "allowance"],
    note: "Monthly allowance",
  },
  {
    name: "Hatag Aizel",
    kind: "EXPENSE",
    amount: 3000,
    daysOfMonth: [5, 20],
    categoryHints: ["hatag aizel", "aizel allowance", "aizel"],
    note: "Hatag kay Aizel",
  },
  {
    name: "Family give",
    kind: "EXPENSE",
    amount: 1000,
    daysOfMonth: [5, 20],
    categoryHints: ["family give", "family"],
    note: "Para sa pamilya",
  },
];

/**
 * Find the category a preset means among the ones this person actually has.
 *
 * Exact name wins over a partial match across ALL hints, so a "Salary" rule
 * picks "Salary" even when "Salary Allowance" was checked first. No match
 * returns null and the rule simply arrives without a category.
 */
export function matchCategory<T extends { id: string; name: string; kind: EntryKind }>(
  categories: T[],
  preset: Pick<PresetRule, "kind" | "categoryHints">,
): T | null {
  const sameKind = categories.filter((c) => c.kind === preset.kind);
  const hints = preset.categoryHints.map((h) => h.toLowerCase());

  for (const hint of hints) {
    const exact = sameKind.find((c) => c.name.toLowerCase() === hint);
    if (exact) return exact;
  }
  for (const hint of hints) {
    const partial = sameKind.find((c) => c.name.toLowerCase().includes(hint));
    if (partial) return partial;
  }
  return null;
}
