"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  api,
  WALLET_TYPE_LABEL,
  type Movement,
  type Wallet,
} from "@/lib/client";
import { formatPeso } from "@/lib/money";
import { longDayLabel, ymdFromISO } from "@/lib/date";
import { SPEND_WINDOW_LABEL } from "@/lib/windows";
import { Skeleton } from "@/components/Skeleton";

type Filter = "ALL" | "IN" | "OUT";

export default function WalletDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await api.get<{ wallet: Wallet; movements: Movement[] }>(
        `/api/wallets/${id}`,
      );
      setWallet(res.wallet);
      setMovements(res.movements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === "ALL") return movements;
    return movements.filter((m) =>
      filter === "IN" ? m.deltaCents > 0 : m.deltaCents < 0,
    );
  }, [movements, filter]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error || "Wallet not found"}
        </div>
        <Link href="/wallets" className="text-sm text-brand hover:underline">
          ← Back to wallets
        </Link>
      </div>
    );
  }

  const accent = wallet.color ?? "#0078BF";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/wallets"
          className="text-xs font-semibold text-brand hover:underline"
        >
          ← All wallets
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
            style={{ background: `${accent}22` }}
          >
            {wallet.icon ?? "👛"}
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{wallet.name}</h1>
            <p className="text-sm text-slate-500">
              {WALLET_TYPE_LABEL[wallet.type]}
              {wallet.accountRef ? ` · ${wallet.accountRef}` : ""}
              {wallet.archived ? " · archived" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* ── Balance + flow summary ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-transparent bg-brand p-4 text-white shadow-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/75">
            Current balance
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">
            {formatPeso(wallet.balanceCents)}
          </p>
          <p className="mt-1 text-xs text-white/70">
            opened at {formatPeso(wallet.openingBalanceCents)}
          </p>
        </div>

        <Stat
          label="Money in"
          value={formatPeso(wallet.earningsCents + wallet.transferInCents)}
          hint={`${formatPeso(wallet.earningsCents)} earned · ${formatPeso(wallet.transferInCents)} moved in`}
          className="text-income"
        />
        <Stat
          label="Money out"
          value={formatPeso(
            wallet.expenseCents + wallet.transferOutCents + wallet.feesCents,
          )}
          hint={`${formatPeso(wallet.expenseCents)} spent · ${formatPeso(wallet.transferOutCents)} moved out${wallet.feesCents > 0 ? ` · ${formatPeso(wallet.feesCents)} fees` : ""}`}
          className="text-outflow"
        />
        <Stat
          label={`Spending rate (${SPEND_WINDOW_LABEL})`}
          value={`${formatPeso(wallet.avgDailySpendCents)}/day`}
          hint={
            wallet.runwayDays !== null
              ? `about ${wallet.runwayDays} day${wallet.runwayDays === 1 ? "" : "s"} left at this rate`
              : "nothing spent from here yet"
          }
          className={
            wallet.runwayDays !== null && wallet.runwayDays <= 7
              ? "text-outflow"
              : "text-slate-800"
          }
        />
      </div>

      {wallet.low && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Running low.</strong> This wallet is at or below the{" "}
          {formatPeso(wallet.lowBalanceCents)} mark you set
          {wallet.runwayDays !== null && wallet.avgDailySpendCents > 0 && (
            <> — at {formatPeso(wallet.avgDailySpendCents)}/day that is roughly{" "}
            {wallet.runwayDays} more day{wallet.runwayDays === 1 ? "" : "s"}</>
          )}
          . Time to top it up from another wallet.
        </div>
      )}

      {/* ── Ledger ── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">Ledger</h2>
            <p className="text-xs text-slate-400">
              Newest first, with the balance after each movement.
            </p>
          </div>
          <div className="flex gap-2">
            <Tab label="All" on={filter === "ALL"} onClick={() => setFilter("ALL")} />
            <Tab label="Money in" on={filter === "IN"} onClick={() => setFilter("IN")} />
            <Tab label="Money out" on={filter === "OUT"} onClick={() => setFilter("OUT")} />
          </div>
        </div>

        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">What</th>
                <th className="px-3 py-2.5 font-semibold">Note</th>
                <th className="px-3 py-2.5 text-right font-semibold">Change</th>
                <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                    Nothing here yet. Encode an earning or expense against this
                    wallet, or move money into it.
                  </td>
                </tr>
              ) : (
                visible.map((m) => (
                  <tr
                    key={`${m.source}-${m.kind}-${m.id}`}
                    className="border-b border-slate-100 last:border-0 hover:bg-ice"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {longDayLabel(ymdFromISO(m.date))}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background:
                              m.color ??
                              (m.deltaCents >= 0 ? "#0F9D58" : "#E5484D"),
                          }}
                        />
                        <span className="text-slate-700">{m.label}</span>
                        {m.source === "transfer" && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                            move
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2.5 text-slate-500">
                      {m.note ?? "—"}
                      {m.feeCents > 0 && (
                        <span className="text-slate-400">
                          {m.note ? " · " : ""}incl. {formatPeso(m.feeCents)} fee
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                        m.deltaCents >= 0 ? "text-income" : "text-outflow"
                      }`}
                    >
                      {m.deltaCents >= 0 ? "+" : "−"}
                      {formatPeso(Math.abs(m.deltaCents))}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {formatPeso(m.balanceAfterCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  className: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${className}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
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
