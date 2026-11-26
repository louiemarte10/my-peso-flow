import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import { pesosToCents } from "@/lib/money";
import { isYmd, manilaDayStartUTC, manilaRangeUTC } from "@/lib/date";
import { scopeFilter } from "@/lib/archive";

const WALLET_PICK = { select: { id: true, name: true, icon: true, color: true } };

/** GET /api/transfers?from=&to=&walletId= */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const walletId = searchParams.get("walletId");

  const transfers = await prisma.transfer.findMany({
    where: {
      userId: user.sub,
      ...scopeFilter(searchParams.get("include")),
      ...(isYmd(from) && isYmd(to) ? { date: manilaRangeUTC(from, to) } : {}),
      ...(walletId
        ? { OR: [{ fromWalletId: walletId }, { toWalletId: walletId }] }
        : {}),
    },
    include: { fromWallet: WALLET_PICK, toWallet: WALLET_PICK },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 300,
  });

  const totals = transfers.reduce(
    (acc, t) => {
      acc.movedCents += t.amountCents;
      acc.feesCents += t.feeCents;
      return acc;
    },
    { movedCents: 0, feesCents: 0 },
  );

  return NextResponse.json({ transfers, totals });
}

/** POST /api/transfers — move money between your own wallets. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const fromWalletId = String(body.fromWalletId ?? "");
  const toWalletId = String(body.toWalletId ?? "");
  if (!fromWalletId || !toWalletId) {
    return badRequest("Choose both a source and a destination wallet");
  }
  if (fromWalletId === toWalletId) {
    return badRequest("Pick two different wallets");
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Enter an amount greater than 0");
  }

  const fee = Number(body.fee) || 0;
  if (fee < 0) return badRequest("A fee can't be negative");

  const dateStr = body.date ? String(body.date) : null;
  if (!isYmd(dateStr)) return badRequest("Choose a valid date");

  // Both wallets must be yours.
  const owned = await prisma.wallet.findMany({
    where: { userId: user.sub, id: { in: [fromWalletId, toWalletId] } },
    select: { id: true },
  });
  if (owned.length !== 2) return badRequest("That wallet does not exist");

  const transfer = await prisma.transfer.create({
    data: {
      userId: user.sub,
      date: manilaDayStartUTC(dateStr),
      fromWalletId,
      toWalletId,
      amountCents: pesosToCents(amount),
      feeCents: pesosToCents(fee),
      note: body.note ? String(body.note).trim() || null : null,
    },
    include: { fromWallet: WALLET_PICK, toWallet: WALLET_PICK },
  });

  return NextResponse.json({ transfer }, { status: 201 });
}
