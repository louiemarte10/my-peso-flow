// The server side of recurring entries: reading the whole workflow in one go,
// and turning rules into proposals.
//
// Nothing here creates an Entry. Generating only ever writes ScheduledEntry
// rows with status PENDING, which no total, balance or chart looks at. The one
// place a proposal becomes money is the review route, and only for ids a
// person ticked.

import "server-only";
import { prisma } from "./db";
import { LIVE } from "./archive";
import { manilaDayStartUTC, todayKey } from "./date";
import { datesForRule } from "./schedule";

export const RULE_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  wallet: {
    select: { id: true, name: true, icon: true, color: true, logo: true },
  },
} as const;

export const QUEUE_INCLUDE = {
  ...RULE_INCLUDE,
  rule: { select: { id: true, name: true } },
} as const;

/**
 * Everything the Recurring page needs, in one request: the rules, the queue,
 * and the categories and wallets its dropdowns offer.
 *
 * Every mutating route answers with this same shape, so the page replaces its
 * state wholesale after any change and can never drift from the server.
 */
export async function loadSchedule(userId: string) {
  const [rules, pending, recent, categories, wallets] = await Promise.all([
    prisma.scheduleRule.findMany({
      where: { userId },
      include: RULE_INCLUDE,
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    }),
    prisma.scheduledEntry.findMany({
      where: { userId, status: "PENDING" },
      include: QUEUE_INCLUDE,
      orderBy: [{ date: "asc" }, { kind: "desc" }, { createdAt: "asc" }],
    }),
    // A short tail of what has already been decided, so approving something
    // is visibly reversible-looking rather than a row vanishing into nothing.
    prisma.scheduledEntry.findMany({
      where: { userId, status: { in: ["APPROVED", "SKIPPED"] } },
      include: QUEUE_INCLUDE,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.category.findMany({
      where: { userId, ...LIVE },
      select: {
        id: true,
        name: true,
        kind: true,
        color: true,
        requiresDetail: true,
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    prisma.wallet.findMany({
      where: { userId, ...LIVE },
      select: { id: true, name: true, icon: true, color: true, logo: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return { rules, pending, recent, categories, wallets, today: todayKey() };
}

export type ScheduleState = Awaited<ReturnType<typeof loadSchedule>>;

/**
 * Turn every active rule into proposals for the months in the window.
 *
 * Safe to run as often as you like: the (ruleId, date) unique constraint means
 * a date already proposed is never proposed twice, so a row you skipped stays
 * skipped and a row you approved does not come back as a duplicate.
 *
 * Pending rows you have not touched by hand are refreshed to match the rule,
 * so changing a rule's amount updates what is still waiting rather than
 * leaving a stale number on the table.
 */
export async function generateProposals(
  userId: string,
  todayYmd = todayKey(),
): Promise<{ created: number; refreshed: number }> {
  const rules = await prisma.scheduleRule.findMany({
    where: { userId, active: true },
    select: {
      id: true,
      kind: true,
      amountCents: true,
      daysOfMonth: true,
      note: true,
      categoryId: true,
      walletId: true,
    },
  });

  let created = 0;
  let refreshed = 0;

  for (const rule of rules) {
    const dates = datesForRule(rule.daysOfMonth, todayYmd);
    if (dates.length === 0) continue;

    const res = await prisma.scheduledEntry.createMany({
      data: dates.map((ymd) => ({
        userId,
        ruleId: rule.id,
        date: manilaDayStartUTC(ymd),
        kind: rule.kind,
        amountCents: rule.amountCents,
        note: rule.note,
        categoryId: rule.categoryId,
        walletId: rule.walletId,
      })),
      skipDuplicates: true,
    });
    created += res.count;

    const touched = await prisma.scheduledEntry.updateMany({
      where: { userId, ruleId: rule.id, status: "PENDING", edited: false },
      data: {
        kind: rule.kind,
        amountCents: rule.amountCents,
        note: rule.note,
        categoryId: rule.categoryId,
        walletId: rule.walletId,
      },
    });
    // Rows it just created are already current; only the rest count as a
    // refresh worth reporting.
    refreshed += Math.max(0, touched.count - res.count);
  }

  return { created, refreshed };
}

/**
 * Check that a category and wallet really belong to this person, and that the
 * category fits the kind of entry.
 *
 * `note` is checked too: a catch-all category marked "needs details" is
 * meaningless without one, and the ledger refuses it on the way in — better to
 * say so while the row is still a proposal than at approval time.
 */
export async function checkTargets(
  userId: string,
  opts: {
    kind: "EARNING" | "EXPENSE";
    categoryId: string | null;
    walletId: string | null;
    note: string | null;
    /** Approving writes to the ledger, so the note rule only bites there. */
    requireDetail?: boolean;
  },
): Promise<string | null> {
  if (opts.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: opts.categoryId, userId },
      select: { name: true, kind: true, requiresDetail: true },
    });
    if (!cat) return "That category does not exist";
    if (cat.kind !== opts.kind) {
      return `"${cat.name}" is ${cat.kind === "EARNING" ? "an earnings" : "an expense"} category`;
    }
    if (opts.requireDetail && cat.requiresDetail && !opts.note) {
      return `Say what this was — "${cat.name}" on its own won't mean anything later`;
    }
  }

  if (opts.walletId) {
    const wallet = await prisma.wallet.findFirst({
      where: { id: opts.walletId, userId },
      select: { id: true },
    });
    if (!wallet) return "That wallet does not exist";
  }

  return null;
}
