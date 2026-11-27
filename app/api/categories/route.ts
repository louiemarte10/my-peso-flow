import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import type { EntryKind } from "@/generated/prisma/client";
import { shapeArchivable } from "@/lib/archive";
import { USER_CATEGORY_LIMIT } from "@/lib/config";
import { getCurrentUserRecord } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { monthSpendByCategory, parseMonthlyLimit } from "@/lib/budget";

function parseKind(raw: string | null): EntryKind | null {
  return raw === "EARNING" || raw === "EXPENSE" ? raw : null;
}


/** GET /api/categories?kind=EXPENSE&includeArchived=1 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const kind = parseKind(searchParams.get("kind"));
  const includeArchived = searchParams.get("includeArchived") === "1";

  const [categories, spend] = await Promise.all([
    prisma.category.findMany({
      where: {
        userId: user.sub,
        ...(kind ? { kind } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: { _count: { select: { entries: true } } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    monthSpendByCategory(user.sub),
  ]);

  return NextResponse.json({
    categories: categories.map((c) => ({
      ...shapeArchivable(c),
      spentThisMonthCents: spend.get(c.id) ?? 0,
    })),
  });
}

/** POST /api/categories */
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
  if (!kind) return badRequest("Choose Earnings or Expenses");

  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("Enter a category name");

  const color = body.color ? String(body.color).trim() : null;
  const requiresDetail = Boolean(body.requiresDetail);

  const duplicate = await prisma.category.findFirst({
    where: { userId: user.sub, kind, name },
    select: { id: true },
  });
  if (duplicate) return badRequest(`"${name}" already exists`);

  // Plain accounts are capped. Archived categories don't count, so the way
  // past the limit is to archive one you no longer use.
  const me = await getCurrentUserRecord();
  if (me && me.role !== "ADMIN") {
    const live = await prisma.category.count({
      where: { userId: user.sub, archivedAt: null },
    });
    if (live >= USER_CATEGORY_LIMIT) {
      return badRequest(
        `You already have ${live} of ${USER_CATEGORY_LIMIT} categories. Archive one you no longer use, then add this.`,
      );
    }
  }

  const limit = parseMonthlyLimit(body.monthlyLimit);
  if (!limit.ok) return badRequest(limit.error);

  const category = await prisma.category.create({
    data: {
      userId: user.sub,
      kind,
      name,
      color,
      requiresDetail,
      // An earning has nothing to cap, so a limit is only kept on expenses.
      monthlyLimitCents: kind === "EXPENSE" ? limit.cents : null,
    },
    include: { _count: { select: { entries: true } } },
  });

  await logActivity(user, {
    action: "category.create",
    summary: `Added the ${kind === "EARNING" ? "earning source" : "expense category"} "${name}"`,
    targetType: "Category",
    targetId: category.id,
  });

  return NextResponse.json(
    { category: { ...shapeArchivable(category), spentThisMonthCents: 0 } },
    { status: 201 },
  );
}
