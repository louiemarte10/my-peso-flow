import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import { pesosToCents, formatPeso } from "@/lib/money";
import { LIVE } from "@/lib/archive";
import { logActivity } from "@/lib/activity";
import {
  MAX_SCHEDULE_RULES,
  STANDARD_RULES,
  describeDays,
  matchCategory,
  parseDaysOfMonth,
} from "@/lib/schedule";
import {
  generateProposals,
  loadSchedule,
  checkTargets,
} from "@/lib/schedule-db";
import type { EntryKind } from "@/generated/prisma/client";

function parseKind(raw: unknown): EntryKind | null {
  return raw === "EARNING" || raw === "EXPENSE" ? raw : null;
}

/**
 * POST /api/schedule/rules — add one rule, or `{ preset: "standard" }` to drop
 * in the usual set at once.
 *
 * Either way the answer is the full workflow state with fresh proposals
 * already generated, so the table on screen is correct the moment it returns.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const existing = await prisma.scheduleRule.count({
    where: { userId: user.sub },
  });

  // ---- the starter set ----------------------------------------------------
  if (body.preset === "standard") {
    if (existing > 0) {
      return badRequest(
        "You already have rules — add the ones you want individually instead",
      );
    }

    const categories = await prisma.category.findMany({
      where: { userId: user.sub, ...LIVE },
      select: { id: true, name: true, kind: true },
    });

    await prisma.scheduleRule.createMany({
      data: STANDARD_RULES.map((p) => ({
        userId: user.sub,
        name: p.name,
        kind: p.kind as EntryKind,
        amountCents: pesosToCents(p.amount),
        daysOfMonth: p.daysOfMonth,
        note: p.note,
        categoryId: matchCategory(categories, p)?.id ?? null,
      })),
    });

    await logActivity(user, {
      action: "schedule.preset",
      summary: `Set up the standard recurring rules (${STANDARD_RULES.length} of them)`,
      targetType: "ScheduleRule",
    });

    await generateProposals(user.sub);
    return NextResponse.json(await loadSchedule(user.sub), { status: 201 });
  }

  // ---- one rule -----------------------------------------------------------
  if (existing >= MAX_SCHEDULE_RULES) {
    return badRequest(
      `You already have ${existing} rules, which is the most one account keeps. Delete one you no longer need.`,
    );
  }

  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("Give the rule a name you'll recognise");
  if (name.length > 60) return badRequest("That name is too long");

  const kind = parseKind(body.kind);
  if (!kind) return badRequest("Say whether this is an earning or an expense");

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Enter an amount greater than 0");
  }

  const days = parseDaysOfMonth(body.daysOfMonth);
  if (!days.ok) return badRequest(days.error);

  const note = body.note ? String(body.note).trim() || null : null;
  const categoryId = body.categoryId ? String(body.categoryId) : null;
  const walletId = body.walletId ? String(body.walletId) : null;

  const problem = await checkTargets(user.sub, {
    kind,
    categoryId,
    walletId,
    note,
  });
  if (problem) return badRequest(problem);

  const rule = await prisma.scheduleRule.create({
    data: {
      userId: user.sub,
      name,
      kind,
      amountCents: pesosToCents(amount),
      daysOfMonth: days.days,
      note,
      categoryId,
      walletId,
    },
  });

  await logActivity(user, {
    action: "schedule.rule.create",
    summary: `Added a recurring ${kind === "EARNING" ? "earning" : "expense"} rule "${name}" — ${formatPeso(rule.amountCents)} on ${describeDays(days.days)}`,
    targetType: "ScheduleRule",
    targetId: rule.id,
  });

  await generateProposals(user.sub);
  return NextResponse.json(await loadSchedule(user.sub), { status: 201 });
}
