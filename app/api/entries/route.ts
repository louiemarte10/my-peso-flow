import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import { pesosToCents } from "@/lib/money";
import { isYmd, manilaDayStartUTC, manilaRangeUTC } from "@/lib/date";
import type { EntryKind } from "@/generated/prisma/client";

const ENTRY_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  wallet: { select: { id: true, name: true, icon: true, color: true } },
};

function parseKind(raw: string | null): EntryKind | null {
  return raw === "EARNING" || raw === "EXPENSE" ? raw : null;
}

/** GET /api/entries?kind=EARNING&from=&to=&walletId=&limit=300 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const kind = parseKind(searchParams.get("kind"));
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const walletId = searchParams.get("walletId");
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || 300, 1),
    1000,
  );

  const entries = await prisma.entry.findMany({
    where: {
      userId: user.sub,
      ...(kind ? { kind } : {}),
      ...(walletId ? { walletId } : {}),
      ...(isYmd(from) && isYmd(to) ? { date: manilaRangeUTC(from, to) } : {}),
    },
    include: ENTRY_INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  const totals = entries.reduce(
    (acc, e) => {
      if (e.kind === "EARNING") acc.earningsCents += e.amountCents;
      else acc.expenseCents += e.amountCents;
      return acc;
    },
    { earningsCents: 0, expenseCents: 0 },
  );

  return NextResponse.json({
    entries,
    totals: {
      ...totals,
      balanceCents: totals.earningsCents - totals.expenseCents,
    },
  });
}

/** POST /api/entries — encode one earning or expense. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const kind = parseKind(String(body.kind ?? ""));
  if (!kind) return badRequest("Entry must be an EARNING or an EXPENSE");

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("Enter an amount greater than 0");
  }

  const dateStr = body.date ? String(body.date) : null;
  if (!isYmd(dateStr)) return badRequest("Choose a valid date");

  const note = body.note ? String(body.note).trim() || null : null;

  const categoryId = body.categoryId ? String(body.categoryId) : null;
  if (categoryId) {
    const owned = await prisma.category.findFirst({
      where: { id: categoryId, userId: user.sub, kind },
      select: { id: true, name: true, requiresDetail: true },
    });
    if (!owned) return badRequest("That category does not exist");
    // Catch-all categories are meaningless without a description.
    if (owned.requiresDetail && !note) {
      return badRequest(
        `Say what this was — "${owned.name}" on its own won't mean anything later`,
      );
    }
  }

  const walletId = body.walletId ? String(body.walletId) : null;
  if (walletId) {
    const owned = await prisma.wallet.findFirst({
      where: { id: walletId, userId: user.sub },
      select: { id: true },
    });
    if (!owned) return badRequest("That wallet does not exist");
  }

  const entry = await prisma.entry.create({
    data: {
      userId: user.sub,
      kind,
      date: manilaDayStartUTC(dateStr),
      amountCents: pesosToCents(amount),
      note,
      categoryId,
      walletId,
    },
    include: ENTRY_INCLUDE,
  });

  return NextResponse.json({ entry }, { status: 201 });
}
