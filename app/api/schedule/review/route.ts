import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import { formatPeso } from "@/lib/money";
import { manilaDayKey, longDayLabel } from "@/lib/date";
import { logActivity } from "@/lib/activity";
import { POST_HOUR_LABEL } from "@/lib/schedule";
import { checkTargets, loadSchedule, postDueEntries } from "@/lib/schedule-db";

type Action = "approve" | "skip" | "restore";

function parseAction(raw: unknown): Action | null {
  return raw === "approve" || raw === "skip" || raw === "restore" ? raw : null;
}

/**
 * POST /api/schedule/review — act on the rows you ticked.
 *
 *   approve  arm the row: it posts by itself at 4pm on its own date
 *   skip     not this time; the row stays as history and never comes back
 *   restore  put a skipped — or an armed, not yet posted — row back on the table
 *
 * Approving deliberately does NOT create an entry. It records that you said
 * yes; postDueEntries is what turns an armed row into money, and only once
 * 4pm Manila on its date has actually arrived. A row already POSTED is
 * finished here: it is an ordinary ledger entry and is edited on the Earnings
 * or Expenses page like any other.
 *
 * Everything an approval will need later is checked now, while you are still
 * looking at it — an armed row that cannot post is worse than a rejected one.
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

  const wanted =
    action === "restore"
      ? (["SKIPPED", "APPROVED"] as const)
      : (["PENDING"] as const);

  const rows = await prisma.scheduledEntry.findMany({
    where: { id: { in: ids }, userId: user.sub, status: { in: [...wanted] } },
    include: { category: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  if (rows.length === 0) {
    return badRequest(
      action === "restore"
        ? "Those have already posted — change them on the Earnings or Expenses page instead."
        : "Those rows have already been dealt with. Reload to see where they stand.",
    );
  }

  // ---- skip / restore -----------------------------------------------------
  if (action !== "approve") {
    await prisma.scheduledEntry.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, userId: user.sub },
      data: {
        status: action === "skip" ? "SKIPPED" : "PENDING",
        approvedAt: action === "skip" ? undefined : null,
      },
    });

    await logActivity(user, {
      action: action === "skip" ? "schedule.skip" : "schedule.restore",
      summary:
        action === "skip"
          ? `Skipped ${rows.length} scheduled row${rows.length === 1 ? "" : "s"} without encoding ${rows.length === 1 ? "it" : "them"}`
          : `Took ${rows.length} scheduled row${rows.length === 1 ? "" : "s"} back off the schedule, before ${rows.length === 1 ? "it" : "they"} posted`,
      targetType: "ScheduledEntry",
    });

    return NextResponse.json({
      ...(await loadSchedule(user.sub)),
      result: { done: rows.length, failed: [] as string[] },
    });
  }

  // ---- approve: arm the row, do not encode it ----------------------------
  const failed: string[] = [];
  const ready: string[] = [];
  let earningsCents = 0;
  let expenseCents = 0;

  for (const row of rows) {
    const label = `${longDayLabel(manilaDayKey(row.date))} · ${formatPeso(row.amountCents)}`;

    // Checked now rather than at posting time: at 4pm nobody is watching, so
    // a row that would be refused must never get as far as being armed.
    const problem = await checkTargets(user.sub, {
      kind: row.kind,
      categoryId: row.categoryId,
      walletId: row.walletId,
      note: row.note,
      requireDetail: true,
    });
    if (problem) {
      failed.push(`${label} — ${problem}`);
      continue;
    }

    ready.push(row.id);
    if (row.kind === "EARNING") earningsCents += row.amountCents;
    else expenseCents += row.amountCents;
  }

  if (ready.length > 0) {
    await prisma.scheduledEntry.updateMany({
      where: { id: { in: ready }, userId: user.sub, status: "PENDING" },
      data: { status: "APPROVED", approvedAt: new Date() },
    });

    await logActivity(user, {
      action: "schedule.approve",
      summary:
        `Scheduled ${ready.length} entr${ready.length === 1 ? "y" : "ies"} to post at ${POST_HOUR_LABEL} on ${ready.length === 1 ? "its date" : "their dates"}` +
        (earningsCents ? ` — ${formatPeso(earningsCents)} in` : "") +
        (expenseCents ? `${earningsCents ? "," : " —"} ${formatPeso(expenseCents)} out` : ""),
      targetType: "ScheduledEntry",
    });
  }

  // A date that has already gone by posts straight away rather than sitting
  // armed until the next nightly run.
  const posted = await postDueEntries(user.sub);

  return NextResponse.json({
    ...(await loadSchedule(user.sub)),
    result: {
      done: ready.length,
      failed,
      earningsCents,
      expenseCents,
      postedNow: posted.posted,
    },
  });
}
