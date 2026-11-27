import { NextRequest, NextResponse } from "next/server";
import { postDueEntries } from "@/lib/schedule-db";
import { POST_HOUR_LABEL } from "@/lib/schedule";

/** Never cached, and never pre-rendered at build time. */
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/post-due — the 4pm run, for everybody.
 *
 * Vercel calls this once a day at 08:00 UTC, which is 4pm in Manila (see
 * vercel.json). It posts every approved row whose date has arrived, so a
 * salary you approved a fortnight ago appears in the ledger on the day even if
 * nobody opened the app.
 *
 * It is only a backstop. Loading the Schedule Peso page runs the same catch-up
 * for the person looking at it, so the app stays correct whether or not this
 * is wired up.
 *
 * On authentication: when CRON_SECRET is set, Vercel sends it as a bearer
 * token and anything else is refused. Without it the endpoint is open, which
 * is tolerable precisely because it can do nothing a person has not already
 * approved and nothing before its own 4pm — the cutoff lives in
 * postDueEntries, not in the caller.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Not allowed" }, { status: 401 });
    }
  }

  const result = await postDueEntries();

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    postsAt: `${POST_HOUR_LABEL} Manila`,
    ...result,
  });
}
