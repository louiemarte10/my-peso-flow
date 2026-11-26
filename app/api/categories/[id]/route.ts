import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/categories/:id — rename, recolour or archive. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.category.findFirst({
    where: { id, userId: user.sub },
  });
  if (!existing) return notFound("That category no longer exists");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const data: { name?: string; color?: string | null; archived?: boolean } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("Enter a category name");
    const clash = await prisma.category.findFirst({
      where: {
        userId: user.sub,
        kind: existing.kind,
        name,
        id: { not: id },
      },
      select: { id: true },
    });
    if (clash) return badRequest(`"${name}" already exists`);
    data.name = name;
  }

  if (body.color !== undefined) {
    data.color = body.color ? String(body.color).trim() : null;
  }
  if (body.archived !== undefined) {
    data.archived = Boolean(body.archived);
  }

  const category = await prisma.category.update({
    where: { id },
    data,
    include: { _count: { select: { entries: true } } },
  });

  return NextResponse.json({ category });
}

/**
 * DELETE /api/categories/:id
 * A category still used by entries is archived instead of deleted, so your
 * history keeps its labels. Pass ?force=1 to delete it and leave those entries
 * uncategorised.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.category.findFirst({
    where: { id, userId: user.sub },
    include: { _count: { select: { entries: true } } },
  });
  if (!existing) return notFound("That category no longer exists");

  const force = new URL(req.url).searchParams.get("force") === "1";

  if (existing._count.entries > 0 && !force) {
    const category = await prisma.category.update({
      where: { id },
      data: { archived: true },
      include: { _count: { select: { entries: true } } },
    });
    return NextResponse.json({ archived: true, category });
  }

  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true, archived: false });
}
