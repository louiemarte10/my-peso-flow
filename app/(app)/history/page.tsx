"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type Entry, type Totals } from "@/lib/client";
import { formatPeso } from "@/lib/money";
import {
  addDaysKey,
  longDayLabel,
  monthStartKey,
  todayKey,
  yearStartKey,
  ymdFromISO,
} from "@/lib/date";
import { SkeletonRows } from "@/components/Skeleton";

type Filter = "ALL" | "EARNING" | "EXPENSE";

export default function HistoryPage() {
  const today = todayKey();
  const [from, setFrom] = useState(monthStartKey(today));
  const [to, setTo] = useState(today);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<Totals>({
    earningsCents: 0,
    expenseCents: 0,
    balanceCents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<{ entries: Entry[]; totals: Totals }>(
        `/api/entries?from=${from}&to=${to}&limit=1000`,
      );
      setEntries(res.entries);
      setTotals(res.totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    // Mount-and-refetch: every setState inside load() happens after an await,
    // so this does not cascade renders the way the rule assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "ALL" && e.kind !== filter) return false;
      if (!q) return true;
      return (
        (e.note ?? "").toLowerCase().includes(q) ||
        (e.category?.name ?? "").toLowerCase().includes(q) ||
        (e.wallet?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, filter, search]);

  // Group the visible rows by day so the ledger reads like a diary.
  const days = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of visible) {
      const key = ymdFromISO(e.date);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visible]);

  function exportCsv() {
    const head = ["Date", "Type", "Category", "Wallet", "Note", "Amount"];
    const lines = visible.map((e) =>
      [
        ymdFromISO(e.date),
        e.kind === "EARNING" ? "Earning" : "Expense",
        e.category?.name ?? "Uncategorised",
        e.wallet?.name ?? "",
        e.note ?? "",
        (e.amountCents / 100).toFixed(2),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `myPesoFlow-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">All Transactions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every earning and expense in one ledger. Edit them on the{" "}
            <Link href="/earnings" className="text-brand hover:underline">
              Earnings
            </Link>{" "}
            or{" "}
            <Link href="/expenses" className="text-brand hover:underline">
              Expenses
            </Link>{" "}
            page.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={visible.length === 0}
          className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand-dark disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Totals for the range */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Total label="Earnings" cents={totals.earningsCents} className="text-income" />
        <Total label="Expenses" cents={totals.expenseCents} className="text-outflow" />
        <Total
          label="Balance"
          cents={totals.balanceCents}
          className={totals.balanceCents < 0 ? "text-outflow" : "text-income"}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-300 bg-surface px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-brand"
            />
            <span className="text-xs text-slate-400">–</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-surface px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-brand"
            />
          </div>

          <Pill label="7 days" onClick={() => { setFrom(addDaysKey(today, -6)); setTo(today); }} />
          <Pill label="This month" onClick={() => { setFrom(monthStartKey(today)); setTo(today); }} />
          <Pill label="This year" onClick={() => { setFrom(yearStartKey(today)); setTo(today); }} />

          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />

          <Tab label="All" on={filter === "ALL"} onClick={() => setFilter("ALL")} />
          <Tab label="Earnings" on={filter === "EARNING"} onClick={() => setFilter("EARNING")} />
          <Tab label="Expenses" on={filter === "EXPENSE"} onClick={() => setFilter("EXPENSE")} />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search note, category or wallet…"
            className="ml-auto w-full max-w-xs rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold">Note</th>
                <th className="px-3 py-2.5 font-semibold">Wallet</th>
                <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={8} cols={4} />
              ) : days.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-slate-400">
                    No transactions match this range.
                  </td>
                </tr>
              ) : (
                days.map(([day, rows]) => {
                  const dayIn = rows
                    .filter((r) => r.kind === "EARNING")
                    .reduce((s, r) => s + r.amountCents, 0);
                  const dayOut = rows
                    .filter((r) => r.kind === "EXPENSE")
                    .reduce((s, r) => s + r.amountCents, 0);
                  return (
                    <tr key={day} className="align-top">
                      <td colSpan={4} className="px-0 py-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-y border-slate-100 bg-ice px-3 py-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            {longDayLabel(day)}
                          </span>
                          <span className="text-xs tabular-nums text-slate-400">
                            <span className="text-income">+{formatPeso(dayIn)}</span>
                            {"  "}
                            <span className="text-outflow">−{formatPeso(dayOut)}</span>
                            {"  ·  "}
                            <span
                              className={
                                dayIn - dayOut < 0 ? "text-outflow" : "text-income"
                              }
                            >
                              {formatPeso(dayIn - dayOut)}
                            </span>
                          </span>
                        </div>
                        <table className="w-full">
                          <tbody>
                            {rows.map((e) => (
                              <tr
                                key={e.id}
                                className="border-b border-slate-100 last:border-0 hover:bg-ice"
                              >
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full"
                                      style={{
                                        background:
                                          e.category?.color ??
                                          (e.kind === "EARNING"
                                            ? "#0f9d58"
                                            : "#e5484d"),
                                      }}
                                    />
                                    <span className="text-slate-700">
                                      {e.category?.name ?? "Uncategorised"}
                                    </span>
                                  </span>
                                </td>
                                <td className="max-w-[18rem] truncate px-3 py-2.5 text-slate-500">
                                  {e.note ?? "—"}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                                  {e.wallet
                                    ? `${e.wallet.icon ?? "👛"} ${e.wallet.name}`
                                    : "—"}
                                </td>
                                <td
                                  className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                                    e.kind === "EARNING"
                                      ? "text-income"
                                      : "text-outflow"
                                  }`}
                                >
                                  {e.kind === "EARNING" ? "+" : "−"}
                                  {formatPeso(e.amountCents)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Total({
  label,
  cents,
  className,
}: {
  label: string;
  cents: number;
  className: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${className}`}>
        {formatPeso(cents)}
      </p>
    </div>
  );
}

function Pill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark"
    >
      {label}
    </button>
  );
}

function Tab({
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
