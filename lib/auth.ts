// Node-runtime auth helpers (password hashing + reading the current session).
import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
  type SessionPayload,
} from "./session";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Read and verify the current session from the request cookies. */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** Write the session cookie (call from a route handler after login). */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: "ADMIN" | "USER";
  active: boolean;
};

/**
 * The signed-in user as the database has them right now.
 *
 * The role deliberately is NOT carried in the session cookie: reading it fresh
 * means promoting or disabling someone takes effect on their very next request
 * instead of whenever their cookie happens to expire, and nobody gets locked
 * out of admin by holding an older cookie.
 */
export async function getCurrentUserRecord(): Promise<CurrentUser | null> {
  const session = await getCurrentUser();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      role: true,
      active: true,
    },
  });

  // Deleted or disabled accounts stop counting as signed in.
  if (!user || !user.active) return null;
  return user;
}

/** The signed-in user, but only if they are an admin. */
export async function getCurrentAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUserRecord();
  return user?.role === "ADMIN" ? user : null;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}
