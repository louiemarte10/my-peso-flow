"use client";

import Link from "next/link";
import BudgetBar from "@/components/BudgetBar";
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

/**
 * Every category with a monthly limit: where it stands, and the note that says
 * what that means with the month's remaining days taken into account.
 *
 * Shared by the dashboard and the profile so the two can never tell you
 * different things about the same month.
 */
export default function LimitsCard({
  limits,
  todayYmd,
  title = "This month's limits",
  className = "",
}: {
  limits: CategoryLimit[];
  /** Manila "YYYY-MM-DD" — the note's pace maths needs the date. */
  todayYmd: string;
  title?: string;
  className?: string;
}) {
  // Worst first: an over-budget category is the one worth looking at.
  const sorted = [...limits].sort(
    (a, b) => b.spentCents / b.limitCents - a.spentCents / a.limitCents,
  );
  const summary = limitsSummary(limits);

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
        <ul className="mt-3 space-y-4">
          {sorted.map((l) => {
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
      )}
    </div>
  );
}
