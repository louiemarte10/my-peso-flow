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
import { manilaDayStartUTC, longDayLabel, manilaDayKey, todayKey } from "./date";
import { formatPeso } from "./money";
import { logActivityFor } from "./activity";
import { POST_HOUR_LABEL, datesForRule, postCutoff } from "./schedule";

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
 * Everything the Schedule Peso page needs, in one request: the rules, the queue,
 * and the categories and wallets its dropdowns offer.
 *
 * Every mutating route answers with this same shape, so the page replaces its
 * state wholesale after any change and can never drift from the server.
 */
export async function loadSchedule(userId: string) {
  const [rules, pending, approved, recent, categories, wallets] = await Promise.all([
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
    // Said yes to, but not money yet: these are waiting for 4pm on their own
    // date. Soonest first, because that is the one you might still call off.
    prisma.scheduledEntry.findMany({
      where: { userId, status: "APPROVED" },
      include: QUEUE_INCLUDE,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    // A short tail of what has already happened or been passed over.
    prisma.scheduledEntry.findMany({
      where: { userId, status: { in: ["POSTED", "SKIPPED"] } },
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

  return {
    rules,
    pending,
    approved,
    recent,
    categories,
    wallets,
    today: todayKey(),
  };
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
      repeatMonthly: true,
      note: true,
      categoryId: true,
      walletId: true,
    },
  });

  let created = 0;
  let refreshed = 0;

  for (const rule of rules) {
    const dates = datesForRule(rule.daysOfMonth, todayYmd, {
      repeatMonthly: rule.repeatMonthly,
    });
    if (dates.length === 0) continue;

    // A one-off that has already been proposed is done; it must not quietly
    // offer itself again next month.
    if (!rule.repeatMonthly) {
      const already = await prisma.scheduledEntry.count({
        where: { userId, ruleId: rule.id },
      });
      if (already > 0) continue;
    }

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

/**
 * Post every approved row whose moment has come: 4pm Manila on its own date.
 *
 * This is the step that actually creates money. Approving does not — it only
 * arms the row — so a salary you approved on the 1st still shows up in the
 * ledger on the 20th at 4pm, the way the month really went.
 *
 * Safe to call as often as anything likes:
 *
 *  - the cutoff means a row can never post early, no matter who calls it;
 *  - each row is written in a transaction with the entry it creates, so a
 *    proposal is never marked POSTED without its entry existing;
 *  - the status moves PENDING → APPROVED → POSTED in one direction only, and
 *    the query reads APPROVED rows, so calling it twice cannot double-encode.
 *
 * Pass a userId to catch up one person on page load; leave it out for the
 * nightly run that does everyone.
 */
export async function postDueEntries(
  userId?: string,
  now = new Date(),
): Promise<{ posted: number; failed: number; healed: number }> {
  // Rows approved back when approving encoded on the spot already have their
  // entry, and would otherwise be encoded a second time now that APPROVED
  // means "waiting". An entryId is proof the money exists, so mark them
  // POSTED and leave the ledger alone. Cheap, and it heals itself on the
  // first run rather than needing anyone to remember.
  const healed = await prisma.scheduledEntry.updateMany({
    where: {
      status: "APPROVED",
      entryId: { not: null },
      ...(userId ? { userId } : {}),
    },
    data: { status: "POSTED" },
  });

  const due = await prisma.scheduledEntry.findMany({
    where: {
      status: "APPROVED",
      // Belt and braces: never touch a row that already produced an entry.
      entryId: null,
      date: { lte: postCutoff(now) },
      ...(userId ? { userId } : {}),
    },
    orderBy: { date: "asc" },
    take: 500,
  });
  if (due.length === 0) return { posted: 0, failed: 0, healed: healed.count };

  // One lookup per person rather than per row, for the activity line.
  const people = new Map<string, { id: string; name: string; email: string }>();
  for (const row of due) {
    if (people.has(row.userId)) continue;
    const person = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { id: true, name: true, email: true },
    });
    if (person) people.set(row.userId, person);
  }

  let posted = 0;
  let failed = 0;

  for (const row of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const entry = await tx.entry.create({
          data: {
            userId: row.userId,
            kind: row.kind,
            date: row.date,
            amountCents: row.amountCents,
            note: row.note,
            categoryId: row.categoryId,
            walletId: row.walletId,
          },
        });
        await tx.scheduledEntry.update({
          where: { id: row.id },
          data: { status: "POSTED", postedAt: now, entryId: entry.id },
        });
      });
      posted += 1;

      const person = people.get(row.userId);
      if (person) {
        await logActivityFor(person, {
          action:
            row.kind === "EARNING" ? "schedule.post.earning" : "schedule.post.expense",
          summary:
            `Scheduled ${row.kind === "EARNING" ? "earning" : "expense"} of ` +
            `${formatPeso(row.amountCents)} posted automatically at ` +
            `${POST_HOUR_LABEL} on ${longDayLabel(manilaDayKey(row.date))}`,
          targetType: "ScheduledEntry",
          targetId: row.id,
        });
      }
    } catch {
      // Leave it APPROVED so the next run tries again rather than losing it.
      failed += 1;
    }
  }

  return { posted, failed, healed: healed.count };
}
