import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import {
  emailAllowed,
  exchangeCode,
  googleEnabled,
  OAUTH_STATE_COOKIE,
} from "@/lib/google";
import { seedStarterData } from "@/lib/users";

function fail(req: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
}

/** Step 2 — Google sends the browser back here with a one-time code. */
export async function GET(req: NextRequest) {
  if (!googleEnabled()) return fail(req, "google_not_configured");

  const { searchParams } = req.nextUrl;
  if (searchParams.get("error")) return fail(req, "google_cancelled");

  const code = searchParams.get("code");
  const state = searchParams.get("state") ?? "";
  if (!code) return fail(req, "google_failed");

  // Verify the CSRF state, then clear it.
  const store = await cookies();
  const expected = store.get(OAUTH_STATE_COOKIE)?.value;
  const [nonce, rawNext] = state.split("|");
  store.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  if (!expected || !nonce || nonce !== expected) return fail(req, "bad_state");

  let profile;
  try {
    profile = await exchangeCode(code);
  } catch {
    return fail(req, "google_failed");
  }

  if (!profile.emailVerified) return fail(req, "email_unverified");
  if (!emailAllowed(profile.email)) return fail(req, "not_allowed");

  // Match on googleId first, then on email so an existing password account
  // simply gains Google sign-in instead of becoming a duplicate.
  const existing =
    (await prisma.user.findUnique({ where: { googleId: profile.sub } })) ??
    (await prisma.user.findUnique({ where: { email: profile.email } }));

  let user;
  let isNew = false;

  if (existing) {
    if (!existing.active) return fail(req, "account_disabled");
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        googleId: profile.sub,
        imageUrl: profile.picture ?? existing.imageUrl,
        name: existing.name || profile.name,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        googleId: profile.sub,
        imageUrl: profile.picture,
      },
    });
    isNew = true;
  }

  if (isNew) await seedStarterData(user.id);

  await setSessionCookie({
    sub: user.id,
    name: user.name,
    email: user.email,
    image: user.imageUrl,
  });

  const next = rawNext?.startsWith("/") ? rawNext : "/dashboard";
  return NextResponse.redirect(new URL(next, req.url));
}
