import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { badRequest } from "@/lib/api";
import { seedStarterData } from "@/lib/users";
import { EMAIL_TAKEN, signupEnabled } from "@/lib/config";
import { logActivityFor } from "@/lib/activity";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/signup — create an account.
 *
 * It deliberately does NOT sign you in: the form sends you to the sign-in page
 * so the first thing you do is prove the password you just chose actually
 * works. Getting that wrong on day one is much cheaper to fix than finding out
 * a week later.
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
  if (taken) return badRequest(EMAIL_TAKEN);

  const passwordHash = await hashPassword(password);

  try {
    // Account and starter data together, so a failure can't leave a half-built
    // account that cannot be signed into or recreated.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, role: "USER", passwordHash },
      });
      await seedStarterData(created.id, tx);
      return created;
    });

    await logActivityFor(user, {
      action: "account.signup",
      summary: "Created their own account",
      targetType: "Account",
      targetId: user.id,
    });

    return NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email } },
      { status: 201 },
    );
  } catch (err) {
    // Two people submitting the same address at the same moment both pass the
    // check above; the unique index is what actually decides it, so turn that
    // collision into the same friendly message rather than a 500.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "P2002"
    ) {
      return badRequest(EMAIL_TAKEN);
    }
    throw err;
  }
}
