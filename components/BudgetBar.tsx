"use client";

import { formatPeso } from "@/lib/money";

/** Amber from 80% of the limit — close enough to be worth saying something. */
export const NEAR_LIMIT_RATIO = 0.8;

export type BudgetState = "none" | "ok" | "near" | "over";

export function budgetState(
  spentCents: number,
  limitCents: number | null | undefined,
): BudgetState {
  if (!limitCents || limitCents <= 0) return "none";
  if (spentCents > limitCents) return "over";
  if (spentCents >= limitCents * NEAR_LIMIT_RATIO) return "near";
  return "ok";
}

const TONE: Record<Exclude<BudgetState, "none">, { bar: string; text: string }> =
  {
    ok: { bar: "bg-income", text: "text-slate-500" },
    near: { bar: "bg-amber-500", text: "text-amber-700" },
    over: { bar: "bg-outflow", text: "text-outflow" },
  };

/**
 * Where one category stands against its monthly limit.
 *
 * Nothing here blocks anything — going over is allowed and always was. The bar
 * exists so the decision is made before the money is spent rather than
 * discovered at the end of the month.
 */
export default function BudgetBar({
  spentCents,
  limitCents,
  className = "",
}: {
  spentCents: number;
  limitCents: number;
  className?: string;
}) {
  const state = budgetState(spentCents, limitCents);
  if (state === "none") return null;

  const tone = TONE[state];
  const pct = Math.min(100, Math.round((spentCents / limitCents) * 100));
  const left = limitCents - spentCents;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={tone.text}>
          <strong className="font-semibold">{formatPeso(spentCents)}</strong> of{" "}
          {formatPeso(limitCents)} this month
        </span>
        <span className={`shrink-0 tabular-nums ${tone.text}`}>
          {left >= 0
            ? `${formatPeso(left)} left`
            : `${formatPeso(-left)} over`}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ice">
        <div
          className={`h-full rounded-full transition-all ${tone.bar}`}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}
