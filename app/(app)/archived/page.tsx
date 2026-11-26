"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  WALLET_TYPE_LABEL,
  type ArchiveData,
  type Category,
  type Entry,
  type Transfer,
  type Wallet,
} from "@/lib/client";
import { formatPeso } from "@/lib/money";
import { longDayLabel, ymdFromISO } from "@/lib/date";
import ConfirmModal, { type ConfirmState } from "@/components/ConfirmModal";
import { Skeleton } from "@/components/Skeleton";

type Tab = "entries" | "transfers" | "categories" | "wallets";

export default function ArchivedPage() {
  const [data, setData] = useState<ArchiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("entries");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api.get<ArchiveData>("/api/archive"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  /** Put something back. Balances and totals pick it up again immediately. */
  async function restore(kind: Tab, id: string, label: string) {
    setBusy(id);
    setError("");
    try {
      const path =
        kind === "entries"
          ? `/api/entries/${id}`
          : kind === "transfers"
            ? `/api/transfers/${id}`
            : kind === "categories"
              ? `/api/categories/${id}`
              : `/api/wallets/${id}`;
      await api.patch(path, { archived: false });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Could not restore ${label}`,
      );
    } finally {
      setBusy(null);
    }
  }

  /** Permanent. Always behind a confirmation. */
  function requestPurge(
    kind: Tab,
    id: string,
    title: string,
    message: string,
  ) {
    setConfirm({
      title,
      message,
      confirmLabel: "Delete forever",
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const base =
            kind === "entries"
              ? "/api/entries"
              : kind === "transfers"
                ? "/api/transfers"
                : kind === "categories"
                  ? "/api/categories"
                  : "/api/wallets";
          await api.del(`${base}/${id}?purge=1`);
          setConfirm(null);
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not delete");
          setConfirm(null);
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  const counts = data?.counts ?? {
    entries: 0,
    transfers: 0,
    categories: 0,
    wallets: 0,
    total: 0,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Archived</h1>
        <p className="mt-1 max-w-[75ch] text-sm text-slate-500">
          Nothing here counts towards any balance, total or chart. Put something
          back with <strong>Restore</strong> and it returns exactly where it
          was. <strong>Delete forever</strong> is the only thing that cannot be
          undone.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {counts.total === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-surface p-10 text-center shadow-sm">
          <p className="text-sm text-slate-400">
            Nothing is archived. When you archive an entry, a move, a category
            or a wallet, it waits here.
          </p>
          <Link
            href="/history"
            className="mt-2 inline-block text-sm text-brand hover:underline"
          >
            Back to your transactions
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <TabBtn label="Entries" n={counts.entries} on={tab === "entries"} onClick={() => setTab("entries")} />
            <TabBtn label="Moves" n={counts.transfers} on={tab === "transfers"} onClick={() => setTab("transfers")} />
            <TabBtn label="Categories" n={counts.categories} on={tab === "categories"} onClick={() => setTab("categories")} />
            <TabBtn label="Wallets" n={counts.wallets} on={tab === "wallets"} onClick={() => setTab("wallets")} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
            {tab === "entries" && (
              <List
                rows={data?.entries ?? []}
                empty="No archived entries."
                render={(e: Entry) => ({
                  key: e.id,
                  color:
                    e.category?.color ??
                    (e.kind === "EARNING" ? "#0F9D58" : "#E5484D"),
                  title: `${e.category?.name ?? "Uncategorised"} · ${formatPeso(e.amountCents)}`,
                  sub: `${longDayLabel(ymdFromISO(e.date))}${e.wallet ? ` · ${e.wallet.name}` : ""}${e.note ? ` · ${e.note}` : ""}`,
                  archivedAt: e.archivedAt ?? null,
                  onRestore: () => restore("entries", e.id, "entry"),
                  onPurge: () =>
                    requestPurge(
                      "entries",
                      e.id,
                      "Delete this entry forever",
                      `${formatPeso(e.amountCents)} on ${longDayLabel(ymdFromISO(e.date))} will be gone for good. There is no undo.`,
                    ),
                })}
                busy={busy}
              />
            )}

            {tab === "transfers" && (
              <List
                rows={data?.transfers ?? []}
                empty="No archived moves."
                render={(t: Transfer) => ({
                  key: t.id,
                  color: "#64748B",
                  title: `${t.fromWallet.name} → ${t.toWallet.name} · ${formatPeso(t.amountCents)}`,
                  sub: `${longDayLabel(ymdFromISO(t.date))}${t.feeCents > 0 ? ` · ${formatPeso(t.feeCents)} fee` : ""}${t.note ? ` · ${t.note}` : ""}`,
                  archivedAt: t.archivedAt ?? null,
                  onRestore: () => restore("transfers", t.id, "move"),
                  onPurge: () =>
                    requestPurge(
                      "transfers",
                      t.id,
                      "Delete this move forever",
                      `The ${formatPeso(t.amountCents)} move from ${t.fromWallet.name} to ${t.toWallet.name} will be gone for good. There is no undo.`,
                    ),
                })}
                busy={busy}
              />
            )}

            {tab === "categories" && (
              <List
                rows={data?.categories ?? []}
                empty="No archived categories."
                render={(c: Category) => ({
                  key: c.id,
                  color: c.color ?? "#64748B",
                  title: c.name,
                  sub: `${c.kind === "EARNING" ? "Earning source" : "Expense category"} · used by ${c._count?.entries ?? 0} entr${(c._count?.entries ?? 0) === 1 ? "y" : "ies"}`,
                  archivedAt: c.archivedAt ?? null,
                  onRestore: () => restore("categories", c.id, "category"),
                  onPurge: () =>
                    requestPurge(
                      "categories",
                      c.id,
                      `Delete "${c.name}" forever`,
                      (c._count?.entries ?? 0) > 0
                        ? `${c._count?.entries} entr${(c._count?.entries ?? 0) === 1 ? "y is" : "ies are"} filed under this. They are kept, but they lose their label and become Uncategorised. There is no undo.`
                        : "This category is not used by any entry. There is no undo.",
                    ),
                })}
                busy={busy}
              />
            )}

            {tab === "wallets" && (
              <List
                rows={data?.wallets ?? []}
                empty="No archived wallets."
                render={(w: Wallet & { movementCount: number }) => ({
                  key: w.id,
                  color: w.color ?? "#64748B",
                  title: `${w.icon ?? "👛"} ${w.name} · ${formatPeso(w.balanceCents)}`,
                  sub: `${WALLET_TYPE_LABEL[w.type]} · ${w.movementCount} movement${w.movementCount === 1 ? "" : "s"}`,
                  archivedAt: w.archivedAt ?? null,
                  onRestore: () => restore("wallets", w.id, "wallet"),
                  onPurge: () =>
                    requestPurge(
                      "wallets",
                      w.id,
                      `Delete "${w.name}" forever`,
                      w.movementCount > 0
                        ? `This also deletes its ${w.movementCount} move(s) permanently, and its entries lose their wallet. There is no undo.`
                        : "This wallet has no movements. There is no undo.",
                    ),
                })}
                busy={busy}
              />
            )}
          </div>
        </>
      )}

      <ConfirmModal
        state={confirm}
        loading={confirmLoading}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

type Row = {
  key: string;
  color: string;
  title: string;
  sub: string;
  archivedAt: string | null;
  onRestore: () => void;
  onPurge: () => void;
};

function List<T>({
  rows,
  render,
  empty,
  busy,
}: {
  rows: T[];
  render: (row: T) => Row;
  empty: string;
  busy: string | null;
}) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((row) => {
        const r = render(row);
        return (
          <li
            key={r.key}
            className="flex flex-wrap items-center gap-3 py-3"
          >
            <span
              className="h-8 w-1 shrink-0 rounded-full opacity-60"
              style={{ background: r.color }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-600">
                {r.title}
              </p>
              <p className="truncate text-xs text-slate-400">
                {r.sub}
                {r.archivedAt &&
                  ` · archived ${longDayLabel(ymdFromISO(r.archivedAt))}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={r.onRestore}
                disabled={busy === r.key}
                className="rounded-md bg-brand-light px-2.5 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white disabled:opacity-50"
              >
                {busy === r.key ? "…" : "Restore"}
              </button>
              <button
                onClick={r.onPurge}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                Delete forever
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TabBtn({
  label,
  n,
  on,
  onClick,
}: {
  label: string;
  n: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
        on
          ? "border-brand bg-brand text-white"
          : "border-slate-300 bg-surface text-slate-600 hover:border-brand hover:text-brand-dark"
      }`}
    >
      {label}
      <span className={`ml-1.5 ${on ? "text-white/75" : "text-slate-400"}`}>
        {n}
      </span>
    </button>
  );
}
