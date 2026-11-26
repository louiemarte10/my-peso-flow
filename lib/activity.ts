import "server-only";
import { prisma } from "./db";
import type { SessionPayload } from "./session";

/**
 * Append-only record of who did what, read by the admin Activity page.
 *
 * Two rules keep it honest:
 *
 * 1. Logging must never break the thing it is logging. A failed write is
 *    swallowed — losing a log line is annoying, losing someone's salary entry
 *    because the log table hiccuped is not.
 * 2. It is awaited rather than fired and forgotten. On serverless the function
 *    can be frozen the moment the response is sent, and a floating promise
 *    would silently never land.
 */
export async function logActivity(
  session: Pick<SessionPayload, "sub" | "name" | "email" | "act">,
  entry: {
    action: string;
    summary: string;
    targetType?: string;
    targetId?: string;
  },
): Promise<void> {
  try {
    let impersonatedByEmail: string | null = null;
    if (session.act) {
      const actor = await prisma.user.findUnique({
        where: { id: session.act },
        select: { email: true },
      });
      impersonatedByEmail = actor?.email ?? null;
    }

    await prisma.activityLog.create({
      data: {
        userId: session.sub,
        actorName: session.name || "(unknown)",
        actorEmail: session.email || "(unknown)",
        action: entry.action,
        summary: entry.summary,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        impersonatedByEmail,
      },
    });
  } catch {
    // Best effort by design — see the note above.
  }
}

/**
 * Log for someone who has no session yet (signing up, signing in), where the
 * details come from the account row rather than a cookie.
 */
export async function logActivityFor(
  user: { id: string; name: string; email: string },
  entry: { action: string; summary: string; targetType?: string; targetId?: string },
): Promise<void> {
  return logActivity(
    { sub: user.id, name: user.name, email: user.email, act: undefined },
    entry,
  );
}
