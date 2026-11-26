import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { formatPeso, pesosToCents } from "@/lib/money";
import { isYmd, manilaDayStartUTC } from "@/lib/date";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

const ENTRY_INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  wallet: { select: { id: true, name: true, icon: true, color: true, logo: true } },
};

/** PATCH /api/entries/:id — edit an encoded entry. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.entry.findFirst({
    where: { id, userId: user.sub },
  });
  if (!existing) return notFound("That entry no longer exists");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const data: {
    date?: Date;
    amountCents?: number;
    note?: string | null;
    categoryId?: string | null;
    walletId?: string | null;
    archivedAt?: Date | null;
  } = {};

  // { archived: true | false } archives or restores.
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

  if (body.note !== undefined) {
    data.note = body.note ? String(body.note).trim() || null : null;
  }

  if (body.categoryId !== undefined) {
    const categoryId = body.categoryId ? String(body.categoryId) : null;
    if (categoryId) {
      const owned = await prisma.category.findFirst({
        where: { id: categoryId, userId: user.sub, kind: existing.kind },
        select: { id: true },
      });
      if (!owned) return badRequest("That category does not exist");
    }
    data.categoryId = categoryId;
  }

  // An edit must not be able to strip the description off a catch-all
  // category, whether by clearing the note or by switching category.
  const finalCategoryId =
    data.categoryId !== undefined ? data.categoryId : existing.categoryId;
  const finalNote = data.note !== undefined ? data.note : existing.note;
  if (finalCategoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: finalCategoryId },
      select: { name: true, requiresDetail: true },
    });
    if (cat?.requiresDetail && !finalNote) {
      return badRequest(
        `Say what this was — "${cat.name}" on its own won't mean anything later`,
      );
    }
  }

  if (body.walletId !== undefined) {
    const walletId = body.walletId ? String(body.walletId) : null;
    if (walletId) {
      const owned = await prisma.wallet.findFirst({
        where: { id: walletId, userId: user.sub },
        select: { id: true },
      });
      if (!owned) return badRequest("That wallet does not exist");
    }
    data.walletId = walletId;
  }

  const entry = await prisma.entry.update({
    where: { id },
    data,
    include: ENTRY_INCLUDE,
  });

  await logActivity(user, {
    action:
      body.archived === false
        ? "entry.restore"
        : body.archived === true
          ? "entry.archive"
          : "entry.update",
    summary: `${
      body.archived === false
        ? "Restored"
        : body.archived === true
          ? "Archived"
          : "Edited"
    } an entry of ${formatPeso(entry.amountCents)}`,
    targetType: "Entry",
    targetId: entry.id,
  });

  return NextResponse.json({ entry });
}

/**
 * DELETE /api/entries/:id — archives by default, which is reversible.
 * ?purge=1 deletes it for good; only the Archived page sends that.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.entry.findFirst({
    where: { id, userId: user.sub },
    select: { id: true, amountCents: true },
  });
  if (!existing) return notFound("That entry no longer exists");

  if (new URL(req.url).searchParams.get("purge") === "1") {
    await prisma.entry.delete({ where: { id } });
    await logActivity(user, {
      action: "entry.delete",
      summary: `Deleted an entry of ${formatPeso(existing.amountCents)} for good`,
      targetType: "Entry",
      targetId: id,
    });
    return NextResponse.json({ ok: true, purged: true });
  }

  await prisma.entry.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  await logActivity(user, {
    action: "entry.archive",
    summary: `Archived an entry of ${formatPeso(existing.amountCents)}`,
    targetType: "Entry",
    targetId: id,
  });
  return NextResponse.json({ ok: true, archived: true });
}
