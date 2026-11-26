import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import type { EntryKind } from "@/generated/prisma/client";

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

  const categories = await prisma.category.findMany({
    where: {
      userId: user.sub,
      ...(kind ? { kind } : {}),
      ...(includeArchived ? {} : { archived: false }),
    },
    include: { _count: { select: { entries: true } } },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ categories });
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

  const category = await prisma.category.create({
    data: { userId: user.sub, kind, name, color, requiresDetail },
    include: { _count: { select: { entries: true } } },
  });

  return NextResponse.json({ category }, { status: 201 });
}
