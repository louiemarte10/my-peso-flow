import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/api";
import {
  generateProposals,
  loadSchedule,
  postDueEntries,
} from "@/lib/schedule-db";

/**
 * POST /api/schedule/generate — bring one person's schedule up to date.
 *
 * Two jobs, in this order:
 *
 *  1. work out which dates the active rules fall on over the next couple of
 *     months and put them in the review queue as proposals;
 *  2. post anything already approved whose 4pm has come and gone.
 *
 * Step 2 never encodes early — it answers to the clock, not to this call — so
 * running it on every page visit is safe. It is what makes the schedule honest
 * for someone who opens the app at 9pm: the nightly run is a backstop, this is
 * the catch-up.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const generated = await generateProposals(user.sub);
  const posted = await postDueEntries(user.sub);
  const state = await loadSchedule(user.sub);

  return NextResponse.json({ ...state, generated, posted });
}
