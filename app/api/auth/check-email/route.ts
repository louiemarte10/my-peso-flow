import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signupEnabled } from "@/lib/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/auth/check-email?email=... — is this address free to sign up with?
 *
 * Only for the live hint on the sign-up form; it is NOT the thing that decides.
 * The unique index on User.email is, and the signup route turns that collision
 * into the same message. Two people can pass this check at the same instant.
 *
 * It is off when sign-ups are closed, because then it would answer "does this
 * person have an account here" for anyone who asks, without even the excuse of
 * a form that needs it.
 */
export async function GET(req: NextRequest) {
  if (!signupEnabled()) {
    return NextResponse.json({ error: "Sign-ups are closed" }, { status: 403 });
  }

  const email = (req.nextUrl.searchParams.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ email, valid: false, available: null });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return NextResponse.json({
    email,
    valid: true,
    available: existing === null,
  });
}
