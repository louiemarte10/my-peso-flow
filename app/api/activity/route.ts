import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth";
import { unauthorized } from "@/lib/api";

/**
 * GET /api/activity — admin only.
 *
 * ?userId=   only that person
 * ?action=   prefix match, e.g. "category" or "admin"
 * ?q=        text search across the summary and who did it
 * ?cursor=   id of the last row from the previous page
 */
export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const action = searchParams.get("action");
  const q = (searchParams.get("q") ?? "").trim();
  const cursor = searchParams.get("cursor");
  const take = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);

  const where = {
    ...(userId ? { userId } : {}),
    ...(action ? { action: { startsWith: action } } : {}),
    ...(q
      ? {
          OR: [
            { summary: { contains: q, mode: "insensitive" as const } },
            { actorName: { contains: q, mode: "insensitive" as const } },
            { actorEmail: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Fetch one extra to tell whether another page exists.
  const rows = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const logs = hasMore ? rows.slice(0, take) : rows;

  // The people who appear in the log, for the filter dropdown. Accounts that
  // have since been deleted keep their rows but have no user to filter by.
  const [people, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    people,
    total,
    nextCursor: hasMore ? logs[logs.length - 1].id : null,
  });
}
