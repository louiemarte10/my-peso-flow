import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getCurrentUser,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { logActivity } from "@/lib/activity";

/** Deliberately permissive — real validation is "can you receive mail there". */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      role: true,
      createdAt: true,
      _count: { select: { entries: true, categories: true, wallets: true } },
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

/**
 * PATCH /api/me — change your display name, sign-in email and/or password.
 *
 * Email and password changes are the two that matter if someone else gets at
 * your session, so both require the current password when the account has one.
 * A Google-only account has no password to confirm: it is setting one for the
 * first time, and its Google link survives an email change because the link is
 * by Google account id, not by address.
 */
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

  const wantsEmail =
    body.email !== undefined &&
    String(body.email).trim().toLowerCase() !== user.email;
  const wantsPassword = body.newPassword !== undefined;

  // One confirmation covers whichever sensitive changes are in this request.
  if ((wantsEmail || wantsPassword) && user.passwordHash) {
    const current = String(body.currentPassword ?? "");
    if (!current || !(await verifyPassword(current, user.passwordHash))) {
      return badRequest("Your current password is wrong");
    }
  }

  const data: { name?: string; email?: string; passwordHash?: string } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("Enter your name");
    data.name = name;
  }

  if (wantsEmail) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return badRequest("Enter a valid email address");
    }
    const taken = await prisma.user.findFirst({
      where: { email, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) return badRequest("That email is already in use");
    data.email = email;
  }

  if (wantsPassword) {
    const newPassword = String(body.newPassword);
    if (newPassword.length < 8) {
      return badRequest("Use a password of at least 8 characters");
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

  // Re-issue the cookie so the sidebar and future requests carry the new
  // name/email straight away.
  await setSessionCookie({
    sub: updated.id,
    name: updated.name,
    email: updated.email,
    image: updated.imageUrl,
  });

  const what = [
    data.name !== undefined && "display name",
    data.email !== undefined && "sign-in email",
    data.passwordHash !== undefined && "password",
  ].filter(Boolean) as string[];

  await logActivity(session, {
    action: "account.update",
    summary: `Changed their ${what.join(" and ")}`,
    targetType: "Account",
    targetId: updated.id,
  });

  return NextResponse.json({ user: updated });
}
