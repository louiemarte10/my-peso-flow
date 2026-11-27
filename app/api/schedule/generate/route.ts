import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/api";
import { generateProposals, loadSchedule } from "@/lib/schedule-db";

/**
 * POST /api/schedule/generate — work out which dates the active rules fall on
 * over the next couple of months and put them in the review queue.
 *
 * This writes proposals only. Nothing lands in earnings or expenses here, so
 * the page can call it on every visit without ever surprising anyone.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const result = await generateProposals(user.sub);
  const state = await loadSchedule(user.sub);

  return NextResponse.json({ ...state, generated: result });
}
