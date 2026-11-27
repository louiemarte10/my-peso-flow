// Edge-safe session helpers (jose only — no Node-specific APIs).
// Used by both the proxy (edge) and server route handlers.
import { SignJWT, jwtVerify } from "jose";
import { SESSION_IDLE_MS, SESSION_IDLE_SECONDS } from "./session-public";

/** The signed, httpOnly session itself. The browser never reads this. */
export const SESSION_COOKIE = "pesoflow_session";

export { SESSION_DEADLINE_COOKIE } from "./session-public";

const ALG = "HS256";

/** See SESSION_IDLE_SECONDS: four hours from the last thing they did. */
const IDLE_TIMEOUT_SECONDS = SESSION_IDLE_SECONDS;

export type SessionPayload = {
  sub: string; // user id the session is acting AS
  name: string;
  email: string;
  image: string | null;
  /**
   * When an admin is using "Log in as", this is the real admin's id. The
   * session behaves as `sub` in every way, but the banner and the way back
   * come from here. Undefined for an ordinary session.
   */
  act?: string;
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add it to your .env (see .env.example).",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    name: payload.name,
    email: payload.email,
    image: payload.image,
    ...(payload.act ? { act: payload.act } : {}),
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${IDLE_TIMEOUT_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    // jwtVerify enforces `exp` itself, so an idle session simply stops
    // verifying once its four hours are up.
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      name: (payload.name as string) ?? "",
      email: (payload.email as string) ?? "",
      image: (payload.image as string | null) ?? null,
      act: (payload.act as string | undefined) ?? undefined,
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = IDLE_TIMEOUT_SECONDS;

/**
 * Cookie attributes shared by everything that writes the session, so the
 * proxy and the route handlers cannot drift apart. `secure` is off in
 * development because localhost is plain http.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

/** Same attributes, but readable by the page. */
export function deadlineCookieOptions() {
  return { ...sessionCookieOptions(), httpOnly: false };
}

/** The deadline value to store: now + the idle window. */
export function deadlineValue(): string {
  return String(Date.now() + SESSION_IDLE_MS);
}
