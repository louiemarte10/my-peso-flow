import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/api";
import { loadSchedule } from "@/lib/schedule-db";

/**
 * GET /api/schedule — the whole Recurring workflow for the signed-in person:
 * their rules, what is waiting for review, and what was recently decided.
 *
 * Scoped to the session's own id, never to anything from the query string, so
 * one account can never read another's schedule.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  return NextResponse.json(await loadSchedule(user.sub));
}
