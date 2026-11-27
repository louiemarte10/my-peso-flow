"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  api,
  type EntryKind,
  type ScheduleRule,
  type ScheduleState,
  type ScheduledEntry,
  type SchedulePickerCategory,
  type WalletRef,
} from "@/lib/client";
import { centsToPesos, formatPeso } from "@/lib/money";
import {
  longDayLabel,
  monthLabel,
  shortDayLabel,
  todayKey,
  ymdFromISO,
} from "@/lib/date";
import {
  MAX_SCHEDULE_RULES,
  describeDays,
  parseDaysOfMonth,
  shortMonthWarning,
} from "@/lib/schedule";
import { Skeleton } from "@/components/Skeleton";
import ConfirmModal, { type ConfirmState } from "@/components/ConfirmModal";
import WalletAvatar from "@/components/WalletAvatar";

/** Fields changed on screen but not yet written back. */
type Draft = {
  date?: string;
  amount?: string;
  categoryId?: string;
  walletId?: string;
  note?: string;
};

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-surface px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export default function SchedulePage() {
  const today = todayKey();

  const [state, setState] = useState<ScheduleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [failures, setFailures] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);

  // Async handlers need the drafts as they are now, not as they were when the
  // handler was created.
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const apply = useCallback((next: ScheduleState) => {
    setState(next);
    setDrafts({});
    const live = new Set(next.pending.map((p) => p.id));
    setSelected((prev) => prev.filter((id) => live.has(id)));
  }, []);

  const load = useCallback(
    async (generate: boolean) => {
      setError("");
      try {
        // Generating only ever writes proposals — never a ledger entry — so it
        // is safe to run on arrival and keep the table honest.
        const res = generate
          ? await api.post<ScheduleState>("/api/schedule/generate")
          : await api.get<ScheduleState>("/api/schedule");
        apply(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load");
      } finally {
        setLoading(false);
      }
    },
    [apply],
  );

  useEffect(() => {
    // Mount-and-fetch: every setState inside load() happens after an await,
    // so this does not cascade renders the way the rule assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
  }, [load]);

  // ---- editing one waiting row -------------------------------------------

  function setField(id: string, field: keyof Draft, value: string) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  /**
   * Write a row's edits back.
   *
   * `override` carries the value that triggered the save, so a <select> never
   * has to race its own setState: what is sent is what was just chosen.
   */
  const saveRow = useCallback(async (id: string, override?: Draft) => {
    const draft = { ...draftsRef.current[id], ...override };
    if (Object.keys(draft).length === 0) return;

    const body: Record<string, unknown> = {};
    if (draft.date !== undefined) body.date = draft.date;
    if (draft.amount !== undefined) body.amount = Number(draft.amount);
    if (draft.categoryId !== undefined) body.categoryId = draft.categoryId || null;
    if (draft.walletId !== undefined) body.walletId = draft.walletId || null;
    if (draft.note !== undefined) body.note = draft.note;

    const { row } = await api.patch<{ row: ScheduledEntry }>(
      `/api/schedule/queue/${id}`,
      body,
    );
    setState((s) =>
      s ? { ...s, pending: s.pending.map((p) => (p.id === row.id ? row : p)) } : s,
    );
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  }, []);

  /** Save on leaving a field, reporting a rejection instead of swallowing it. */
  function commit(id: string, override?: Draft) {
    saveRow(id, override).catch((err) =>
      setError(err instanceof Error ? err.message : "Could not save that change"),
    );
  }

  /** A dropdown: remember the choice and write it in the same breath. */
  function pick(id: string, field: "categoryId" | "walletId", value: string) {
    setField(id, field, value);
    commit(id, { [field]: value });
  }

  // ---- acting on the ticked rows ------------------------------------------

  async function review(action: "approve" | "skip" | "restore", ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    setFailures([]);
    try {
      // Anything still being typed is written first, so what gets approved is
      // exactly what is on the screen.
      if (action === "approve") {
        await Promise.all(Object.keys(draftsRef.current).map((id) => saveRow(id)));
      }
      const res = await api.post<ScheduleState>("/api/schedule/review", {
        action,
        ids,
      });
      apply(res);

      const r = res.result;
      if (!r) return;
      if (action === "approve") {
        const parts: string[] = [];
        if (r.earningsCents) parts.push(`${formatPeso(r.earningsCents)} in`);
        if (r.expenseCents) parts.push(`${formatPeso(r.expenseCents)} out`);
        if (r.done > 0) {
          setNotice(
            `Encoded ${r.done} ${r.done === 1 ? "entry" : "entries"}${parts.length ? ` — ${parts.join(", ")}` : ""}. They are in your ledger now.`,
          );
        }
      } else if (r.done > 0) {
        setNotice(
          action === "skip"
            ? `Skipped ${r.done} ${r.done === 1 ? "row" : "rows"} — nothing was encoded.`
            : `Put ${r.done} ${r.done === 1 ? "row" : "rows"} back on the table.`,
        );
      }
      if (r.failed.length) setFailures(r.failed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not do that");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(run: () => Promise<ScheduleState>) {
    setBusy(true);
    setError("");
    try {
      apply(await run());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  // ---- derived ------------------------------------------------------------

  // Memoised so the totals below don't recompute on every keystroke just
  // because `?? []` handed them a brand-new empty array.
  const pending = useMemo(() => state?.pending ?? [], [state]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  /** The row as it stands on screen, draft edits included. */
  const effective = useCallback(
    (row: ScheduledEntry) => {
      const d = drafts[row.id];
      const amount = d?.amount !== undefined ? Number(d.amount) : null;
      return {
        ymd: d?.date ?? ymdFromISO(row.date),
        amountCents:
          amount !== null && Number.isFinite(amount)
            ? Math.round(amount * 100)
            : row.amountCents,
        categoryId: d?.categoryId ?? row.categoryId ?? "",
        walletId: d?.walletId ?? row.walletId ?? "",
        note: d?.note ?? row.note ?? "",
      };
    },
    [drafts],
  );

  const selectedTotals = useMemo(() => {
    let earnings = 0;
    let expense = 0;
    for (const row of pending) {
      if (!selectedSet.has(row.id)) continue;
      const cents = effective(row).amountCents;
      if (row.kind === "EARNING") earnings += cents;
      else expense += cents;
    }
    return { earnings, expense };
  }, [pending, selectedSet, effective]);

  const queueTotals = useMemo(() => {
    let earnings = 0;
    let expense = 0;
    for (const row of pending) {
      const cents = effective(row).amountCents;
      if (row.kind === "EARNING") earnings += cents;
      else expense += cents;
    }
    return { earnings, expense };
  }, [pending, effective]);

  /** Waiting rows grouped by the month they fall in, in date order. */
  const months = useMemo(() => {
    const groups = new Map<string, ScheduledEntry[]>();
    for (const row of pending) {
      const key = ymdFromISO(row.date).slice(0, 7);
      const list = groups.get(key);
      if (list) list.push(row);
      else groups.set(key, [row]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pending]);

  const allTicked = pending.length > 0 && selected.length === pending.length;

  function toggleAll() {
    setSelected(allTicked ? [] : pending.map((p) => p.id));
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  // ---- render -------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const rules = state?.rules ?? [];
  const categories = state?.categories ?? [];
  const wallets = state?.wallets ?? [];

  return (
    <div className="space-y-5">
      <ConfirmModal
        state={confirm}
        loading={confirmLoading}
        onClose={() => setConfirm(null)}
      />

      <div>
        <h1 className="text-xl font-bold text-slate-800">Recurring</h1>
        <p className="mt-1 max-w-[80ch] text-sm text-slate-500">
          The money that moves on the same days every month — payday, the
          allowance, what you set aside for family. Set a rule once and this
          page works out the dates and <strong>puts them in the table below
          for you to check</strong>. Nothing reaches your earnings or expenses
          until you tick it and press Approve, so you can change an amount, a
          date or a category first — or skip a month entirely.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-outflow/30 bg-outflow/10 px-4 py-3 text-sm font-medium text-outflow">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-income/30 bg-income/10 px-4 py-3 text-sm font-medium text-income">
          {notice}
        </p>
      )}
      {failures.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">
            {failures.length} {failures.length === 1 ? "row" : "rows"} could not
            be encoded and {failures.length === 1 ? "is" : "are"} still waiting:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {failures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- the review table ---------------------------------------- */}
      <section className="rounded-2xl border border-slate-200 bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-700">
              Waiting for your approval
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {pending.length === 0
                ? "Nothing waiting."
                : `${pending.length} proposed ${pending.length === 1 ? "row" : "rows"} — ${formatPeso(queueTotals.earnings)} in, ${formatPeso(queueTotals.expense)} out if you approve them all.`}
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark disabled:opacity-50"
          >
            ↻ Check for new dates
          </button>
        </div>

        {pending.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            {rules.length === 0
              ? "Add a rule below and the dates it falls on will show up here first."
              : "Every proposed date has been dealt with. New ones appear as the months roll on."}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={allTicked}
                        onChange={toggleAll}
                        aria-label="Select every waiting row"
                        className="h-4 w-4 cursor-pointer accent-[var(--color-brand)]"
                      />
                    </th>
                    <th className="px-3 py-2.5">When</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Wallet</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5">Note</th>
                    <th className="px-3 py-2.5">From rule</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {months.map(([monthKey, rows]) => (
                    <Fragment key={monthKey}>
                      <tr className="bg-ice/70">
                        <td
                          colSpan={9}
                          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {monthLabel(monthKey)}
                        </td>
                      </tr>
                      {rows.map((row) => {
                        const v = effective(row);
                        const overdue = v.ymd < today;
                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-slate-100 last:border-0 ${
                              selectedSet.has(row.id) ? "bg-brand-light/40" : ""
                            }`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedSet.has(row.id)}
                                onChange={() => toggle(row.id)}
                                aria-label={`Select ${longDayLabel(v.ymd)}`}
                                className="h-4 w-4 cursor-pointer accent-[var(--color-brand)]"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                value={v.ymd}
                                onChange={(e) =>
                                  setField(row.id, "date", e.target.value)
                                }
                                onBlur={() => commit(row.id)}
                                className={`${INPUT} w-[9.5rem]`}
                              />
                              {overdue && (
                                <span className="mt-0.5 block text-[11px] font-medium text-amber-600">
                                  was due {shortDayLabel(v.ymd)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <KindBadge kind={row.kind} />
                            </td>
                            <td className="px-3 py-2">
                              <CategorySelect
                                kind={row.kind}
                                value={v.categoryId}
                                categories={categories}
                                onChange={(val) =>
                                  pick(row.id, "categoryId", val)
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <WalletSelect
                                value={v.walletId}
                                wallets={wallets}
                                onChange={(val) =>
                                  pick(row.id, "walletId", val)
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  drafts[row.id]?.amount ??
                                  String(centsToPesos(row.amountCents))
                                }
                                onChange={(e) =>
                                  setField(row.id, "amount", e.target.value)
                                }
                                onBlur={() => commit(row.id)}
                                className={`${INPUT} w-28 text-right tabular-nums`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={v.note}
                                placeholder="what it was for"
                                onChange={(e) =>
                                  setField(row.id, "note", e.target.value)
                                }
                                onBlur={() => commit(row.id)}
                                className={`${INPUT} w-40`}
                              />
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-400">
                              {row.rule?.name ?? "one-off"}
                              {row.edited && (
                                <span className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-500">
                                  edited
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => review("skip", [row.id])}
                                disabled={busy}
                                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-500 transition hover:border-outflow hover:text-outflow disabled:opacity-50"
                              >
                                Skip
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards — the same fields, stacked */}
            <div className="space-y-3 p-3 md:hidden">
              <label className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={allTicked}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-[var(--color-brand)]"
                />
                Select all {pending.length}
              </label>
              {months.map(([monthKey, rows]) => (
                <div key={monthKey} className="space-y-3">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {monthLabel(monthKey)}
                  </p>
                  {rows.map((row) => {
                    const v = effective(row);
                    return (
                      <div
                        key={row.id}
                        className={`rounded-xl border p-3 ${
                          selectedSet.has(row.id)
                            ? "border-brand bg-brand-light/40"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedSet.has(row.id)}
                            onChange={() => toggle(row.id)}
                            className="h-4 w-4 accent-[var(--color-brand)]"
                          />
                          <KindBadge kind={row.kind} />
                          <span className="ml-auto text-xs text-slate-400">
                            {row.rule?.name ?? "one-off"}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Date
                            <input
                              type="date"
                              value={v.ymd}
                              onChange={(e) =>
                                setField(row.id, "date", e.target.value)
                              }
                              onBlur={() => commit(row.id)}
                              className={`${INPUT} mt-1 font-normal normal-case`}
                            />
                          </label>
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Amount
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                drafts[row.id]?.amount ??
                                String(centsToPesos(row.amountCents))
                              }
                              onChange={(e) =>
                                setField(row.id, "amount", e.target.value)
                              }
                              onBlur={() => commit(row.id)}
                              className={`${INPUT} mt-1 text-right font-normal normal-case tabular-nums`}
                            />
                          </label>
                        </div>

                        <div className="mt-2 space-y-2">
                          <CategorySelect
                            kind={row.kind}
                            value={v.categoryId}
                            categories={categories}
                            onChange={(val) =>
                              pick(row.id, "categoryId", val)
                            }
                          />
                          <WalletSelect
                            value={v.walletId}
                            wallets={wallets}
                            onChange={(val) => pick(row.id, "walletId", val)}
                          />
                          <input
                            type="text"
                            value={v.note}
                            placeholder="what it was for"
                            onChange={(e) =>
                              setField(row.id, "note", e.target.value)
                            }
                            onBlur={() => commit(row.id)}
                            className={INPUT}
                          />
                        </div>

                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => review("skip", [row.id])}
                          disabled={busy}
                          className="mt-3 w-full rounded-lg border border-slate-300 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-outflow hover:text-outflow disabled:opacity-50"
                        >
                          Skip this one
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}

        {/* The one place money is created. Deliberately explicit about it. */}
        {pending.length > 0 && (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-slate-200 bg-ice/90 px-5 py-3 backdrop-blur">
            <p className="text-xs text-slate-500">
              {selected.length === 0 ? (
                "Tick the rows you want encoded."
              ) : (
                <>
                  <strong className="text-slate-700">
                    {selected.length} selected
                  </strong>
                  {selectedTotals.earnings > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-income">
                        {formatPeso(selectedTotals.earnings)} in
                      </span>
                    </>
                  )}
                  {selectedTotals.expense > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-outflow">
                        {formatPeso(selectedTotals.expense)} out
                      </span>
                    </>
                  )}
                </>
              )}
            </p>
            <div className="ml-auto flex gap-2">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => review("skip", selected)}
                disabled={busy || selected.length === 0}
                className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-outflow hover:text-outflow disabled:opacity-40"
              >
                Skip selected
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => review("approve", selected)}
                disabled={busy || selected.length === 0}
                className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-brand-dark disabled:opacity-40"
              >
                {busy ? "Working…" : `Approve ${selected.length || ""}`.trim()}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---- the rules ------------------------------------------------- */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-700">My rules</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {rules.length} of {MAX_SCHEDULE_RULES}. A rule only ever proposes
              — it never encodes anything by itself.
            </p>
          </div>
          {rules.length < MAX_SCHEDULE_RULES && (
            <button
              onClick={() => setShowRuleForm((v) => !v)}
              className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark"
            >
              {showRuleForm ? "Close" : "+ Add a rule"}
            </button>
          )}
        </div>

        {showRuleForm && (
          <RuleForm
            categories={categories}
            wallets={wallets}
            busy={busy}
            onCancel={() => setShowRuleForm(false)}
            onCreate={async (body) => {
              await mutate(() =>
                api.post<ScheduleState>("/api/schedule/rules", body),
              );
              setShowRuleForm(false);
            }}
          />
        )}

        {rules.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-center">
            <p className="text-sm text-slate-500">
              No rules yet. Start with the usual month — payday on the 5th and
              20th, the allowance on the 1st, and what goes out on the same two
              days — then change anything that isn&apos;t right.
            </p>
            <ul className="mx-auto mt-3 max-w-sm space-y-1 text-left text-xs text-slate-500">
              <li>₱8,000 Salary — in, on the 5th and 20th</li>
              <li>₱5,000 Salary Allowance — in, on the 1st</li>
              <li>₱3,000 Hatag Aizel — out, on the 5th and 20th</li>
              <li>₱1,000 Family give — out, on the 5th and 20th</li>
            </ul>
            <button
              onClick={() =>
                mutate(() =>
                  api.post<ScheduleState>("/api/schedule/rules", {
                    preset: "standard",
                  }),
                ).catch(() => {})
              }
              disabled={busy}
              className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-dark disabled:opacity-50"
            >
              Set up these four
            </button>
            <p className="mt-2 text-xs text-slate-400">
              They land as proposals in the table above — still nothing encoded.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                categories={categories}
                wallets={wallets}
                busy={busy}
                onSave={(body) =>
                  mutate(() =>
                    api.patch<ScheduleState>(
                      `/api/schedule/rules/${rule.id}`,
                      body,
                    ),
                  )
                }
                onDelete={() =>
                  setConfirm({
                    title: `Delete "${rule.name}"`,
                    message:
                      "The rule stops proposing, and anything from it still waiting above is taken off the table. Entries you already approved stay in your ledger — this never touches them.",
                    confirmLabel: "Delete rule",
                    danger: true,
                    onConfirm: async () => {
                      setConfirmLoading(true);
                      try {
                        await mutate(() =>
                          api.del<ScheduleState>(
                            `/api/schedule/rules/${rule.id}`,
                          ),
                        );
                        setConfirm(null);
                      } catch {
                        setConfirm(null);
                      } finally {
                        setConfirmLoading(false);
                      }
                    },
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---- what has been decided ------------------------------------- */}
      {(state?.recent.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Recently decided</h2>
          <ul className="mt-3 space-y-2">
            {state!.recent.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0"
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${
                    row.status === "APPROVED"
                      ? "bg-income/15 text-income"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {row.status === "APPROVED" ? "encoded" : "skipped"}
                </span>
                <span className="text-slate-600">
                  {longDayLabel(ymdFromISO(row.date))}
                </span>
                <span className="text-slate-400">
                  {row.category?.name ?? "No category"}
                </span>
                <span
                  className={`ml-auto font-semibold tabular-nums ${
                    row.kind === "EARNING" ? "text-income" : "text-outflow"
                  }`}
                >
                  {row.kind === "EARNING" ? "+" : "−"}
                  {formatPeso(row.amountCents)}
                </span>
                {row.status === "SKIPPED" ? (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => review("restore", [row.id])}
                    disabled={busy}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-500 transition hover:border-brand hover:text-brand-dark disabled:opacity-50"
                  >
                    Put back
                  </button>
                ) : (
                  <Link
                    href={row.kind === "EARNING" ? "/earnings" : "/expenses"}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 transition hover:border-brand hover:text-brand-dark"
                  >
                    View
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---- small shared pieces ---------------------------------------------------

function KindBadge({ kind }: { kind: EntryKind }) {
  return (
    <span
      className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${
        kind === "EARNING"
          ? "bg-income/15 text-income"
          : "bg-outflow/15 text-outflow"
      }`}
    >
      {kind === "EARNING" ? "earning" : "expense"}
    </span>
  );
}

function CategorySelect({
  kind,
  value,
  categories,
  onChange,
  className = "",
}: {
  kind: EntryKind;
  value: string;
  categories: SchedulePickerCategory[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const options = categories.filter((c) => c.kind === kind);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT} ${value ? "" : "text-slate-400"} ${className}`}
    >
      <option value="">No category</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.requiresDetail ? " (needs a note)" : ""}
        </option>
      ))}
    </select>
  );
}

function WalletSelect({
  value,
  wallets,
  onChange,
  className = "",
}: {
  value: string;
  wallets: WalletRef[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${INPUT} ${value ? "" : "text-slate-400"} ${className}`}
    >
      <option value="">No wallet</option>
      {wallets.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}

// ---- one rule --------------------------------------------------------------

type RuleBody = {
  name?: string;
  kind?: EntryKind;
  amount?: number;
  daysOfMonth?: number[];
  note?: string | null;
  categoryId?: string | null;
  walletId?: string | null;
  active?: boolean;
};

function RuleRow({
  rule,
  categories,
  wallets,
  busy,
  onSave,
  onDelete,
}: {
  rule: ScheduleRule;
  categories: SchedulePickerCategory[];
  wallets: WalletRef[];
  busy: boolean;
  onSave: (body: RuleBody) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const warning = shortMonthWarning(rule.daysOfMonth);

  // The page banner already reports what went wrong; this only stops the
  // rejection floating off unhandled.
  const run = (body: RuleBody) => {
    onSave(body).catch(() => {});
  };

  if (editing) {
    return (
      <li className="rounded-xl border border-brand/40 bg-ice/50 p-4">
        <RuleForm
          categories={categories}
          wallets={wallets}
          busy={busy}
          initial={rule}
          onCancel={() => setEditing(false)}
          onCreate={async (body) => {
            await onSave(body);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 ${
        rule.active ? "" : "opacity-60"
      }`}
    >
      <KindBadge kind={rule.kind} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-700">
          {rule.name}
          {!rule.active && (
            <span className="ml-2 text-xs font-medium text-slate-400">
              paused
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          {formatPeso(rule.amountCents)} on {describeDays(rule.daysOfMonth)} of
          every month
          {rule.category ? ` · ${rule.category.name}` : " · no category yet"}
          {rule.wallet ? ` · ${rule.wallet.name}` : ""}
        </p>
        {warning && (
          <p className="mt-0.5 text-xs text-amber-600">{warning}</p>
        )}
        {!rule.category && (
          <p className="mt-0.5 text-xs text-amber-600">
            Pick a category so the proposals land somewhere useful.
          </p>
        )}
      </div>
      {rule.wallet && (
        <WalletAvatar wallet={rule.wallet} size="sm" />
      )}
      <div className="flex gap-2">
        <button
          onClick={() => run({ active: !rule.active })}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark disabled:opacity-50"
        >
          {rule.active ? "Pause" : "Resume"}
        </button>
        <button
          onClick={() => setEditing(true)}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark disabled:opacity-50"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-500 transition hover:border-outflow hover:text-outflow disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function RuleForm({
  categories,
  wallets,
  busy,
  initial,
  onCreate,
  onCancel,
}: {
  categories: SchedulePickerCategory[];
  wallets: WalletRef[];
  busy: boolean;
  initial?: ScheduleRule;
  onCreate: (body: RuleBody) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? "EXPENSE");
  const [amount, setAmount] = useState(
    initial ? String(centsToPesos(initial.amountCents)) : "",
  );
  const [days, setDays] = useState(
    initial ? initial.daysOfMonth.join(", ") : "5, 20",
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [walletId, setWalletId] = useState(initial?.walletId ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [problem, setProblem] = useState("");

  const parsed = parseDaysOfMonth(days);
  const preview = parsed.ok ? describeDays(parsed.days) : null;
  const warning = parsed.ok ? shortMonthWarning(parsed.days) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblem("");
    if (!name.trim()) return setProblem("Give the rule a name you'll recognise");
    if (!parsed.ok) return setProblem(parsed.error);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return setProblem("Enter an amount greater than 0");
    }
    try {
      await onCreate({
        name: name.trim(),
        kind,
        amount: value,
        daysOfMonth: parsed.days,
        note: note.trim() || null,
        categoryId: categoryId || null,
        walletId: walletId || null,
      });
    } catch {
      // The page banner already carries the server's message.
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-500">
          What is it?
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hatag Aizel"
            className={`${INPUT} mt-1 font-normal`}
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Money in or out?
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as EntryKind);
              setCategoryId("");
            }}
            className={`${INPUT} mt-1 font-normal`}
          >
            <option value="EXPENSE">Expense — money out</option>
            <option value="EARNING">Earning — money in</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          How much, in pesos?
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="3000"
            className={`${INPUT} mt-1 font-normal tabular-nums`}
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Which days of the month?
          <input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="5, 20"
            className={`${INPUT} mt-1 font-normal`}
          />
          <span className="mt-1 block font-normal text-slate-400">
            {preview ? `Falls on ${preview}.` : "Numbers from 1 to 31, separated by commas."}
          </span>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Category
          <CategorySelect
            kind={kind}
            value={categoryId}
            categories={categories}
            onChange={setCategoryId}
            className="mt-1 font-normal"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Wallet
          <WalletSelect
            value={walletId}
            wallets={wallets}
            onChange={setWalletId}
            className="mt-1 font-normal"
          />
        </label>
      </div>

      <label className="block text-xs font-semibold text-slate-500">
        Note to copy onto every one
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Hatag kay Aizel"
          className={`${INPUT} mt-1 font-normal`}
        />
      </label>

      {warning && <p className="text-xs text-amber-600">{warning}</p>}
      {problem && (
        <p className="text-xs font-medium text-outflow">{problem}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-dark disabled:opacity-50"
        >
          {initial ? "Save rule" : "Add rule"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Saving a rule only fills the table above. You still approve each date.
      </p>
    </form>
  );
}
