import "server-only";
import { prisma } from "./db";
import { addDaysKey, manilaRangeUTC, todayKey } from "./date";
import { SPEND_WINDOW_DAYS } from "./windows";

export { SPEND_WINDOW_DAYS };

export type WalletSummary = {
  id: string;
  name: string;
  type: "BANK" | "EWALLET" | "CASH" | "SAVINGS" | "CREDIT";
  color: string | null;
  icon: string | null;
  accountRef: string | null;
  openingBalanceCents: number;
  lowBalanceCents: number;
  archived: boolean;
  sortOrder: number;

  /** Derived: opening + earnings − expenses − transfers out (incl. fees) + transfers in. */
  balanceCents: number;
  earningsCents: number;
  expenseCents: number;
  transferInCents: number;
  transferOutCents: number;
  feesCents: number;
  movementCount: number;

  /** Spending out of this wallet over the last SPEND_WINDOW_DAYS. */
  recentSpendCents: number;
  /** recentSpendCents / SPEND_WINDOW_DAYS. */
  avgDailySpendCents: number;
  /** Whole days the balance lasts at that rate; null when nothing is spent. */
  runwayDays: number | null;
  /** True when lowBalanceCents is set and the balance has reached it. */
  low: boolean;
};

/**
 * Every wallet with its derived balance. Balances are never stored — they are
 * recomputed from the entries and transfers, so editing any past row keeps the
 * wallet correct automatically.
 */
export async function walletSummaries(
  userId: string,
  { includeArchived = true }: { includeArchived?: boolean } = {},
): Promise<WalletSummary[]> {
  const today = todayKey();
  const windowFrom = addDaysKey(today, -(SPEND_WINDOW_DAYS - 1));

  const [wallets, entryGroups, outGroups, inGroups, recentSpendGroups] =
    await Promise.all([
      prisma.wallet.findMany({
        where: { userId, ...(includeArchived ? {} : { archived: false }) },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.entry.groupBy({
        by: ["walletId", "kind"],
        where: { userId, walletId: { not: null } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      prisma.transfer.groupBy({
        by: ["fromWalletId"],
        where: { userId },
        _sum: { amountCents: true, feeCents: true },
        _count: { _all: true },
      }),
      prisma.transfer.groupBy({
        by: ["toWalletId"],
        where: { userId },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      prisma.entry.groupBy({
        by: ["walletId"],
        where: {
          userId,
          kind: "EXPENSE",
          walletId: { not: null },
          date: manilaRangeUTC(windowFrom, today),
        },
        _sum: { amountCents: true },
      }),
    ]);

  const earnings = new Map<string, number>();
  const expenses = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const g of entryGroups) {
    if (!g.walletId) continue;
    const sum = g._sum.amountCents ?? 0;
    if (g.kind === "EARNING") {
      earnings.set(g.walletId, (earnings.get(g.walletId) ?? 0) + sum);
    } else {
      expenses.set(g.walletId, (expenses.get(g.walletId) ?? 0) + sum);
    }
    counts.set(g.walletId, (counts.get(g.walletId) ?? 0) + g._count._all);
  }

  const outAmount = new Map<string, number>();
  const outFees = new Map<string, number>();
  for (const g of outGroups) {
    outAmount.set(g.fromWalletId, g._sum.amountCents ?? 0);
    outFees.set(g.fromWalletId, g._sum.feeCents ?? 0);
    counts.set(
      g.fromWalletId,
      (counts.get(g.fromWalletId) ?? 0) + g._count._all,
    );
  }

  const inAmount = new Map<string, number>();
  for (const g of inGroups) {
    inAmount.set(g.toWalletId, g._sum.amountCents ?? 0);
    counts.set(g.toWalletId, (counts.get(g.toWalletId) ?? 0) + g._count._all);
  }

  const recentSpend = new Map<string, number>();
  for (const g of recentSpendGroups) {
    if (g.walletId) recentSpend.set(g.walletId, g._sum.amountCents ?? 0);
  }

  return wallets.map((w) => {
    const earningsCents = earnings.get(w.id) ?? 0;
    const expenseCents = expenses.get(w.id) ?? 0;
    const transferInCents = inAmount.get(w.id) ?? 0;
    const transferOutCents = outAmount.get(w.id) ?? 0;
    const feesCents = outFees.get(w.id) ?? 0;

    const balanceCents =
      w.openingBalanceCents +
      earningsCents -
      expenseCents +
      transferInCents -
      transferOutCents -
      feesCents;

    const recentSpendCents = recentSpend.get(w.id) ?? 0;
    const avgDailySpendCents = Math.round(recentSpendCents / SPEND_WINDOW_DAYS);
    const runwayDays =
      avgDailySpendCents > 0
        ? Math.max(0, Math.floor(balanceCents / avgDailySpendCents))
        : null;

    return {
      id: w.id,
      name: w.name,
      type: w.type,
      color: w.color,
      icon: w.icon,
      accountRef: w.accountRef,
      openingBalanceCents: w.openingBalanceCents,
      lowBalanceCents: w.lowBalanceCents,
      archived: w.archived,
      sortOrder: w.sortOrder,

      balanceCents,
      earningsCents,
      expenseCents,
      transferInCents,
      transferOutCents,
      feesCents,
      movementCount: counts.get(w.id) ?? 0,

      recentSpendCents,
      avgDailySpendCents,
      runwayDays,
      low: w.lowBalanceCents > 0 && balanceCents <= w.lowBalanceCents,
    };
  });
}

/** The balance of one wallet, or null when it isn't yours. */
export async function walletBalance(
  userId: string,
  walletId: string,
): Promise<WalletSummary | null> {
  const all = await walletSummaries(userId);
  return all.find((w) => w.id === walletId) ?? null;
}
