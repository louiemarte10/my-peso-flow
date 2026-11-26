import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { pesosToCents } from "@/lib/money";
import { isYmd, manilaDayStartUTC } from "@/lib/date";

type Ctx = { params: Promise<{ id: string }> };

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
    method?: string | null;
    categoryId?: string | null;
  } = {};

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
  if (body.method !== undefined) {
    data.method = body.method ? String(body.method).trim() || null : null;
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

  const entry = await prisma.entry.update({
    where: { id },
    data,
    include: { category: { select: { id: true, name: true, color: true } } },
  });

  return NextResponse.json({ entry });
}

/** DELETE /api/entries/:id */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.entry.findFirst({
    where: { id, userId: user.sub },
    select: { id: true },
  });
  if (!existing) return notFound("That entry no longer exists");

  await prisma.entry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
