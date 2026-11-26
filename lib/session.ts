// Edge-safe session helpers (jose only — no Node-specific APIs).
// Used by both the proxy (edge) and server route handlers.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "pesoflow_session";
const ALG = "HS256";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

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
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
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

export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
