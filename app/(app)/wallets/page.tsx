"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  WALLET_TYPE_LABEL,
  type Transfer,
  type Wallet,
  type WalletTotals,
  type WalletType,
} from "@/lib/client";
import { formatPeso } from "@/lib/money";
import { longDayLabel, todayKey, ymdFromISO } from "@/lib/date";
import {
  WALLET_COLORS,
  WALLET_ICONS,
  WALLET_TYPES,
} from "@/lib/defaults";
import WalletCard from "@/components/WalletCard";
import ConfirmModal, { type ConfirmState } from "@/components/ConfirmModal";
import { Skeleton, SkeletonRows } from "@/components/Skeleton";

type WalletForm = {
  name: string;
  type: WalletType;
  color: string;
  icon: string;
  accountRef: string;
  openingBalance: string;
  lowBalance: string;
};

const emptyWallet = (): WalletForm => ({
  name: "",
  type: "EWALLET",
  color: WALLET_COLORS[0],
  icon: WALLET_ICONS[1],
  accountRef: "",
  openingBalance: "",
  lowBalance: "",
});

type TransferForm = {
  date: string;
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  fee: string;
  note: string;
};

export default function WalletsPage() {
  const today = todayKey();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [totals, setTotals] = useState<WalletTotals>({
    totalCents: 0,
    walletCount: 0,
    lowCount: 0,
  });
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── Wallet form ──
  const [walletForm, setWalletForm] = useState<WalletForm>(emptyWallet());
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [showWalletForm, setShowWalletForm] = useState(false);
  const [savingWallet, setSavingWallet] = useState(false);
  const [walletError, setWalletError] = useState("");

  // ── Transfer form ──
  const [transferForm, setTransferForm] = useState<TransferForm>({
    date: today,
    fromWalletId: "",
    toWalletId: "",
    amount: "",
    fee: "",
    note: "",
  });
  const [editingTransferId, setEditingTransferId] = useState<string | null>(
    null,
  );
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [transferError, setTransferError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [w, t] = await Promise.all([
        api.get<{ wallets: Wallet[]; totals: WalletTotals }>(
          "/api/wallets?includeArchived=1",
        ),
        api.get<{ transfers: Transfer[] }>("/api/transfers"),
      ]);
      setWallets(w.wallets);
      setTotals(w.totals);
      setTransfers(t.transfers);

      // Seed the transfer form with sensible wallets the first time.
      const active = w.wallets.filter((x) => !x.archived);
      setTransferForm((f) => ({
        ...f,
        fromWalletId: f.fromWalletId || active[0]?.id || "",
        toWalletId: f.toWalletId || active[1]?.id || "",
      }));
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

  const active = useMemo(() => wallets.filter((w) => !w.archived), [wallets]);
  const archived = useMemo(() => wallets.filter((w) => w.archived), [wallets]);

  /* ── Wallet CRUD ── */

  function openCreate() {
    setEditingWalletId(null);
    setWalletForm(emptyWallet());
    setWalletError("");
    setShowWalletForm(true);
  }

  function openEditWallet(w: Wallet) {
    setEditingWalletId(w.id);
    setWalletError("");
    setWalletForm({
      name: w.name,
      type: w.type,
      color: w.color ?? WALLET_COLORS[0],
      icon: w.icon ?? WALLET_ICONS[1],
      accountRef: w.accountRef ?? "",
      openingBalance: (w.openingBalanceCents / 100).toFixed(2),
      lowBalance: w.lowBalanceCents ? (w.lowBalanceCents / 100).toFixed(2) : "",
    });
    setShowWalletForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveWallet() {
    setWalletError("");
    if (!walletForm.name.trim()) {
      setWalletError("Enter a wallet name.");
      return;
    }
    setSavingWallet(true);
    const payload = {
      name: walletForm.name.trim(),
      type: walletForm.type,
      color: walletForm.color,
      icon: walletForm.icon,
      accountRef: walletForm.accountRef.trim() || null,
      openingBalance: parseFloat(walletForm.openingBalance) || 0,
      lowBalance: parseFloat(walletForm.lowBalance) || 0,
    };
    try {
      if (editingWalletId) {
        await api.patch(`/api/wallets/${editingWalletId}`, payload);
      } else {
        await api.post("/api/wallets", payload);
      }
      setShowWalletForm(false);
      setEditingWalletId(null);
      setWalletForm(emptyWallet());
      await load();
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingWallet(false);
    }
  }

  function requestRemoveWallet(w: Wallet) {
    setConfirm({
      title: `Archive "${w.name}"`,
      message: `This wallet stops appearing on the encode forms and drops out of your totals. Its ${w.movementCount} movement${w.movementCount === 1 ? "" : "s"} stay intact, and you can restore it or delete it for good from the Archived page.`,
      confirmLabel: "Archive",
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await api.del(`/api/wallets/${w.id}`);
          setConfirm(null);
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not remove");
          setConfirm(null);
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  }

  /* ── Transfers ── */

  const fromWallet = active.find((w) => w.id === transferForm.fromWalletId);
  const transferAmount = parseFloat(transferForm.amount) || 0;
  const transferFee = parseFloat(transferForm.fee) || 0;
  const afterBalanceCents = fromWallet
    ? fromWallet.balanceCents - Math.round((transferAmount + transferFee) * 100)
    : null;

  async function saveTransfer() {
    setTransferError("");
    if (!transferForm.fromWalletId || !transferForm.toWalletId) {
      setTransferError("Choose both wallets.");
      return;
    }
    if (transferForm.fromWalletId === transferForm.toWalletId) {
      setTransferError("Pick two different wallets.");
      return;
    }
    if (transferAmount <= 0) {
      setTransferError("Enter an amount greater than 0.");
      return;
    }
    setSavingTransfer(true);
    const payload = {
      date: transferForm.date,
      fromWalletId: transferForm.fromWalletId,
      toWalletId: transferForm.toWalletId,
      amount: transferAmount,
      fee: transferFee,
      note: transferForm.note || null,
    };
    try {
      if (editingTransferId) {
        await api.patch(`/api/transfers/${editingTransferId}`, payload);
      } else {
        await api.post("/api/transfers", payload);
      }
      resetTransfer();
      await load();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingTransfer(false);
    }
  }

  function resetTransfer() {
    setEditingTransferId(null);
    setTransferError("");
    setTransferForm((f) => ({
      ...f,
      date: today,
      amount: "",
      fee: "",
      note: "",
    }));
  }

  function openEditTransfer(t: Transfer) {
    setEditingTransferId(t.id);
    setTransferError("");
    setTransferForm({
      date: ymdFromISO(t.date),
      fromWalletId: t.fromWalletId,
      toWalletId: t.toWalletId,
      amount: (t.amountCents / 100).toFixed(2),
      fee: t.feeCents ? (t.feeCents / 100).toFixed(2) : "",
      note: t.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestDeleteTransfer(t: Transfer) {
    setConfirm({
      title: "Archive this move",
      message: `The ${formatPeso(t.amountCents)} move from ${t.fromWallet.name} to ${t.toWallet.name} on ${longDayLabel(ymdFromISO(t.date))} stops counting, so both wallet balances go back to what they were. It is kept on the Archived page.`,
      confirmLabel: "Archive",
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await api.del(`/api/transfers/${t.id}`);
          setConfirm(null);
          if (editingTransferId === t.id) resetTransfer();
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">My Wallets</h1>
          <p className="mt-1 max-w-[75ch] text-sm text-slate-500">
            Every place your money actually sits. Balances are worked out from
            your entries and moves — never typed in — so they stay right even
            when you edit something from last month.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          + Add wallet
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Total ── */}
      <div className="rounded-2xl border border-transparent bg-brand p-5 text-white shadow-md">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/75">
          Total across {totals.walletCount} wallet
          {totals.walletCount === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {formatPeso(totals.totalCents)}
        </p>
        {totals.lowCount > 0 && (
          <p className="mt-1 text-xs text-white/80">
            {totals.lowCount} wallet{totals.lowCount === 1 ? " is" : "s are"} at
            or below the low-balance mark you set.
          </p>
        )}
      </div>

      {/* ── Wallet form ── */}
      {showWalletForm && (
        <div className="rounded-2xl border border-brand bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-bold text-slate-800">
              {editingWalletId ? "Edit wallet" : "New wallet"}
            </h2>
            <button
              onClick={() => {
                setShowWalletForm(false);
                setEditingWalletId(null);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark"
            >
              Cancel
            </button>
          </div>

          {walletError && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {walletError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Wallet name" className="col-span-2">
              <input
                value={walletForm.name}
                onChange={(e) =>
                  setWalletForm({ ...walletForm, name: e.target.value })
                }
                placeholder="Security Bank, GoTyme, GCash…"
                className={inputCls}
              />
            </Field>

            <Field label="Type">
              <select
                value={walletForm.type}
                onChange={(e) =>
                  setWalletForm({
                    ...walletForm,
                    type: e.target.value as WalletType,
                  })
                }
                className={inputCls}
              >
                {WALLET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Nickname / last 4 (optional)">
              <input
                value={walletForm.accountRef}
                onChange={(e) =>
                  setWalletForm({ ...walletForm, accountRef: e.target.value })
                }
                placeholder="•••• 4821"
                className={inputCls}
              />
            </Field>

            <Field label="Opening balance">
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={walletForm.openingBalance}
                onChange={(e) =>
                  setWalletForm({
                    ...walletForm,
                    openingBalance: e.target.value,
                  })
                }
                placeholder="0.00"
                className={inputCls}
              />
            </Field>

            <Field label="Warn below (optional)">
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={walletForm.lowBalance}
                onChange={(e) =>
                  setWalletForm({ ...walletForm, lowBalance: e.target.value })
                }
                placeholder="500.00"
                className={inputCls}
              />
            </Field>

            <Field label="Icon" className="col-span-2">
              <div className="flex flex-wrap gap-1">
                {WALLET_ICONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => setWalletForm({ ...walletForm, icon: ic })}
                    className={`h-8 w-8 rounded-lg border text-base transition ${
                      walletForm.icon === ic
                        ? "border-brand bg-brand-light"
                        : "border-slate-200 hover:border-brand"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Colour" className="col-span-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {WALLET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setWalletForm({ ...walletForm, color: c })}
                    aria-label={`Use colour ${c}`}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      walletForm.color === c
                        ? "scale-110 border-slate-800"
                        : "border-transparent"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Field>

            <div className="col-span-2 flex items-end sm:col-span-1">
              <button
                onClick={saveWallet}
                disabled={savingWallet}
                className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                {savingWallet
                  ? "Saving…"
                  : editingWalletId
                    ? "Update wallet"
                    : "Create wallet"}
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            The opening balance is what was in the wallet{" "}
            <strong>before</strong> you started encoding here. Everything after
            that is worked out from your entries and moves.
          </p>
        </div>
      )}

      {/* ── Wallet grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-surface p-10 text-center shadow-sm">
          <p className="text-sm text-slate-400">
            No wallets yet. Add Security Bank, GoTyme, GCash, or cash on hand to
            get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((w) => (
            <div key={w.id} className="group relative">
              <WalletCard wallet={w} href={`/wallets/${w.id}`} />
              <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    openEditWallet(w);
                  }}
                  className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    requestRemoveWallet(w);
                  }}
                  className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Move money / withdraw ── */}
      <div
        className={`rounded-2xl border bg-surface p-5 shadow-sm ${
          editingTransferId ? "border-brand" : "border-slate-200"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-bold text-slate-800">
            {editingTransferId ? "Edit move" : "Move money / Withdraw"}
          </h2>
          {editingTransferId && (
            <button
              onClick={resetTransfer}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark"
            >
              Cancel edit
            </button>
          )}
        </div>
        <p className="mb-3 max-w-[75ch] text-sm text-slate-500">
          An ATM withdrawal, a bank-to-GCash cash-in, money set aside for ipon.
          This is <strong>not</strong> an expense — it only moves money between
          your own wallets, so your earnings and expense totals don&apos;t
          change. Any charge goes in the fee box, and that part really is gone.
        </p>

        {transferError && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {transferError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Date">
            <input
              type="date"
              max={today}
              value={transferForm.date}
              onChange={(e) =>
                setTransferForm({ ...transferForm, date: e.target.value })
              }
              className={inputCls}
            />
          </Field>

          <Field label="From wallet">
            <select
              value={transferForm.fromWalletId}
              onChange={(e) =>
                setTransferForm({
                  ...transferForm,
                  fromWalletId: e.target.value,
                })
              }
              className={inputCls}
            >
              <option value="">— Choose —</option>
              {active.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatPeso(w.balanceCents)})
                </option>
              ))}
            </select>
          </Field>

          <Field label="To wallet">
            <select
              value={transferForm.toWalletId}
              onChange={(e) =>
                setTransferForm({ ...transferForm, toWalletId: e.target.value })
              }
              className={inputCls}
            >
              <option value="">— Choose —</option>
              {active.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({formatPeso(w.balanceCents)})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Amount">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={transferForm.amount}
              onChange={(e) =>
                setTransferForm({ ...transferForm, amount: e.target.value })
              }
              placeholder="0.00"
              className={inputCls}
            />
          </Field>

          <Field label="Fee (optional)">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={transferForm.fee}
              onChange={(e) =>
                setTransferForm({ ...transferForm, fee: e.target.value })
              }
              placeholder="15.00"
              className={inputCls}
            />
          </Field>

          <Field label="Note (optional)" className="col-span-2 lg:col-span-5">
            <input
              value={transferForm.note}
              onChange={(e) =>
                setTransferForm({ ...transferForm, note: e.target.value })
              }
              placeholder="ATM withdrawal for the week…"
              className={inputCls}
            />
          </Field>

          <div className="col-span-2 flex items-end sm:col-span-1">
            <button
              onClick={saveTransfer}
              disabled={savingTransfer}
              className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {savingTransfer
                ? "Saving…"
                : editingTransferId
                  ? "Update move"
                  : "Save move"}
            </button>
          </div>
        </div>

        {fromWallet && transferAmount > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            {fromWallet.name} goes from{" "}
            <strong className="text-slate-600">
              {formatPeso(fromWallet.balanceCents)}
            </strong>{" "}
            to{" "}
            <strong
              className={
                (afterBalanceCents ?? 0) < 0 ? "text-outflow" : "text-slate-600"
              }
            >
              {formatPeso(afterBalanceCents ?? 0)}
            </strong>
            {transferFee > 0 && ` (including the ${formatPeso(Math.round(transferFee * 100))} fee)`}
            {(afterBalanceCents ?? 0) < 0 && " — that would overdraw it."}
          </p>
        )}
      </div>

      {/* ── Transfer history ── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-800">Recent moves</h2>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">From → To</th>
                <th className="px-3 py-2.5 font-semibold">Note</th>
                <th className="px-3 py-2.5 text-right font-semibold">Fee</th>
                <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={4} cols={6} />
              ) : transfers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-slate-400"
                  >
                    No moves yet. Record your first withdrawal or cash-in above.
                  </td>
                </tr>
              ) : (
                transfers.map((t) => (
                  <tr
                    key={t.id}
                    className={`border-b border-slate-100 last:border-0 hover:bg-ice ${
                      editingTransferId === t.id ? "bg-brand-light" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {longDayLabel(ymdFromISO(t.date))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {t.fromWallet.icon ?? "👛"} {t.fromWallet.name}
                      <span className="mx-1.5 text-slate-400">→</span>
                      {t.toWallet.icon ?? "👛"} {t.toWallet.name}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-500">
                      {t.note ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {t.feeCents > 0 ? formatPeso(t.feeCents) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-700">
                      {formatPeso(t.amountCents)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <button
                        onClick={() => openEditTransfer(t)}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-light"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => requestDeleteTransfer(t)}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Archived ── */}
      {archived.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <summary className="cursor-pointer font-bold text-slate-800">
            Archived wallets ({archived.length})
          </summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {archived.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-2.5">
                <span className="text-base opacity-50">{w.icon ?? "👛"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-500">{w.name}</p>
                  <p className="text-xs text-slate-400">
                    {WALLET_TYPE_LABEL[w.type]} · {formatPeso(w.balanceCents)} ·{" "}
                    {w.movementCount} movement
                    {w.movementCount === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await api.patch(`/api/wallets/${w.id}`, {
                      archived: false,
                    });
                    await load();
                  }}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-light"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmModal
        state={confirm}
        loading={confirmLoading}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
