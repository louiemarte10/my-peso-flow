import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentAdmin, hashPassword } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import { seedStarterData } from "@/lib/users";
import { logActivityFor } from "@/lib/activity";

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

type RawUser = {
  googleId: string | null;
  [k: string]: unknown;
};

/** Never leak googleId; expose it as a boolean instead. */
function shape<T extends RawUser>(u: T) {
  const { googleId, ...rest } = u;
  return { ...rest, googleLinked: Boolean(googleId) };
}

/** GET /api/users — admin only. Everyone who can sign in. */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return unauthorized();

  const users = await prisma.user.findMany({
    select: USER_PICK,
    orderBy: [{ createdAt: "asc" }],
  });

  return NextResponse.json({
    users: users.map(shape),
    me: admin.id,
  });
}

/**
 * POST /api/users — admin only. Creates another person's account.
 *
 * The new account gets its own starter categories and wallets, and sees only
 * its own data: every query in the app is scoped by userId.
 */
export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("Enter a name");

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) return badRequest("Enter a valid email address");

  const password = String(body.password ?? "");
  if (password.length < 8) {
    return badRequest("Use a password of at least 8 characters");
  }

  const role = body.role === "ADMIN" ? "ADMIN" : "USER";

  const taken = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (taken) return badRequest("That email already has an account");

  const passwordHash = await hashPassword(password);

  // One transaction: if seeding the starter data fails, the account is rolled
  // back too rather than left half-built and unusable.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, email, role, passwordHash },
      select: USER_PICK,
    });
    await seedStarterData(created.id, tx);
    return created;
  });

  await logActivityFor(admin, {
    action: "admin.user.create",
    summary: `Created an account for ${name} (${email}) as ${role}`,
    targetType: "User",
    targetId: user.id,
  });

  return NextResponse.json({ user: shape(user) }, { status: 201 });
}
