import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authUrl, googleEnabled, OAUTH_STATE_COOKIE } from "@/lib/google";

/** Step 1 — bounce the browser to Google's consent screen. */
export async function GET(req: NextRequest) {
  if (!googleEnabled()) {
    return NextResponse.redirect(
      new URL("/login?error=google_not_configured", req.url),
    );
  }

  // CSRF guard: a random value echoed back by Google and checked on return.
  // The post-login destination rides along after a "|".
  const nonce = crypto.randomUUID();
  const next = req.nextUrl.searchParams.get("next") ?? "/dashboard";
  const state = `${nonce}|${next.startsWith("/") ? next : "/dashboard"}`;

  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return NextResponse.redirect(authUrl(state));
}
