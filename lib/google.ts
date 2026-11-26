// Minimal "Sign in with Google" (OAuth 2.0 authorization-code flow).
// No extra dependency: two route handlers + these helpers are the whole thing.
import "server-only";

/** Short-lived cookie holding the CSRF state nonce during the OAuth round-trip. */
export const OAUTH_STATE_COOKIE = "pesoflow_oauth_state";

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  emailVerified: boolean;
};

/** Google sign-in is only offered when both credentials are configured. */
export function googleEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

/** The redirect URI registered in the Google Cloud console. */
export function redirectUri(): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return `${base}/api/auth/google/callback`;
}

/** Build the Google consent-screen URL. */
export function authUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Swap the one-time code for tokens, then read the profile. */
export async function exchangeCode(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error("Google rejected the sign-in code");
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("Google did not return a token");

  const profileRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  );
  if (!profileRes.ok) throw new Error("Could not read your Google profile");

  const p = (await profileRes.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };
  if (!p.email) throw new Error("Your Google account has no email address");

  return {
    sub: p.sub,
    email: p.email.toLowerCase(),
    name: p.name ?? p.email.split("@")[0],
    picture: p.picture ?? null,
    emailVerified: p.email_verified !== false,
  };
}

/**
 * Optional allow-list. With ALLOWED_EMAILS set, only those addresses may sign
 * in with Google — which is what you want for a personal ledger. Left blank,
 * any Google account can create an account.
 */
export function emailAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS?.trim();
  if (!raw) return true;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
