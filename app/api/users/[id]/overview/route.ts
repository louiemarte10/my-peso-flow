import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth";
import { notFound, unauthorized } from "@/lib/api";
import { walletSummaries } from "@/lib/wallets";
import { LIVE } from "@/lib/archive";
import {
  addDaysKey,
  manilaDayKey,
  manilaRangeUTC,
  monthStartKey,
  todayKey,
  yearStartKey,
} from "@/lib/date";

type Ctx = { params: Promise<{ id: string }> };

type Totals = {
  earningsCents: number;
  expenseCents: number;
  balanceCents: number;
};

const ZERO = (): Totals => ({
  earningsCents: 0,
  expenseCents: 0,
  balanceCents: 0,
});

/**
 * GET /api/users/:id/overview — admin only.
 *
 * A read-only summary of one person's books for the People page: the same
 * headline figures their own dashboard shows, their wallet balances and their
 * latest entries. Admins get this view so they can see how everyone is doing
 * without having to "Log in as" each one.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  if (!admin) return unauthorized();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      imageUrl: true,
      createdAt: true,
    },
  });
  if (!user) return notFound("That account no longer exists");

  const today = todayKey();
  const yearFrom = yearStartKey(today);

  const [rows, allTimeGroups, wallets, recent, firstEntry] = await Promise.all([
    prisma.entry.findMany({
      where: { userId: id, ...LIVE, date: manilaRangeUTC(yearFrom, today) },
      select: { date: true, kind: true, amountCents: true },
    }),
    prisma.entry.groupBy({
      by: ["kind"],
      where: { userId: id, ...LIVE },
      _sum: { amountCents: true },
    }),
    walletSummaries(id, { includeArchived: false }),
    prisma.entry.findMany({
      where: { userId: id, ...LIVE },
      include: {
        category: { select: { id: true, name: true, color: true } },
        wallet: { select: { id: true, name: true, icon: true, color: true, logo: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
    prisma.entry.findFirst({
      where: { userId: id, ...LIVE },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);

  function sumFrom(from: string): Totals {
    const t = ZERO();
    for (const r of rows) {
      const key = manilaDayKey(r.date);
      if (key < from || key > today) continue;
      if (r.kind === "EARNING") t.earningsCents += r.amountCents;
      else t.expenseCents += r.amountCents;
    }
    t.balanceCents = t.earningsCents - t.expenseCents;
    return t;
  }

  const allTime = ZERO();
  for (const g of allTimeGroups) {
    const sum = g._sum.amountCents ?? 0;
    if (g.kind === "EARNING") allTime.earningsCents += sum;
    else allTime.expenseCents += sum;
  }
  allTime.balanceCents = allTime.earningsCents - allTime.expenseCents;

  return NextResponse.json({
    user,
    today: sumFrom(today),
    last7: sumFrom(addDaysKey(today, -6)),
    month: sumFrom(monthStartKey(today)),
    year: sumFrom(yearFrom),
    allTime: {
      ...allTime,
      firstEntry: firstEntry ? manilaDayKey(firstEntry.date) : null,
    },
    wallets,
    walletTotals: {
      totalCents: wallets.reduce((sum, w) => sum + w.balanceCents, 0),
      walletCount: wallets.length,
      lowCount: wallets.filter((w) => w.low).length,
    },
    recent,
  });
}
