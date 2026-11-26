import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/api";
import { ARCHIVED } from "@/lib/archive";

const WALLET_PICK = { select: { id: true, name: true, icon: true, color: true } };

/**
 * GET /api/archive — everything this user has archived, in one payload, so the
 * Archived page can offer Restore or Delete forever in a single place.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const where = { userId: user.sub, ...ARCHIVED };

  const [entries, transfers, categories, wallets] = await Promise.all([
    prisma.entry.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, color: true } },
        wallet: WALLET_PICK,
      },
      orderBy: { archivedAt: "desc" },
      take: 300,
    }),
    prisma.transfer.findMany({
      where,
      include: { fromWallet: WALLET_PICK, toWallet: WALLET_PICK },
      orderBy: { archivedAt: "desc" },
      take: 300,
    }),
    prisma.category.findMany({
      where,
      include: { _count: { select: { entries: true } } },
      orderBy: { archivedAt: "desc" },
    }),
    prisma.wallet.findMany({
      where,
      include: {
        _count: {
          select: { entries: true, transfersFrom: true, transfersTo: true },
        },
      },
      orderBy: { archivedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    entries,
    transfers,
    categories: categories.map((c) => ({ ...c, archived: true })),
    wallets: wallets.map((w) => ({
      ...w,
      archived: true,
      movementCount:
        w._count.entries + w._count.transfersFrom + w._count.transfersTo,
    })),
    counts: {
      entries: entries.length,
      transfers: transfers.length,
      categories: categories.length,
      wallets: wallets.length,
      total:
        entries.length + transfers.length + categories.length + wallets.length,
    },
  });
}
