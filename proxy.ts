import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Protect all page routes. Unauthenticated visitors are sent to /login.
// API routes verify the session themselves.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except: the sign-in and sign-up pages, API routes, Next
  // internals and static files.
  matcher: [
    "/((?!api|login|signup|_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
