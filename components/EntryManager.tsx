"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type Category,
  type Entry,
  type EntryKind,
  type Totals,
  type Wallet,
} from "@/lib/client";
import { formatPeso } from "@/lib/money";
import {
  addDaysKey,
  longDayLabel,
  monthStartKey,
  todayKey,
  ymdFromISO,
} from "@/lib/date";
import ConfirmModal, { type ConfirmState } from "@/components/ConfirmModal";
import { SkeletonRows } from "@/components/Skeleton";

type FormState = {
  date: string;
  categoryId: string;
  amount: string;
  walletId: string;
  note: string;
};

type Preset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";

/**
 * The encode page for one kind of entry. Earnings and Expenses are the same
 * screen with different wording and colours, so they share this component.
 */
export default function EntryManager({
  kind,
  title,
  blurb,
  amountLabel,
  categoryLabel,
}: {
  kind: EntryKind;
  title: string;
  blurb: string;
  amountLabel: string;
  categoryLabel: string;
}) {
  const today = todayKey();
  const isEarning = kind === "EARNING";
  const accent = isEarning ? "text-income" : "text-outflow";

  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<Totals>({
    earningsCents: 0,
    expenseCents: 0,
    balanceCents: 0,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(monthStartKey(today));
  const [to, setTo] = useState(today);

  const [form, setForm] = useState<FormState>({
    date: today,
    categoryId: "",
    amount: "",
    walletId: "",
    note: "",
  });

  // Optional "6 x 11.00" helper that fills in the amount for you.
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");

  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const needsDetail = Boolean(selectedCategory?.requiresDetail);

  const lineTotalCents = Math.round(
    (parseFloat(qty) || 0) * (parseFloat(unitPrice) || 0) * 100,
  );

  /** Push the computed total into the amount, and seed the description. */
  function applyQuickMaths() {
    if (lineTotalCents <= 0) return;
    const n = parseFloat(qty) || 0;
    const each = parseFloat(unitPrice) || 0;
    setForm((f) => ({
      ...f,
      amount: (lineTotalCents / 100).toFixed(2),
      note: f.note.trim()
        ? f.note
        : `${n} x ${formatPeso(Math.round(each * 100))} each`,
    }));
  }

  const loadRefs = useCallback(async () => {
    const [cats, wals] = await Promise.all([
      api.get<{ categories: Category[] }>(`/api/categories?kind=${kind}`),
      api.get<{ wallets: Wallet[] }>("/api/wallets"),
    ]);
    const activeWallets = wals.wallets.filter((w) => !w.archived);
    setCategories(cats.categories);
    setWallets(activeWallets);
    setForm((f) => ({
      ...f,
      categoryId: f.categoryId || cats.categories[0]?.id || "",
      walletId: f.walletId || activeWallets[0]?.id || "",
    }));
  }, [kind]);

  const loadEntries = useCallback(async () => {
    const qs =
      preset === "all"
        ? `?kind=${kind}`
        : `?kind=${kind}&from=${from}&to=${to}`;
    const res = await api.get<{ entries: Entry[]; totals: Totals }>(
      `/api/entries${qs}`,
    );
    setEntries(res.entries);
    setTotals(res.totals);
  }, [kind, preset, from, to]);

  useEffect(() => {
    // Mount-and-refetch whenever the kind or the date filter changes.
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadRefs(), loadEntries()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRefs, loadEntries]);

  const rangeTotalCents = isEarning ? totals.earningsCents : totals.expenseCents;

  const dayCount = useMemo(() => {
    return new Set(entries.map((e) => ymdFromISO(e.date))).size;
  }, [entries]);

  async function save() {
    setError("");
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!form.date) {
      setError("Choose a date.");
      return;
    }
    if (needsDetail && !form.note.trim()) {
      setError(
        `Say what this was — "${selectedCategory?.name}" on its own won't mean anything later.`,
      );
      return;
    }

    setSaving(true);
    const payload = {
      kind,
      date: form.date,
      amount,
      categoryId: form.categoryId || null,
      walletId: form.walletId || null,
      note: form.note || null,
    };

    try {
      if (editingId) {
        await api.patch(`/api/entries/${editingId}`, payload);
      } else {
        await api.post("/api/entries", payload);
      }
      resetForm();
      await Promise.all([loadRefs(), loadEntries()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setError("");
    setQty("");
    setUnitPrice("");
    setForm((f) => ({
      ...f,
      date: today,
      amount: "",
      note: "",
    }));
  }

  function openEdit(e: Entry) {
    setError("");
    setEditingId(e.id);
    setForm({
      date: ymdFromISO(e.date),
      categoryId: e.categoryId ?? "",
      amount: (e.amountCents / 100).toFixed(2),
      walletId: e.walletId ?? "",
      note: e.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function requestDelete(e: Entry) {
    setConfirm({
      title: `Archive this ${isEarning ? "earning" : "expense"}`,
      message: `${formatPeso(e.amountCents)} on ${longDayLabel(
        ymdFromISO(e.date),
      )} will stop counting towards your totals and wallet balances. It is kept on the Archived page, where you can restore it or delete it for good.`,
      confirmLabel: "Archive",
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await api.del(`/api/entries/${e.id}`);
          setConfirm(null);
          if (editingId === e.id) resetForm();
          await Promise.all([loadRefs(), loadEntries()]);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not delete");
          setConfirm(null);
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  }

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "today") {
      setFrom(today);
      setTo(today);
    } else if (p === "yesterday") {
      setFrom(addDaysKey(today, -1));
      setTo(addDaysKey(today, -1));
    } else if (p === "7d") {
      setFrom(addDaysKey(today, -6));
      setTo(today);
    } else if (p === "month") {
      setFrom(monthStartKey(today));
      setTo(today);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        <p className="mt-1 max-w-[75ch] text-sm text-slate-500">{blurb}</p>
      </div>

      {/* ── Encode form ── */}
      <div
        className={`rounded-2xl border bg-surface p-5 shadow-sm ${
          editingId ? "border-brand" : "border-slate-200"
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold text-slate-800">
            {editingId ? "Edit entry" : "Encode an entry"}
          </h2>
          {editingId && (
            <button
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark"
            >
              Cancel edit
            </button>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {categories.length === 0 && !loading && (
          <div className="mb-3 rounded-lg bg-brand-light px-3 py-2 text-sm text-brand-dark">
            You have no {categoryLabel.toLowerCase()} categories yet. Add one on
            the Categories page — or save without one and label it later.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Date">
            <input
              type="date"
              max={today}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label={categoryLabel}>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className={inputCls}
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={amountLabel}>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              className={inputCls}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </Field>

          <Field label={isEarning ? "Into wallet" : "From wallet"}>
            <select
              value={form.walletId}
              onChange={(e) => setForm({ ...form, walletId: e.target.value })}
              className={inputCls}
            >
              <option value="">— None —</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.icon ? `${w.icon} ` : ""}
                  {w.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={
              needsDetail
                ? `What exactly was it? (required for "${selectedCategory?.name}")`
                : "Note (optional)"
            }
            className="col-span-2"
          >
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={
                needsDetail
                  ? isEarning
                    ? "e.g. Sold old phone to a workmate"
                    : "e.g. 6 Marlboro at 11 pesos each"
                  : isEarning
                    ? "15th cutoff pay…"
                    : "Groceries at SM…"
              }
              className={`${inputCls} ${
                needsDetail && !form.note.trim()
                  ? "border-brand ring-2 ring-brand/20"
                  : ""
              }`}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </Field>

          <div className="col-span-2 flex items-end sm:col-span-1">
            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Update" : "Save entry"}
            </button>
          </div>
        </div>

        {/* Quantity x unit price -> amount. Handy for things bought by the
            piece, e.g. 6 sticks at 11.00 each. */}
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-ice p-3">
          <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Quick maths
          </span>
          <div className="w-20">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Qty
            </label>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="6"
              className={inputCls}
            />
          </div>
          <span className="pb-2 text-slate-400">x</span>
          <div className="w-28">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Price each
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="11.00"
              className={inputCls}
            />
          </div>
          <span className="pb-2 text-slate-400">=</span>
          <span className="pb-2 font-bold tabular-nums text-slate-700">
            {formatPeso(lineTotalCents)}
          </span>
          <button
            type="button"
            onClick={applyQuickMaths}
            disabled={lineTotalCents <= 0}
            className="mb-0.5 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark disabled:opacity-40"
          >
            Use as amount
          </button>
          <span className="pb-2 text-xs text-slate-400">
            fills the amount{needsDetail ? " and the description" : ""}
          </span>
        </div>
      </div>

      {/* ── History ── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">History</h2>
            <p className="text-xs text-slate-400">
              {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              {dayCount > 0 && ` across ${dayCount} day${dayCount === 1 ? "" : "s"}`}
              {" · "}
              <span className={`font-semibold ${accent}`}>
                {formatPeso(rangeTotalCents)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Quick label="Today" on={preset === "today"} onClick={() => applyPreset("today")} />
            <Quick label="Yesterday" on={preset === "yesterday"} onClick={() => applyPreset("yesterday")} />
            <Quick label="7 days" on={preset === "7d"} onClick={() => applyPreset("7d")} />
            <Quick label="This month" on={preset === "month"} onClick={() => applyPreset("month")} />
            <Quick label="All" on={preset === "all"} onClick={() => applyPreset("all")} />
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
                className="rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs text-slate-700 outline-none focus:border-brand"
              />
              <span className="text-xs text-slate-400">–</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
                className="rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs text-slate-700 outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-semibold">Date</th>
                <th className="px-3 py-2.5 font-semibold">{categoryLabel}</th>
                <th className="px-3 py-2.5 font-semibold">Note</th>
                <th className="px-3 py-2.5 font-semibold">Wallet</th>
                <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={6} cols={6} />
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                    Nothing encoded in this range yet.
                  </td>
                </tr>
              ) : (
                <>
                  {entries.map((e) => (
                    <tr
                      key={e.id}
                      className={`border-b border-slate-100 last:border-0 hover:bg-ice ${
                        editingId === e.id ? "bg-brand-light" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {longDayLabel(ymdFromISO(e.date))}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background:
                                e.category?.color ??
                                (isEarning ? "#0f9d58" : "#e5484d"),
                            }}
                          />
                          <span className="text-slate-700">
                            {e.category?.name ?? "Uncategorised"}
                          </span>
                        </span>
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-2.5 text-slate-500">
                        {e.note ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                        {e.wallet
                          ? `${e.wallet.icon ?? "👛"} ${e.wallet.name}`
                          : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${accent}`}>
                        {formatPeso(e.amountCents)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <button
                          onClick={() => openEdit(e)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-light"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => requestDelete(e)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                        >
                          Archive
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-ice font-semibold text-slate-700">
                    <td className="px-3 py-2.5" colSpan={4}>
                      Total
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${accent}`}>
                      {formatPeso(rangeTotalCents)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        state={confirm}
        loading={confirmLoading}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

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

function Quick({
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
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
        on
          ? "border-brand bg-brand text-white"
          : "border-slate-300 bg-surface text-slate-600 hover:border-brand hover:text-brand-dark"
      }`}
    >
      {label}
    </button>
  );
}
