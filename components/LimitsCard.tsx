"use client";

import { useState } from "react";
import Link from "next/link";
import BudgetBar from "@/components/BudgetBar";
import { formatPeso } from "@/lib/money";
import { budgetState } from "@/lib/budget-state";
import { limitReminder, limitsSummary } from "@/lib/reminder";

export type CategoryLimit = {
  id: string;
  name: string;
  color: string | null;
  limitCents: number;
  spentCents: number;
};

const SUMMARY_TONE: Record<string, string> = {
  over: "text-outflow",
  near: "text-amber-700",
  ok: "text-income",
  none: "text-slate-400",
};

const NOTE_TONE: Record<string, string> = {
  over: "text-outflow",
  near: "text-amber-700",
  ok: "text-slate-500",
  none: "text-slate-400",
};

/** How many to show before "See more", and how many each click adds. */
const PAGE = 5;

/**
 * Every category with a monthly limit: where it stands, and the note that says
 * what that means with the month's remaining days taken into account. Five at
 * a time, then "See more", so a long list does not bury the rest of the page.
 *
 * Shared by the dashboard and the profile so the two can never tell you
 * different things about the same month.
 */
export default function LimitsCard({
  limits,
  todayYmd,
  monthEarningsCents,
  title = "This month's limits",
  className = "",
}: {
  limits: CategoryLimit[];
  /** Manila "YYYY-MM-DD" — the note's pace maths needs the date. */
  todayYmd: string;
  /** This month's earnings, to weigh the all-limits total against. */
  monthEarningsCents?: number;
  title?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(PAGE);

  // Worst first: an over-budget category is the one worth looking at.
  const sorted = [...limits].sort(
    (a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents,
  );
  const summary = limitsSummary(limits);
  const visible = sorted.slice(0, shown);
  const hidden = sorted.length - visible.length;

  // What every limit adds up to: the most this month can cost you if you spend
  // each one right to the line.
  const totalLimitCents = limits.reduce((sum, l) => sum + l.limitCents, 0);
  const totalSpentCents = limits.reduce((sum, l) => sum + l.spentCents, 0);
  const stillAllowedCents = Math.max(0, totalLimitCents - totalSpentCents);
  const shareOfEarnings =
    monthEarningsCents && monthEarningsCents > 0
      ? Math.round((totalLimitCents / monthEarningsCents) * 100)
      : null;

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
        {limits.length > 0 && (
          <span
            className={`text-xs font-semibold ${SUMMARY_TONE[summary.state]}`}
          >
            {summary.text}
          </span>
        )}
      </div>

      {limits.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No limits set yet. Put a monthly cap on a category on the{" "}
          <Link href="/categories" className="text-brand hover:underline">
            Categories
          </Link>{" "}
          page and it will show up here, with a note telling you how much a day
          you have left.
        </p>
      ) : (
        <>
        <ul className="mt-3 space-y-4">
          {visible.map((l) => {
            const note = limitReminder({
              spentCents: l.spentCents,
              limitCents: l.limitCents,
              todayYmd,
            });
            const state = budgetState(l.spentCents, l.limitCents);
            return (
              <li key={l.id}>
                <div className="flex items-center gap-1.5 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: l.color ?? "#64748B" }}
                  />
                  <Link
                    href="/categories"
                    className="truncate font-medium text-slate-700 hover:text-brand-dark hover:underline"
                  >
                    {l.name}
                  </Link>
                </div>
                <BudgetBar
                  spentCents={l.spentCents}
                  limitCents={l.limitCents}
                  className="mt-1"
                />
                <p className={`mt-1 text-xs ${NOTE_TONE[state]}`}>{note.text}</p>
              </li>
            );
          })}
        </ul>

        {(hidden > 0 || shown > PAGE) && (
          <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3">
            {hidden > 0 && (
              <button
                onClick={() => setShown((n) => n + PAGE)}
                className="text-xs font-semibold text-brand transition hover:underline"
              >
                See more ({hidden} more)
              </button>
            )}
            {shown > PAGE && (
              <button
                onClick={() => setShown(PAGE)}
                className="text-xs font-semibold text-slate-500 transition hover:underline"
              >
                Show fewer
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">
              Showing {visible.length} of {sorted.length}
            </span>
          </div>
        )}

        {/* What it all comes to if every limit is spent to the line. */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-ice p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              All {limits.length} limits together
            </span>
            <span className="text-lg font-bold tabular-nums text-slate-800">
              {formatPeso(totalLimitCents)}
            </span>
          </div>

          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-500">Spent against them so far</span>
              <span className="font-semibold tabular-nums text-outflow">
                {formatPeso(totalSpentCents)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-slate-500">Still allowed this month</span>
              <span className="font-semibold tabular-nums text-slate-700">
                {formatPeso(stillAllowedCents)}
              </span>
            </div>
          </div>

          <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
            If you spend every limit right to the line,{" "}
            <strong className="text-slate-700">
              {formatPeso(totalLimitCents)}
            </strong>{" "}
            leaves you this month
            {shareOfEarnings !== null && (
              <>
                {" "}— that is{" "}
                <strong
                  className={
                    shareOfEarnings > 100
                      ? "text-outflow"
                      : shareOfEarnings >= 80
                        ? "text-amber-700"
                        : "text-slate-700"
                  }
                >
                  {shareOfEarnings}%
                </strong>{" "}
                of the {formatPeso(monthEarningsCents!)} you have earned so far
                {shareOfEarnings > 100 && ", which is more than you have come in with"}
              </>
            )}
            .
          </p>
        </div>
        </>
      )}
    </div>
  );
}
