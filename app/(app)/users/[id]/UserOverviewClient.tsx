"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type UserOverview } from "@/lib/client";
import { formatPeso } from "@/lib/money";
import { longDayLabel, ymdFromISO } from "@/lib/date";
import WalletCard from "@/components/WalletCard";
import { Skeleton } from "@/components/Skeleton";

/**
 * An admin's read-only look at one person's books. Encoding on their behalf is
 * a separate, deliberate step ("Log in as"), so nothing here can change their
 * data by accident.
 */
export default function UserOverviewClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [data, setData] = useState<UserOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api.get<UserOverview>(`/api/users/${userId}/overview`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function loginAs() {
    setSwitching(true);
    try {
      await api.post(`/api/users/${userId}/impersonate`);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch");
      setSwitching(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error || "Not found"}
        </div>
        <Link href="/users" className="text-sm text-brand hover:underline">
          ← Back to People
        </Link>
      </div>
    );
  }

  const u = data.user;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/users"
          className="text-xs font-semibold text-brand hover:underline"
        >
          ← All people
        </Link>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {u.name}
              {!u.active && (
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                  Disabled
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500">
              {u.email} · {u.role === "ADMIN" ? "Admin" : "User"} · joined{" "}
              {longDayLabel(ymdFromISO(u.createdAt))}
            </p>
          </div>
          <button
            onClick={loginAs}
            disabled={!u.active || switching}
            className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-40"
          >
            {switching ? "Switching…" : "Log in as " + u.name.split(" ")[0]}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Read-only. Use &ldquo;Log in as&rdquo; if you need to encode something
          for them.
        </p>
      </div>

      {/* Headline figures — the same ones their own dashboard shows. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Period title="Today" t={data.today} accent />
        <Period title="Last 7 days" t={data.last7} />
        <Period title="This month" t={data.month} />
        <Period title="This year" t={data.year} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="All-time earnings"
          cents={data.allTime.earningsCents}
          className="text-income"
          hint={
            data.allTime.firstEntry
              ? `since ${longDayLabel(data.allTime.firstEntry)}`
              : "nothing encoded yet"
          }
        />
        <Stat
          label="All-time expenses"
          cents={data.allTime.expenseCents}
          className="text-outflow"
        />
        <Stat
          label="Across wallets"
          cents={data.walletTotals.totalCents}
          className="text-slate-800"
          hint={`${data.walletTotals.walletCount} wallet${data.walletTotals.walletCount === 1 ? "" : "s"}${data.walletTotals.lowCount > 0 ? ` · ${data.walletTotals.lowCount} running low` : ""}`}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-800">Their wallets</h2>
        {data.wallets.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No wallets yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.wallets.map((w) => (
              <WalletCard key={w.id} wallet={w} compact />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-800">Latest entries</h2>
        {data.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Nothing encoded yet.
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
                      (e.kind === "EARNING" ? "#0F9D58" : "#E5484D"),
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {e.category?.name ?? "Uncategorised"}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {longDayLabel(ymdFromISO(e.date))}
                    {e.wallet ? ` · ${e.wallet.name}` : ""}
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
  );
}

function Period({
  title,
  t,
  accent = false,
}: {
  title: string;
  t: { earningsCents: number; expenseCents: number; balanceCents: number };
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
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          accent ? "text-white/75" : "text-slate-500"
        }`}
      >
        {title}
      </p>
      <p
        className={`mt-1.5 text-2xl font-bold tabular-nums ${
          accent
            ? "text-white"
            : t.balanceCents < 0
              ? "text-outflow"
              : "text-income"
        }`}
      >
        {formatPeso(t.balanceCents)}
      </p>
      <div
        className={`mt-2 flex items-center gap-3 text-xs ${accent ? "text-white/80" : ""}`}
      >
        <span className={accent ? "" : "text-income"}>
          ↑ {formatPeso(t.earningsCents)}
        </span>
        <span className={accent ? "" : "text-outflow"}>
          ↓ {formatPeso(t.expenseCents)}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  cents,
  className,
  hint,
}: {
  label: string;
  cents: number;
  className: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${className}`}>
        {formatPeso(cents)}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
