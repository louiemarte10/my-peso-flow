"use client";

import { useState } from "react";
import type { Bucket } from "@/lib/client";
import { formatPeso, formatPesoShort } from "@/lib/money";

/**
 * Dependency-free grouped bar chart: earnings vs expenses per bucket (a day for
 * the 7-day and month views, a month for the year view). Bars are sized as a
 * percentage of the largest value in the range, so it scales with the container
 * and needs no measurement.
 */
export default function FlowChart({ buckets }: { buckets: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.earningsCents, b.expenseCents)),
  );

  if (buckets.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-slate-400">
        No data in this range yet.
      </p>
    );
  }

  const active = hover !== null ? buckets[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-income" />
            Earnings
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-outflow" />
            Expenses
          </span>
        </div>
        <p className="text-xs text-slate-400">
          {active ? (
            <span className="font-medium text-slate-600">
              {active.label}: {formatPeso(active.earningsCents)} in ·{" "}
              {formatPeso(active.expenseCents)} out ·{" "}
              <span
                className={
                  active.balanceCents < 0 ? "text-outflow" : "text-income"
                }
              >
                {formatPeso(active.balanceCents)} net
              </span>
            </span>
          ) : (
            <>Peak: {formatPesoShort(max)}</>
          )}
        </p>
      </div>

      <div className="flex h-52 items-end gap-1 border-b border-slate-200 sm:gap-2">
        {buckets.map((b, i) => {
          const inPct = (b.earningsCents / max) * 100;
          const outPct = (b.expenseCents / max) * 100;
          return (
            <div
              key={b.key}
              className="group flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="flex h-full items-end justify-center gap-[2px]">
                <div
                  className="w-full max-w-4 rounded-t-sm bg-income/85 transition group-hover:bg-income"
                  style={{ height: `${Math.max(inPct, b.earningsCents > 0 ? 2 : 0)}%` }}
                  title={`${b.label} earnings: ${formatPeso(b.earningsCents)}`}
                />
                <div
                  className="w-full max-w-4 rounded-t-sm bg-outflow/85 transition group-hover:bg-outflow"
                  style={{ height: `${Math.max(outPct, b.expenseCents > 0 ? 2 : 0)}%` }}
                  title={`${b.label} expenses: ${formatPeso(b.expenseCents)}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1 sm:gap-2">
        {buckets.map((b, i) => (
          <div
            key={b.key}
            className={`flex-1 truncate text-center text-[10px] transition ${
              hover === i ? "font-semibold text-brand" : "text-slate-400"
            }`}
          >
            {b.label}
          </div>
        ))}
      </div>
    </div>
  );
}
