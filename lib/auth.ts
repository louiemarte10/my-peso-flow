// Node-runtime auth helpers (password hashing + reading the current session).
import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./db";
import {
  SESSION_COOKIE,
  SESSION_DEADLINE_COOKIE,
  deadlineCookieOptions,
  deadlineValue,
  sessionCookieOptions,
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

/**
 * Write the session cookie (call from a route handler after login).
 *
 * The readable deadline cookie goes out alongside it, so the page knows when
 * the four idle hours are up. The proxy re-issues both on every request.
 */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
  store.set(SESSION_DEADLINE_COOKIE, deadlineValue(), deadlineCookieOptions());
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: "ADMIN" | "USER";
  active: boolean;
  /** Set only while an admin is using "Log in as". */
  impersonatedBy?: { id: string; name: string; email: string };
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

  // "Log in as": carry who the real admin is, and refuse the whole session if
  // that admin has since been demoted, disabled or deleted.
  if (session.act) {
    const actor = await prisma.user.findUnique({
      where: { id: session.act },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!actor || !actor.active || actor.role !== "ADMIN") return null;
    return {
      ...user,
      impersonatedBy: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
      },
    };
  }

  return user;
}

/**
 * The signed-in user, but only if they are an admin acting as themselves.
 *
 * An impersonated session is deliberately NOT admin, even when the person
 * being impersonated is one: while you are looking at someone else's books you
 * should not also be able to manage accounts.
 */
export async function getCurrentAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUserRecord();
  if (!user || user.impersonatedBy) return null;
  return user.role === "ADMIN" ? user : null;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  store.set(SESSION_DEADLINE_COOKIE, "", { path: "/", maxAge: 0 });
}
