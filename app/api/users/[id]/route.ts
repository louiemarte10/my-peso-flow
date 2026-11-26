import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentAdmin, hashPassword } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USER_PICK = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  imageUrl: true,
  createdAt: true,
  googleId: true,
  _count: { select: { entries: true, wallets: true } },
};

function shape<T extends { googleId: string | null }>(u: T) {
  const { googleId, ...rest } = u;
  return { ...rest, googleLinked: Boolean(googleId) };
}

/** How many admins are left if this user stops being one. */
async function otherActiveAdmins(exceptId: string): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN", active: true, id: { not: exceptId } },
  });
}

/** PATCH /api/users/:id — admin only. Rename, re-role, enable/disable, reset password. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  if (!admin) return unauthorized();
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return notFound("That account no longer exists");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const data: {
    name?: string;
    email?: string;
    role?: "ADMIN" | "USER";
    active?: boolean;
    passwordHash?: string;
  } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("Enter a name");
    data.name = name;
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return badRequest("Enter a valid email address");
    const taken = await prisma.user.findFirst({
      where: { email, id: { not: id } },
      select: { id: true },
    });
    if (taken) return badRequest("That email is already in use");
    data.email = email;
  }

  if (body.role !== undefined) {
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";
    // Don't let the last admin demote themselves and lock everyone out.
    if (
      target.role === "ADMIN" &&
      role === "USER" &&
      (await otherActiveAdmins(id)) === 0
    ) {
      return badRequest(
        "This is the only admin left — promote someone else first",
      );
    }
    data.role = role;
  }

  if (body.active !== undefined) {
    const active = Boolean(body.active);
    if (!active && target.id === admin.id) {
      return badRequest("You can't disable your own account");
    }
    if (
      !active &&
      target.role === "ADMIN" &&
      (await otherActiveAdmins(id)) === 0
    ) {
      return badRequest(
        "This is the only admin left — promote someone else first",
      );
    }
    data.active = active;
  }

  if (body.newPassword !== undefined) {
    const newPassword = String(body.newPassword);
    if (newPassword.length < 8) {
      return badRequest("Use a password of at least 8 characters");
    }
    data.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(data).length === 0) return badRequest("Nothing to update");

  const user = await prisma.user.update({
    where: { id },
    data,
    select: USER_PICK,
  });

  return NextResponse.json({ user: shape(user) });
}

/**
 * DELETE /api/users/:id — admin only.
 * Deleting an account cascades to every entry, wallet, transfer and category
 * that belongs to it, so the UI makes you type the email to confirm.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await getCurrentAdmin();
  if (!admin) return unauthorized();
  const { id } = await params;

  if (id === admin.id) {
    return badRequest("You can't delete your own account");
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!target) return notFound("That account no longer exists");

  if (target.role === "ADMIN" && (await otherActiveAdmins(id)) === 0) {
    return badRequest("This is the only admin left — promote someone else first");
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
