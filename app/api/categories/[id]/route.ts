import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { shapeArchivable } from "@/lib/archive";
import { logActivity } from "@/lib/activity";
import {
  monthSpendByCategory,
  parseMonthlyLimit,
} from "@/lib/budget";
import { formatPeso } from "@/lib/money";

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

  const data: {
    name?: string;
    color?: string | null;
    archivedAt?: Date | null;
    requiresDetail?: boolean;
    monthlyLimitCents?: number | null;
  } = {};

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
    data.archivedAt = body.archived ? new Date() : null;
  }
  if (body.requiresDetail !== undefined) {
    data.requiresDetail = Boolean(body.requiresDetail);
  }
  if (body.monthlyLimit !== undefined) {
    if (existing.kind !== "EXPENSE") {
      return badRequest("Only expense categories can have a monthly limit");
    }
    const limit = parseMonthlyLimit(body.monthlyLimit);
    if (!limit.ok) return badRequest(limit.error);
    data.monthlyLimitCents = limit.cents;
  }

  const category = await prisma.category.update({
    where: { id },
    data,
    include: { _count: { select: { entries: true } } },
  });

  // A limit change is a decision, not a tidy-up, so it gets its own line
  // rather than hiding behind "Edited the category".
  if (data.monthlyLimitCents !== undefined) {
    await logActivity(user, {
      action: "category.limit",
      summary:
        data.monthlyLimitCents === null
          ? `Removed the monthly limit on "${category.name}"`
          : `Set a ${formatPeso(data.monthlyLimitCents)} monthly limit on "${category.name}"`,
      targetType: "Category",
      targetId: category.id,
    });
  }

  // Everything else gets the ordinary line - but a limit-only change must not
  // also log "Edited the category", or every budget tweak costs two rows.
  const otherChange = Object.keys(data).some((k) => k !== "monthlyLimitCents");
  if (otherChange) {
    await logActivity(user, {
      action:
        data.archivedAt === null && body.archived !== undefined
          ? "category.restore"
          : "category.update",
      summary:
        data.archivedAt === null && body.archived !== undefined
          ? `Restored the category "${category.name}"`
          : `Edited the category "${category.name}"`,
      targetType: "Category",
      targetId: category.id,
    });
  }

  const spend = await monthSpendByCategory(user.sub);
  return NextResponse.json({
    category: {
      ...shapeArchivable(category),
      spentThisMonthCents: spend.get(category.id) ?? 0,
    },
  });
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

  const url = new URL(req.url);
  const force =
    url.searchParams.get("force") === "1" ||
    url.searchParams.get("purge") === "1";

  // Archive by default so nothing is lost; the Archived page sends purge=1
  // for a permanent delete, and an unused category can go straight away.
  if (!force) {
    const category = await prisma.category.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: { _count: { select: { entries: true } } },
    });
    await logActivity(user, {
      action: "category.archive",
      summary: `Archived the category "${existing.name}"`,
      targetType: "Category",
      targetId: id,
    });
    return NextResponse.json({ archived: true, category: shapeArchivable(category) });
  }

  await prisma.category.delete({ where: { id } });
  await logActivity(user, {
    action: "category.delete",
    summary: `Deleted the category "${existing.name}" for good`,
    targetType: "Category",
    targetId: id,
  });
  return NextResponse.json({ ok: true, archived: false });
}
