import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentAdmin, setSessionCookie } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/users/:id/impersonate — admin only. "Log in as" that person.
 *
 * The session starts acting as them while remembering who really signed in
 * (`act`), so the banner can offer a way back and the session can be unwound
 * without the admin re-entering a password. An impersonated session is not
 * treated as admin — see getCurrentAdmin.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  if (!admin) return unauthorized();
  const { id } = await params;

  if (id === admin.id) {
    return badRequest("You are already signed in as yourself");
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      active: true,
    },
  });
  if (!target) return notFound("That account no longer exists");
  if (!target.active) {
    return badRequest("That account is disabled — enable it first");
  }

  await setSessionCookie({
    sub: target.id,
    name: target.name,
    email: target.email,
    image: target.imageUrl,
    act: admin.id,
  });

  return NextResponse.json({
    ok: true,
    actingAs: { id: target.id, name: target.name, email: target.email },
  });
}
