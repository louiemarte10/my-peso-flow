import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import { formatPeso } from "@/lib/money";
import { manilaDayKey, longDayLabel } from "@/lib/date";
import { logActivity } from "@/lib/activity";
import { checkTargets, loadSchedule } from "@/lib/schedule-db";

type Action = "approve" | "skip" | "restore";

function parseAction(raw: unknown): Action | null {
  return raw === "approve" || raw === "skip" || raw === "restore" ? raw : null;
}

/**
 * POST /api/schedule/review — act on the rows you ticked.
 *
 *   approve  the proposal becomes a real ledger entry
 *   skip     not this time; the row stays as history and never comes back
 *   restore  put a skipped row back on the table
 *
 * Approving is the ONLY path from a proposal to money, it only ever touches
 * ids that were sent, and each one is written in a transaction with the row it
 * came from — so a proposal can never be marked approved without its entry
 * existing, nor an entry created twice from the same row.
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

  const action = parseAction(body.action);
  if (!action) return badRequest("Unknown action");

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((i) => String(i)))]
    : [];
  if (ids.length === 0) return badRequest("Tick at least one row first");
  if (ids.length > 200) return badRequest("That is too many rows at once");

  const wanted = action === "restore" ? "SKIPPED" : "PENDING";
  const rows = await prisma.scheduledEntry.findMany({
    where: { id: { in: ids }, userId: user.sub, status: wanted },
    include: { category: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  if (rows.length === 0) {
    return badRequest(
      "Those rows have already been dealt with. Reload to see where they stand.",
    );
  }

  // ---- skip / restore -----------------------------------------------------
  if (action !== "approve") {
    await prisma.scheduledEntry.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, userId: user.sub },
      data: { status: action === "skip" ? "SKIPPED" : "PENDING" },
    });

    await logActivity(user, {
      action: action === "skip" ? "schedule.skip" : "schedule.restore",
      summary:
        action === "skip"
          ? `Skipped ${rows.length} scheduled row${rows.length === 1 ? "" : "s"} without encoding ${rows.length === 1 ? "it" : "them"}`
          : `Put ${rows.length} skipped scheduled row${rows.length === 1 ? "" : "s"} back for review`,
      targetType: "ScheduledEntry",
    });

    return NextResponse.json({
      ...(await loadSchedule(user.sub)),
      result: { done: rows.length, failed: [] as string[] },
    });
  }

  // ---- approve ------------------------------------------------------------
  const failed: string[] = [];
  let earningsCents = 0;
  let expenseCents = 0;
  let done = 0;

  for (const row of rows) {
    const label = `${longDayLabel(manilaDayKey(row.date))} · ${formatPeso(row.amountCents)}`;

    const problem = await checkTargets(user.sub, {
      kind: row.kind,
      categoryId: row.categoryId,
      walletId: row.walletId,
      note: row.note,
      // Approving writes to the ledger, so it answers to the ledger's rules.
      requireDetail: true,
    });
    if (problem) {
      failed.push(`${label} — ${problem}`);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const entry = await tx.entry.create({
          data: {
            userId: user.sub,
            kind: row.kind,
            date: row.date,
            amountCents: row.amountCents,
            note: row.note,
            categoryId: row.categoryId,
            walletId: row.walletId,
          },
        });
        await tx.scheduledEntry.update({
          where: { id: row.id },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
            entryId: entry.id,
          },
        });
      });
      done += 1;
      if (row.kind === "EARNING") earningsCents += row.amountCents;
      else expenseCents += row.amountCents;
    } catch {
      failed.push(`${label} — could not be encoded, try it on its own`);
    }
  }

  if (done > 0) {
    await logActivity(user, {
      action: "schedule.approve",
      summary:
        `Approved ${done} scheduled row${done === 1 ? "" : "s"} into the ledger` +
        (earningsCents ? ` — ${formatPeso(earningsCents)} in` : "") +
        (expenseCents ? `${earningsCents ? "," : " —"} ${formatPeso(expenseCents)} out` : ""),
      targetType: "ScheduledEntry",
    });
  }

  return NextResponse.json({
    ...(await loadSchedule(user.sub)),
    result: { done, failed, earningsCents, expenseCents },
  });
}
