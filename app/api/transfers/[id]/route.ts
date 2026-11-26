import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { formatPeso, pesosToCents } from "@/lib/money";
import { isYmd, manilaDayStartUTC } from "@/lib/date";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

const WALLET_PICK = { select: { id: true, name: true, icon: true, color: true, logo: true } };

/** PATCH /api/transfers/:id */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.transfer.findFirst({
    where: { id, userId: user.sub },
  });
  if (!existing) return notFound("That transfer no longer exists");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const data: {
    date?: Date;
    amountCents?: number;
    feeCents?: number;
    note?: string | null;
    fromWalletId?: string;
    toWalletId?: string;
    archivedAt?: Date | null;
  } = {};

  if (body.archived !== undefined) {
    data.archivedAt = body.archived ? new Date() : null;
  }

  if (body.date !== undefined) {
    const dateStr = String(body.date);
    if (!isYmd(dateStr)) return badRequest("Choose a valid date");
    data.date = manilaDayStartUTC(dateStr);
  }

  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest("Enter an amount greater than 0");
    }
    data.amountCents = pesosToCents(amount);
  }

  if (body.fee !== undefined) {
    const fee = Number(body.fee) || 0;
    if (fee < 0) return badRequest("A fee can't be negative");
    data.feeCents = pesosToCents(fee);
  }

  if (body.note !== undefined) {
    data.note = body.note ? String(body.note).trim() || null : null;
  }

  const nextFrom =
    body.fromWalletId !== undefined
      ? String(body.fromWalletId)
      : existing.fromWalletId;
  const nextTo =
    body.toWalletId !== undefined
      ? String(body.toWalletId)
      : existing.toWalletId;

  if (nextFrom === nextTo) return badRequest("Pick two different wallets");

  if (body.fromWalletId !== undefined || body.toWalletId !== undefined) {
    const owned = await prisma.wallet.findMany({
      where: { userId: user.sub, id: { in: [nextFrom, nextTo] } },
      select: { id: true },
    });
    if (owned.length !== 2) return badRequest("That wallet does not exist");
    data.fromWalletId = nextFrom;
    data.toWalletId = nextTo;
  }

  const transfer = await prisma.transfer.update({
    where: { id },
    data,
    include: { fromWallet: WALLET_PICK, toWallet: WALLET_PICK },
  });

  await logActivity(user, {
    action: body.archived === false ? "transfer.restore" : "transfer.update",
    summary: `${body.archived === false ? "Restored" : "Edited"} the move of ${formatPeso(transfer.amountCents)}`,
    targetType: "Transfer",
    targetId: transfer.id,
  });

  return NextResponse.json({ transfer });
}

/** DELETE /api/transfers/:id — archives; ?purge=1 deletes for good. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.transfer.findFirst({
    where: { id, userId: user.sub },
    select: { id: true, amountCents: true },
  });
  if (!existing) return notFound("That transfer no longer exists");

  if (new URL(req.url).searchParams.get("purge") === "1") {
    await prisma.transfer.delete({ where: { id } });
    await logActivity(user, {
      action: "transfer.delete",
      summary: `Deleted a move of ${formatPeso(existing.amountCents)} for good`,
      targetType: "Transfer",
      targetId: id,
    });
    return NextResponse.json({ ok: true, purged: true });
  }

  await prisma.transfer.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  await logActivity(user, {
    action: "transfer.archive",
    summary: `Archived a move of ${formatPeso(existing.amountCents)}`,
    targetType: "Transfer",
    targetId: id,
  });
  return NextResponse.json({ ok: true, archived: true });
}
