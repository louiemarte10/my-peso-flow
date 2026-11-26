import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { badRequest } from "@/lib/api";
import { seedStarterData } from "@/lib/users";
import { signupEnabled } from "@/lib/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/signup — create your own account and land straight in.
 *
 * New accounts are always USER. Only an existing admin can hand out admin,
 * from the People page, so opening sign-up never gives anyone else control.
 */
export async function POST(req: NextRequest) {
  if (!signupEnabled()) {
    return badRequest(
      "Sign-ups are closed. Ask the admin to create an account for you.",
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("Enter your name");

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) return badRequest("Enter a valid email address");

  const password = String(body.password ?? "");
  if (password.length < 8) {
    return badRequest("Use a password of at least 8 characters");
  }

  const taken = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (taken) {
    return badRequest("That email already has an account — sign in instead");
  }

  const passwordHash = await hashPassword(password);

  // Account and starter data together, so a failure can't leave a half-built
  // account that cannot be signed into or recreated.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, email, role: "USER", passwordHash },
    });
    await seedStarterData(created.id, tx);
    return created;
  });

  await setSessionCookie({
    sub: user.id,
    name: user.name,
    email: user.email,
    image: user.imageUrl,
  });

  return NextResponse.json(
    { user: { id: user.id, name: user.name, email: user.email } },
    { status: 201 },
  );
}
