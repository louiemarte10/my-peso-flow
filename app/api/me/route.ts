import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getCurrentUser,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";

/** GET /api/me — profile plus a couple of counts for the settings page. */
export async function GET() {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      googleId: true,
      passwordHash: true,
      createdAt: true,
      _count: { select: { entries: true, categories: true } },
    },
  });
  if (!user) return notFound("Account not found");

  const { passwordHash, googleId, ...rest } = user;
  return NextResponse.json({
    user: {
      ...rest,
      hasPassword: Boolean(passwordHash),
      googleLinked: Boolean(googleId),
    },
  });
}

/** PATCH /api/me — change your display name and/or password. */
export async function PATCH(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) return notFound("Account not found");

  const data: { name?: string; passwordHash?: string } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("Enter your name");
    data.name = name;
  }

  if (body.newPassword !== undefined) {
    const newPassword = String(body.newPassword);
    if (newPassword.length < 8) {
      return badRequest("Use a password of at least 8 characters");
    }
    // Accounts that already have a password must confirm the current one.
    // A Google-only account is setting a password for the first time.
    if (user.passwordHash) {
      const current = String(body.currentPassword ?? "");
      if (!current || !(await verifyPassword(current, user.passwordHash))) {
        return badRequest("Your current password is wrong");
      }
    }
    data.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(data).length === 0) {
    return badRequest("Nothing to update");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { id: true, name: true, email: true, imageUrl: true },
  });

  // Keep the cookie's display name in sync with the sidebar.
  await setSessionCookie({
    sub: updated.id,
    name: updated.name,
    email: updated.email,
    image: updated.imageUrl,
  });

  return NextResponse.json({ user: updated });
}
