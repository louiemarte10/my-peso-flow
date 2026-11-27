import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_DEADLINE_COOKIE,
  deadlineCookieOptions,
  deadlineValue,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/session";

/**
 * Guards every page, and keeps the session cookie fresh on every request.
 *
 * The session is an IDLE timeout: the cookie is re-issued here on each page
 * view and each API call, so the four hours always run from the last thing
 * the person actually did. Stop using the app — or close the browser — and
 * the cookie expires on its own, and the next request lands on /login.
 */
/**
 * Routes that issue a session of their own — signing in, signing out, "Log in
 * as", and changing your email or password. The proxy must not write a cookie
 * over the one they are setting, or the new session would be lost: these pass
 * through untouched and write their own fresh cookie, which slides the window
 * just the same.
 */
function managesItsOwnSession(pathname: string): boolean {
  return (
    pathname === "/api/me" ||
    /^\/api\/users\/[^/]+\/impersonate$/.test(pathname)
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    // API routes answer for themselves (401 JSON), so a fetch gets a sensible
    // error instead of the HTML of the sign-in page.
    if (isApi) return NextResponse.next();

    const loginUrl = new URL("/login", req.url);
    // A cookie that was sent but no longer verifies means the session ran out
    // rather than never existing — worth saying so on the sign-in page.
    if (token) loginUrl.searchParams.set("timeout", "1");
    loginUrl.searchParams.set("next", pathname);

    const redirect = NextResponse.redirect(loginUrl);
    // Clear the dead cookies so the browser stops sending them.
    redirect.cookies.delete(SESSION_COOKIE);
    redirect.cookies.delete(SESSION_DEADLINE_COOKIE);
    return redirect;
  }

  if (managesItsOwnSession(pathname)) return NextResponse.next();

  // Slide the window forward. Re-signing is a cheap HMAC, and doing it on
  // every request is what makes the timeout track real activity.
  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions());
  res.cookies.set(SESSION_DEADLINE_COOKIE, deadlineValue(), deadlineCookieOptions());
  return res;
}

export const config = {
  // Everything except: the auth endpoints that set or clear the cookie
  // themselves, the sign-in and sign-up pages, Next internals and static
  // files. Other /api routes ARE included, so encoding an entry without
  // changing page still counts as activity.
  matcher: [
    "/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
