"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type DashboardData } from "@/lib/client";
import { formatPeso } from "@/lib/money";
import {
  addDaysKey,
  addMonths,
  longDayLabel,
  monthLabel,
  todayKey,
  ymdFromISO,
} from "@/lib/date";
import StatCard from "@/components/StatCard";
import WalletCard from "@/components/WalletCard";
import FlowChart from "@/components/FlowChart";
import LimitsCard from "@/components/LimitsCard";
import { Skeleton, SkeletonCards } from "@/components/Skeleton";

type View = "7d" | "month" | "year";

export default function DashboardPage() {
  const today = todayKey();
  const [view, setView] = useState<View>("7d");
  const [anchor, setAnchor] = useState(today);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api.get<DashboardData>(
        `/api/dashboard?view=${view}&anchor=${anchor}`,
      );
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [view, anchor]);

  useEffect(() => {
    // Mount-and-refetch: every setState inside load() happens after an await,
    // so this does not cascade renders the way the rule assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  /** Step the anchor date back/forward by one view-sized period. */
  function step(direction: -1 | 1) {
    if (view === "7d") {
      setAnchor((a) => addDaysKey(a, 7 * direction));
    } else if (view === "month") {
      setAnchor((a) => `${addMonths(a.slice(0, 7), direction)}-01`);
    } else {
      setAnchor((a) => `${Number(a.slice(0, 4)) + direction}-01-01`);
    }
  }

  function switchView(next: View) {
    setView(next);
    setAnchor(today); // always jump back to the current period
  }

  const atPresent = anchor >= today;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? data.today.label : longDayLabel(today)} · your money at a
            glance
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/earnings"
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            + Earning
          </Link>
          <Link
            href="/expenses"
            className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand-dark"
          >
            + Expense
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Headline cards: today, last 7 days, this month, this year ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !data ? (
          <SkeletonCards count={4} />
        ) : (
          <>
            <PeriodCard
              title="Today"
              subtitle={data.today.label}
              totals={data.today}
              accent
            />
            <PeriodCard
              title="Last 7 days"
              subtitle={`${data.last7.from} → ${data.last7.to}`}
              totals={data.last7}
            />
            <PeriodCard
              title="This month"
              subtitle={data.month.label}
              totals={data.month}
            />
            <PeriodCard
              title="This year"
              subtitle={data.year.label}
              totals={data.year}
            />
          </>
        )}
      </div>

      {/* ── Monthly limits ── */}
      {!loading && data && (
        <LimitsCard limits={data.limits ?? []} todayYmd={today} />
      )}

      {/* ── All-time balance ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {loading || !data ? (
          <SkeletonCards count={3} />
        ) : (
          <>
            <StatCard
              label="All-time earnings"
              cents={data.allTime.earningsCents}
              tone="income"
              hint={
                data.allTime.firstEntry
                  ? `since ${longDayLabel(data.allTime.firstEntry)}`
                  : "no entries yet"
              }
            />
            <StatCard
              label="All-time expenses"
              cents={data.allTime.expenseCents}
              tone="outflow"
            />
            <StatCard
              label="Running balance"
              cents={data.allTime.balanceCents}
              tone="brand"
              hint="earnings − expenses"
            />
          </>
        )}
      </div>

      {/* ── Wallets ── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">My Wallets</h2>
            <p className="text-xs text-slate-400">
              {data
                ? `${formatPeso(data.walletTotals.totalCents)} across ${data.walletTotals.walletCount} wallet${data.walletTotals.walletCount === 1 ? "" : "s"}${data.walletTotals.lowCount > 0 ? ` · ${data.walletTotals.lowCount} running low` : ""}`
                : "Loading…"}
            </p>
          </div>
          <Link
            href="/wallets"
            className="rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark"
          >
            Manage &amp; move money
          </Link>
        </div>

        {loading || !data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : data.wallets.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No wallets yet.{" "}
            <Link href="/wallets" className="text-brand hover:underline">
              Add Security Bank, GoTyme or GCash
            </Link>{" "}
            to track where your money sits.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.wallets.map((w) => (
              <WalletCard
                key={w.id}
                wallet={w}
                href={`/wallets/${w.id}`}
                compact
              />
            ))}
          </div>
        )}
      </div>

      {/* ── History chart ── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">History</h2>
            <p className="text-xs text-slate-400">
              {data
                ? `${data.view.label} · ${formatPeso(data.view.totals.earningsCents)} in · ${formatPeso(data.view.totals.expenseCents)} out`
                : "Loading…"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
              <button
                onClick={() => step(-1)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100"
                aria-label="Previous period"
              >
                ‹
              </button>
              <span className="min-w-20 px-1 text-center text-xs font-semibold text-slate-600">
                {view === "year"
                  ? anchor.slice(0, 4)
                  : view === "month"
                    ? monthLabel(anchor.slice(0, 7))
                    : "7 days"}
              </span>
              <button
                onClick={() => step(1)}
                disabled={atPresent}
                className="rounded-md px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                aria-label="Next period"
              >
                ›
              </button>
            </div>

            <ViewTab
              label="Last 7 days"
              on={view === "7d"}
              onClick={() => switchView("7d")}
            />
            <ViewTab
              label="Month"
              on={view === "month"}
              onClick={() => switchView("month")}
            />
            <ViewTab
              label="Year"
              on={view === "year"}
              onClick={() => switchView("year")}
            />
          </div>
        </div>

        {loading || !data ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <>
            <FlowChart buckets={data.view.buckets} />
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
              <MiniTotal
                label="Earnings"
                cents={data.view.totals.earningsCents}
                className="text-income"
              />
              <MiniTotal
                label="Expenses"
                cents={data.view.totals.expenseCents}
                className="text-outflow"
              />
              <MiniTotal
                label="Balance"
                cents={data.view.totals.balanceCents}
                className={
                  data.view.totals.balanceCents < 0
                    ? "text-outflow"
                    : "text-income"
                }
              />
            </div>
          </>
        )}
      </div>

      {/* ── Breakdown + recent ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Breakdown
          title="Where it went"
          empty="No expenses in this range."
          slices={data?.topExpenses ?? []}
          total={data?.view.totals.expenseCents ?? 0}
          loading={loading}
          fallbackColor="#e5484d"
        />
        <Breakdown
          title="Where it came from"
          empty="No earnings in this range."
          slices={data?.topEarnings ?? []}
          total={data?.view.totals.earningsCents ?? 0}
          loading={loading}
          fallbackColor="#0f9d58"
        />

        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Recent entries</h2>
            <Link
              href="/history"
              className="text-xs font-semibold text-brand hover:text-brand-dark"
            >
              See all
            </Link>
          </div>
          {loading || !data ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : data.recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Nothing encoded yet. Start with{" "}
              <Link href="/earnings" className="text-brand hover:underline">
                Earnings
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recent.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="h-7 w-1 shrink-0 rounded-full"
                    style={{
                      background:
                        e.category?.color ??
                        (e.kind === "EARNING" ? "#0f9d58" : "#e5484d"),
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {e.category?.name ?? "Uncategorised"}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {longDayLabel(ymdFromISO(e.date))}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      e.kind === "EARNING" ? "text-income" : "text-outflow"
                    }`}
                  >
                    {e.kind === "EARNING" ? "+" : "−"}
                    {formatPeso(e.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Small building blocks ───────────────────────────────────────────────── */

function PeriodCard({
  title,
  subtitle,
  totals,
  accent = false,
}: {
  title: string;
  subtitle: string;
  totals: { earningsCents: number; expenseCents: number; balanceCents: number };
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-transparent bg-brand text-white shadow-md"
          : "border-slate-200 bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={`text-xs font-semibold uppercase tracking-wide ${
            accent ? "text-white/75" : "text-slate-500"
          }`}
        >
          {title}
        </p>
        <p className={`text-[10px] ${accent ? "text-white/60" : "text-slate-400"}`}>
          {subtitle}
        </p>
      </div>

      <p
        className={`mt-1.5 text-2xl font-bold tabular-nums ${
          accent
            ? "text-white"
            : totals.balanceCents < 0
              ? "text-outflow"
              : "text-income"
        }`}
      >
        {formatPeso(totals.balanceCents)}
      </p>

      <div
        className={`mt-2 flex items-center gap-3 text-xs ${
          accent ? "text-white/80" : ""
        }`}
      >
        <span className={accent ? "" : "text-income"}>
          ↑ {formatPeso(totals.earningsCents)}
        </span>
        <span className={accent ? "" : "text-outflow"}>
          ↓ {formatPeso(totals.expenseCents)}
        </span>
      </div>
    </div>
  );
}

function ViewTab({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
        on
          ? "border-brand bg-brand text-white"
          : "border-slate-300 bg-surface text-slate-600 hover:border-brand hover:text-brand-dark"
      }`}
    >
      {label}
    </button>
  );
}

function MiniTotal({
  label,
  cents,
  className,
}: {
  label: string;
  cents: number;
  className: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-base font-bold tabular-nums ${className}`}>
        {formatPeso(cents)}
      </p>
    </div>
  );
}

function Breakdown({
  title,
  empty,
  slices,
  total,
  loading,
  fallbackColor,
}: {
  title: string;
  empty: string;
  slices: { id: string | null; name: string; color: string | null; amountCents: number }[];
  total: number;
  loading: boolean;
  fallbackColor: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-slate-800">{title}</h2>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : slices.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {slices.map((s) => {
            const pct = total > 0 ? (s.amountCents / total) * 100 : 0;
            return (
              <li key={s.id ?? "none"}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-slate-600">{s.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                    {formatPeso(s.amountCents)}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {pct.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(pct, 1)}%`,
                      background: s.color ?? fallbackColor,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
