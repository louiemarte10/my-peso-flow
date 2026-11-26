import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, setSessionCookie } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";

/**
 * POST /api/auth/stop-impersonating — hand the session back to the admin who
 * started "Log in as". Safe to call from the impersonated session: the only
 * account it can return to is the one recorded in `act`, and that account is
 * re-checked for being an active admin before the swap.
 */
export async function POST() {
  const session = await getCurrentUser();
  if (!session) return unauthorized();
  if (!session.act) return badRequest("You are not signed in as someone else");

  const admin = await prisma.user.findUnique({
    where: { id: session.act },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      role: true,
      active: true,
    },
  });

  if (!admin || !admin.active || admin.role !== "ADMIN") {
    return badRequest("That admin account is no longer available");
  }

  await setSessionCookie({
    sub: admin.id,
    name: admin.name,
    email: admin.email,
    image: admin.imageUrl,
  });

  return NextResponse.json({ ok: true, user: { id: admin.id, name: admin.name } });
}
