import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { pesosToCents } from "@/lib/money";
import { logActivity } from "@/lib/activity";
import { parseDaysOfMonth } from "@/lib/schedule";
import {
  generateProposals,
  loadSchedule,
  checkTargets,
} from "@/lib/schedule-db";
import type { EntryKind } from "@/generated/prisma/client";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/schedule/rules/:id — change a rule, or switch it off. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.scheduleRule.findFirst({
    where: { id, userId: user.sub },
  });
  if (!existing) return notFound("That rule no longer exists");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const data: {
    name?: string;
    kind?: EntryKind;
    amountCents?: number;
    daysOfMonth?: number[];
    note?: string | null;
    active?: boolean;
    categoryId?: string | null;
    walletId?: string | null;
  } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("Give the rule a name you'll recognise");
    if (name.length > 60) return badRequest("That name is too long");
    data.name = name;
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

  if (body.daysOfMonth !== undefined) {
    const days = parseDaysOfMonth(body.daysOfMonth);
    if (!days.ok) return badRequest(days.error);
    data.daysOfMonth = days.days;
  }

  if (body.note !== undefined) {
    data.note = body.note ? String(body.note).trim() || null : null;
  }
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.categoryId !== undefined) {
    data.categoryId = body.categoryId ? String(body.categoryId) : null;
  }
  if (body.walletId !== undefined) {
    data.walletId = body.walletId ? String(body.walletId) : null;
  }

  // Changing the kind can orphan a category that belonged to the old one.
  const nextKind = data.kind ?? existing.kind;
  if (data.kind && data.categoryId === undefined) {
    data.categoryId = null;
  }

  const problem = await checkTargets(user.sub, {
    kind: nextKind,
    categoryId:
      data.categoryId !== undefined ? data.categoryId : existing.categoryId,
    walletId: data.walletId !== undefined ? data.walletId : existing.walletId,
    note: data.note !== undefined ? data.note : existing.note,
  });
  if (problem) return badRequest(problem);

  await prisma.scheduleRule.update({ where: { id }, data });

  await logActivity(user, {
    action: "schedule.rule.update",
    summary: `Updated the recurring rule "${data.name ?? existing.name}"`,
    targetType: "ScheduleRule",
    targetId: id,
  });

  // A rule that changed shape proposes different dates; a rule switched off
  // stops proposing. Either way the queue is rebuilt before answering.
  await generateProposals(user.sub);
  return NextResponse.json(await loadSchedule(user.sub));
}

/**
 * DELETE /api/schedule/rules/:id — remove the rule and anything it has
 * proposed that is still waiting.
 *
 * Rows you already approved are real ledger entries and are left completely
 * alone: deleting a rule must never reach into the books. Rows you skipped
 * stay as history too.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.scheduleRule.findFirst({
    where: { id, userId: user.sub },
    select: { id: true, name: true },
  });
  if (!existing) return notFound("That rule no longer exists");

  const dropped = await prisma.scheduledEntry.deleteMany({
    where: { userId: user.sub, ruleId: id, status: "PENDING" },
  });
  await prisma.scheduleRule.delete({ where: { id } });

  await logActivity(user, {
    action: "schedule.rule.delete",
    summary: `Deleted the recurring rule "${existing.name}"${dropped.count ? ` and ${dropped.count} proposal${dropped.count === 1 ? "" : "s"} still waiting for review` : ""}`,
    targetType: "ScheduleRule",
    targetId: id,
  });

  return NextResponse.json(await loadSchedule(user.sub));
}
