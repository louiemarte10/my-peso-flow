import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserRecord } from "@/lib/auth";
import { unauthorized } from "@/lib/api";
import { walletSummaries } from "@/lib/wallets";
import { LIVE } from "@/lib/archive";
import { USER_CATEGORY_LIMIT, USER_WALLET_LIMIT } from "@/lib/config";
import {
  manilaDayKey,
  manilaRangeUTC,
  monthStartKey,
  todayKey,
} from "@/lib/date";

/**
 * GET /api/profile — everything about the signed-in person's own books.
 *
 * Deliberately scoped to `me.id`, never a querystring: this is the one page
 * where somebody looks at themselves. An admin using "Log in as" sees the
 * account they are acting as, which is the whole point of that feature.
 */
export async function GET() {
  const me = await getCurrentUserRecord();
  if (!me) return unauthorized();

  const id = me.id;
  const today = todayKey();
  const monthFrom = monthStartKey(today);

  const [
    account,
    walletRows,
    categoryRows,
    entryTotals,
    entryCount,
    transferCount,
    firstEntry,
    monthRows,
    topCategories,
    biggestExpense,
    biggestEarning,
    myActivity,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        createdAt: true,
        googleId: true,
        passwordHash: true,
      },
    }),
    walletSummaries(id, { includeArchived: true }),
    prisma.category.findMany({
      where: { userId: id },
      select: { id: true, kind: true, archivedAt: true },
    }),
    prisma.entry.groupBy({
      by: ["kind"],
      where: { userId: id, ...LIVE },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.entry.count({ where: { userId: id } }),
    prisma.transfer.count({ where: { userId: id, ...LIVE } }),
    prisma.entry.findFirst({
      where: { userId: id, ...LIVE },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.entry.findMany({
      // manilaRangeUTC, never a sliced ISO string: 00:00 Manila is 16:00 UTC
      // on the PREVIOUS date, so a naive bound drops the 1st of the month.
      where: { userId: id, ...LIVE, date: manilaRangeUTC(monthFrom, today) },
      select: { date: true, kind: true, amountCents: true },
    }),
    prisma.entry.groupBy({
      by: ["categoryId"],
      where: { userId: id, ...LIVE, kind: "EXPENSE" },
      _sum: { amountCents: true },
      _count: { _all: true },
      orderBy: { _sum: { amountCents: "desc" } },
      take: 5,
    }),
    prisma.entry.findFirst({
      where: { userId: id, ...LIVE, kind: "EXPENSE" },
      orderBy: { amountCents: "desc" },
      include: { category: { select: { name: true, color: true } } },
    }),
    prisma.entry.findFirst({
      where: { userId: id, ...LIVE, kind: "EARNING" },
      orderBy: { amountCents: "desc" },
      include: { category: { select: { name: true, color: true } } },
    }),
    // Their own actions only. The full log stays admin-only; this is the
    // person's own history, which is theirs to see.
    prisma.activityLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        summary: true,
        createdAt: true,
        impersonatedByEmail: true,
      },
    }),
  ]);

  // ── Money ────────────────────────────────────────────────────────────────
  let earningsCents = 0;
  let expenseCents = 0;
  let earningCount = 0;
  let expenseCount = 0;
  for (const g of entryTotals) {
    const sum = g._sum.amountCents ?? 0;
    if (g.kind === "EARNING") {
      earningsCents = sum;
      earningCount = g._count._all;
    } else {
      expenseCents = sum;
      expenseCount = g._count._all;
    }
  }

  let monthIn = 0;
  let monthOut = 0;
  const monthDays = new Set<string>();
  for (const r of monthRows) {
    const key = manilaDayKey(r.date);
    if (key < monthFrom || key > today) continue;
    monthDays.add(key);
    if (r.kind === "EARNING") monthIn += r.amountCents;
    else monthOut += r.amountCents;
  }

  // ── Counts ───────────────────────────────────────────────────────────────
  const liveWallets = walletRows.filter((w) => !w.archived);
  const liveCategories = categoryRows.filter((c) => c.archivedAt === null);
  const isAdmin = me.role === "ADMIN" && !me.impersonatedBy;

  // ── Where the money goes ─────────────────────────────────────────────────
  const names = new Map(
    (
      await prisma.category.findMany({
        where: { id: { in: topCategories.map((t) => t.categoryId ?? "") } },
        select: { id: true, name: true, color: true },
      })
    ).map((c) => [c.id, c]),
  );

  const firstDay = firstEntry ? manilaDayKey(firstEntry.date) : null;
  const daysTracking = firstDay
    ? Math.floor(
        (new Date(`${today}T00:00:00Z`).getTime() -
          new Date(`${firstDay}T00:00:00Z`).getTime()) /
          86_400_000,
      ) + 1
    : 0;

  return NextResponse.json({
    account: {
      id: me.id,
      name: me.name,
      email: me.email,
      role: me.role,
      imageUrl: me.imageUrl,
      createdAt: account?.createdAt ?? null,
      signInMethods: {
        password: Boolean(account?.passwordHash),
        google: Boolean(account?.googleId),
      },
      impersonatedBy: me.impersonatedBy?.email ?? null,
    },
    counts: {
      wallets: liveWallets.length,
      walletsArchived: walletRows.length - liveWallets.length,
      walletLimit: isAdmin ? null : USER_WALLET_LIMIT,
      categories: liveCategories.length,
      categoriesArchived: categoryRows.length - liveCategories.length,
      categoryLimit: isAdmin ? null : USER_CATEGORY_LIMIT,
      earningCategories: liveCategories.filter((c) => c.kind === "EARNING").length,
      expenseCategories: liveCategories.filter((c) => c.kind === "EXPENSE").length,
      transactions: earningCount + expenseCount,
      transactionsArchived: entryCount - (earningCount + expenseCount),
      earnings: earningCount,
      expenses: expenseCount,
      transfers: transferCount,
    },
    money: {
      earningsCents,
      expenseCents,
      balanceCents: earningsCents - expenseCents,
      walletTotalCents: liveWallets.reduce((s, w) => s + w.balanceCents, 0),
      lowWallets: liveWallets.filter((w) => w.low).length,
      month: {
        from: monthFrom,
        earningsCents: monthIn,
        expenseCents: monthOut,
        balanceCents: monthIn - monthOut,
        daysEncoded: monthDays.size,
      },
    },
    habits: {
      firstEntry: firstDay,
      daysTracking,
      topCategories: topCategories
        .filter((t) => t.categoryId)
        .map((t) => ({
          name: names.get(t.categoryId!)?.name ?? "Uncategorised",
          color: names.get(t.categoryId!)?.color ?? null,
          totalCents: t._sum.amountCents ?? 0,
          count: t._count._all,
        })),
      biggestExpense: biggestExpense && {
        amountCents: biggestExpense.amountCents,
        note: biggestExpense.note,
        date: biggestExpense.date,
        category: biggestExpense.category?.name ?? "Uncategorised",
      },
      biggestEarning: biggestEarning && {
        amountCents: biggestEarning.amountCents,
        note: biggestEarning.note,
        date: biggestEarning.date,
        category: biggestEarning.category?.name ?? "Uncategorised",
      },
    },
    wallets: liveWallets.map((w) => ({
      id: w.id,
      name: w.name,
      icon: w.icon,
      color: w.color,
      logo: w.logo,
      balanceCents: w.balanceCents,
      low: w.low,
    })),
    recentActivity: myActivity,
  });
}
