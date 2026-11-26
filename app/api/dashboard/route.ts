import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/api";
import {
  addDaysKey,
  addMonths,
  isYmd,
  longDayLabel,
  manilaDayKey,
  manilaRangeUTC,
  monthEndKey,
  monthLabel,
  monthStartKey,
  shortDayLabel,
  todayKey,
  yearEndKey,
  yearStartKey,
} from "@/lib/date";

type Totals = {
  earningsCents: number;
  expenseCents: number;
  balanceCents: number;
};

type Row = { date: Date; kind: "EARNING" | "EXPENSE"; amountCents: number };

const ZERO = (): Totals => ({
  earningsCents: 0,
  expenseCents: 0,
  balanceCents: 0,
});

function add(t: Totals, row: Row) {
  if (row.kind === "EARNING") t.earningsCents += row.amountCents;
  else t.expenseCents += row.amountCents;
  t.balanceCents = t.earningsCents - t.expenseCents;
}

/** Sum the rows whose Manila day falls within [from, to] inclusive. */
function sumRange(rows: Row[], from: string, to: string): Totals {
  const t = ZERO();
  for (const r of rows) {
    const key = manilaDayKey(r.date);
    if (key >= from && key <= to) add(t, r);
  }
  return t;
}

/**
 * GET /api/dashboard?view=7d|month|year&anchor=YYYY-MM-DD
 *
 * Always returns the headline cards for today / last 7 days / this month /
 * this year / all time, plus a bucketed series for the selected view (days for
 * 7d and month, months for year).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const rawView = searchParams.get("view");
  const view: "7d" | "month" | "year" =
    rawView === "month" || rawView === "year" ? rawView : "7d";

  const today = todayKey();
  const anchorParam = searchParams.get("anchor");
  const anchor = isYmd(anchorParam) ? anchorParam : today;

  // ── The range the chart covers ──
  let viewFrom: string;
  let viewTo: string;
  let viewLabel: string;
  if (view === "year") {
    viewFrom = yearStartKey(anchor);
    viewTo = yearEndKey(anchor);
    viewLabel = anchor.slice(0, 4);
  } else if (view === "month") {
    viewFrom = monthStartKey(anchor);
    viewTo = monthEndKey(anchor);
    viewLabel = monthLabel(anchor.slice(0, 7));
  } else {
    viewTo = anchor;
    viewFrom = addDaysKey(anchor, -6);
    viewLabel = "Last 7 days";
  }

  // ── The range the headline cards need (this calendar year up to today) ──
  const cardsFrom = yearStartKey(today);
  const cardsTo = today;

  // One widened query covers both; a personal ledger is small enough that
  // bucketing in memory is cheaper than several round trips to Neon.
  const queryFrom = viewFrom < cardsFrom ? viewFrom : cardsFrom;
  const queryTo = viewTo > cardsTo ? viewTo : cardsTo;

  const [rows, allTimeGroups, firstEntry, recent, categories] =
    await Promise.all([
      prisma.entry.findMany({
        where: { userId: user.sub, date: manilaRangeUTC(queryFrom, queryTo) },
        select: {
          date: true,
          kind: true,
          amountCents: true,
          categoryId: true,
        },
      }),
      prisma.entry.groupBy({
        by: ["kind"],
        where: { userId: user.sub },
        _sum: { amountCents: true },
      }),
      prisma.entry.findFirst({
        where: { userId: user.sub },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
      prisma.entry.findMany({
        where: { userId: user.sub },
        include: { category: { select: { id: true, name: true, color: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 8,
      }),
      prisma.category.findMany({
        where: { userId: user.sub },
        select: { id: true, name: true, color: true },
      }),
    ]);

  // ── Headline cards ──
  const todayTotals = sumRange(rows, today, today);
  const last7From = addDaysKey(today, -6);
  const last7Totals = sumRange(rows, last7From, today);
  const monthTotals = sumRange(rows, monthStartKey(today), today);
  const yearTotals = sumRange(rows, yearStartKey(today), today);

  const allTime = ZERO();
  for (const g of allTimeGroups) {
    const sum = g._sum.amountCents ?? 0;
    if (g.kind === "EARNING") allTime.earningsCents += sum;
    else allTime.expenseCents += sum;
  }
  allTime.balanceCents = allTime.earningsCents - allTime.expenseCents;

  // ── Chart buckets for the selected view ──
  const buckets: {
    key: string;
    label: string;
    earningsCents: number;
    expenseCents: number;
    balanceCents: number;
  }[] = [];
  const byKey = new Map<string, (typeof buckets)[number]>();

  if (view === "year") {
    for (let i = 0; i < 12; i++) {
      const key = addMonths(`${anchor.slice(0, 4)}-01`, i);
      const b = {
        key,
        label: monthLabel(key).split(" ")[0],
        ...ZERO(),
      };
      buckets.push(b);
      byKey.set(key, b);
    }
  } else {
    for (let d = viewFrom; d <= viewTo; d = addDaysKey(d, 1)) {
      const b = {
        key: d,
        label:
          view === "month" ? String(Number(d.slice(8, 10))) : shortDayLabel(d),
        ...ZERO(),
      };
      buckets.push(b);
      byKey.set(d, b);
    }
  }

  const viewTotals = ZERO();
  const expenseByCategory = new Map<string | null, number>();
  const earningByCategory = new Map<string | null, number>();

  for (const r of rows) {
    const dayKey = manilaDayKey(r.date);
    if (dayKey < viewFrom || dayKey > viewTo) continue;

    add(viewTotals, r);

    const bucketKey = view === "year" ? dayKey.slice(0, 7) : dayKey;
    const bucket = byKey.get(bucketKey);
    if (bucket) {
      if (r.kind === "EARNING") bucket.earningsCents += r.amountCents;
      else bucket.expenseCents += r.amountCents;
      bucket.balanceCents = bucket.earningsCents - bucket.expenseCents;
    }

    const target =
      r.kind === "EXPENSE" ? expenseByCategory : earningByCategory;
    target.set(
      r.categoryId,
      (target.get(r.categoryId) ?? 0) + r.amountCents,
    );
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const slices = (m: Map<string | null, number>) =>
    [...m.entries()]
      .map(([id, amountCents]) => {
        const cat = id ? catById.get(id) : null;
        return {
          id,
          name: cat?.name ?? "Uncategorised",
          color: cat?.color ?? null,
          amountCents,
        };
      })
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 6);

  return NextResponse.json({
    today: { ...todayTotals, key: today, label: longDayLabel(today) },
    last7: { ...last7Totals, from: last7From, to: today },
    month: {
      ...monthTotals,
      key: today.slice(0, 7),
      label: monthLabel(today.slice(0, 7)),
    },
    year: { ...yearTotals, key: today.slice(0, 4), label: today.slice(0, 4) },
    allTime: {
      ...allTime,
      firstEntry: firstEntry ? manilaDayKey(firstEntry.date) : null,
    },
    view: {
      mode: view,
      label: viewLabel,
      from: viewFrom,
      to: viewTo,
      totals: viewTotals,
      buckets,
    },
    topExpenses: slices(expenseByCategory),
    topEarnings: slices(earningByCategory),
    recent,
  });
}
