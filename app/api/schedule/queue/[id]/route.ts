import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { pesosToCents } from "@/lib/money";
import { isYmd, manilaDayStartUTC } from "@/lib/date";
import { checkTargets, QUEUE_INCLUDE } from "@/lib/schedule-db";
import type { EntryKind } from "@/generated/prisma/client";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/schedule/queue/:id — change one row that is waiting for review.
 *
 * Only PENDING rows may be edited: once approved it is a real ledger entry and
 * belongs to the Earnings/Expenses pages, and once skipped it is history.
 *
 * Any edit sets `edited`, which stops the next generate from overwriting what
 * you typed with the rule's own values.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.scheduledEntry.findFirst({
    where: { id, userId: user.sub },
  });
  if (!existing) return notFound("That row no longer exists");
  if (existing.status !== "PENDING") {
    return badRequest(
      existing.status === "APPROVED"
        ? "This one is already in your ledger — edit it on the Earnings or Expenses page"
        : "This one was skipped. Put it back first if you want to change it.",
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const data: {
    date?: Date;
    kind?: EntryKind;
    amountCents?: number;
    note?: string | null;
    categoryId?: string | null;
    walletId?: string | null;
    edited: boolean;
  } = { edited: true };

  if (body.date !== undefined) {
    const ymd = String(body.date);
    if (!isYmd(ymd)) return badRequest("Choose a valid date");
    data.date = manilaDayStartUTC(ymd);
  }

  if (body.kind !== undefined) {
    if (body.kind !== "EARNING" && body.kind !== "EXPENSE") {
      return badRequest("Say whether this is an earning or an expense");
    }
    data.kind = body.kind;
  }

  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest("Enter an amount greater than 0");
    }
    data.amountCents = pesosToCents(amount);
  }

  if (body.note !== undefined) {
    data.note = body.note ? String(body.note).trim() || null : null;
  }
  if (body.categoryId !== undefined) {
    data.categoryId = body.categoryId ? String(body.categoryId) : null;
  }
  if (body.walletId !== undefined) {
    data.walletId = body.walletId ? String(body.walletId) : null;
  }

  const problem = await checkTargets(user.sub, {
    kind: data.kind ?? existing.kind,
    categoryId:
      data.categoryId !== undefined ? data.categoryId : existing.categoryId,
    walletId: data.walletId !== undefined ? data.walletId : existing.walletId,
    note: data.note !== undefined ? data.note : existing.note,
  });
  if (problem) return badRequest(problem);

  // A row whose date moved onto a day its rule also proposes would collide
  // with the (ruleId, date) unique constraint. Say so plainly rather than
  // letting a database error reach the page.
  if (data.date && existing.ruleId) {
    const clash = await prisma.scheduledEntry.findFirst({
      where: { ruleId: existing.ruleId, date: data.date, id: { not: id } },
      select: { id: true },
    });
    if (clash) {
      return badRequest(
        "This rule already has a row on that date — change that one instead",
      );
    }
  }

  const row = await prisma.scheduledEntry.update({
    where: { id },
    data,
    include: QUEUE_INCLUDE,
  });

  return NextResponse.json({ row });
}
