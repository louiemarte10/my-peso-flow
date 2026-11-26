import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/api";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { logActivityFor } from "@/lib/activity";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return badRequest("Enter your email and password");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Same message either way so we don't reveal which emails exist.
  const invalid = () =>
    NextResponse.json({ error: "Wrong email or password" }, { status: 401 });

  if (!user || !user.active || !user.passwordHash) return invalid();
  if (!(await verifyPassword(password, user.passwordHash))) return invalid();

  await setSessionCookie({
    sub: user.id,
    name: user.name,
    email: user.email,
    image: user.imageUrl,
  });

  await logActivityFor(user, {
    action: "auth.login",
    summary: "Signed in",
    targetType: "Account",
    targetId: user.id,
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
}
