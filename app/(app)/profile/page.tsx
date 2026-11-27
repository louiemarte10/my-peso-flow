"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Role, type WalletRef } from "@/lib/client";
import { formatPeso } from "@/lib/money";
import {
  fullMomentLabel,
  longDayLabel,
  monthLabel,
  relativeLabel,
  ymdFromISO,
} from "@/lib/date";
import { SESSION_IDLE_LABEL } from "@/lib/session-public";
import { Skeleton } from "@/components/Skeleton";
import WalletAvatar from "@/components/WalletAvatar";
import BudgetBar, { budgetState } from "@/components/BudgetBar";

type Profile = {
  account: {
    id: string;
    name: string;
    email: string;
    role: Role;
    imageUrl: string | null;
    createdAt: string | null;
    signInMethods: { password: boolean; google: boolean };
    impersonatedBy: string | null;
  };
  counts: {
    wallets: number;
    walletsArchived: number;
    walletLimit: number | null;
    categories: number;
    categoriesArchived: number;
    categoryLimit: number | null;
    earningCategories: number;
    expenseCategories: number;
    transactions: number;
    transactionsArchived: number;
    earnings: number;
    expenses: number;
    transfers: number;
  };
  money: {
    earningsCents: number;
    expenseCents: number;
    balanceCents: number;
    walletTotalCents: number;
    lowWallets: number;
    month: {
      from: string;
      earningsCents: number;
      expenseCents: number;
      balanceCents: number;
      daysEncoded: number;
    };
  };
  limits: {
    id: string;
    name: string;
    color: string | null;
    limitCents: number;
    spentCents: number;
  }[];
  habits: {
    firstEntry: string | null;
    daysTracking: number;
    topCategories: {
      name: string;
      color: string | null;
      totalCents: number;
      count: number;
    }[];
    biggestExpense: {
      amountCents: number;
      note: string | null;
      date: string;
      category: string;
    } | null;
    biggestEarning: {
      amountCents: number;
      note: string | null;
      date: string;
      category: string;
    } | null;
  };
  wallets: (WalletRef & { balanceCents: number; low: boolean })[];
  recentActivity: {
    id: string;
    action: string;
    summary: string;
    createdAt: string;
    impersonatedByEmail: string | null;
  }[];
};

export default function ProfilePage() {
  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api.get<Profile>("/api/profile"));
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

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error || "Could not load your profile."}
      </div>
    );
  }

  const { account, counts, money, habits, wallets, recentActivity } = data;
  const limits = data.limits ?? [];
  const overLimit = limits.filter(
    (l) => budgetState(l.spentCents, l.limitCents) === "over",
  );
  const nearLimit = limits.filter(
    (l) => budgetState(l.spentCents, l.limitCents) === "near",
  );

  const initials = account.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const signIn = [
    account.signInMethods.password && "email and password",
    account.signInMethods.google && "Google",
  ]
    .filter(Boolean)
    .join(" or ");

  return (
    <div className="space-y-5">
      {/* ── Who you are ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-4 sm:basis-auto">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-light text-xl font-bold text-brand-dark">
            {account.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials || "?"
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-slate-800">
                {account.name}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  account.role === "ADMIN"
                    ? "bg-brand-light text-brand-dark"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {account.role === "ADMIN" ? "Admin" : "User"}
              </span>
            </div>
            <p className="truncate text-sm text-slate-500">{account.email}</p>
            <p className="mt-1 text-xs text-slate-400">
              {account.createdAt && (
                <>Joined {longDayLabel(ymdFromISO(account.createdAt))} · </>
              )}
              Signs in with {signIn || "Google"}
              {habits.daysTracking > 0 && (
                <> · Tracking for {habits.daysTracking} days</>
              )}
            </p>
          </div>
          </div>

          <Link
            href="/settings"
            className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand-dark sm:w-auto"
          >
            Edit account
          </Link>
        </div>

        {account.impersonatedBy && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            You are viewing this account through <strong>Log in as</strong>, as{" "}
            {account.impersonatedBy}. Anything you do here is recorded under
            that name.
          </p>
        )}
      </div>

      {/* ── What you have ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <CountCard
          href="/wallets"
          label="Wallets"
          value={counts.wallets}
          limit={counts.walletLimit}
          sub={
            counts.walletsArchived > 0
              ? `${counts.walletsArchived} archived`
              : "None archived"
          }
          icon="👛"
        />
        <CountCard
          href="/categories"
          label="Categories"
          value={counts.categories}
          limit={counts.categoryLimit}
          sub={`${counts.earningCategories} earning · ${counts.expenseCategories} expense`}
          icon="🏷️"
        />
        <CountCard
          href="/history"
          label="Transactions"
          value={counts.transactions}
          limit={null}
          sub={`${counts.earnings} earnings · ${counts.expenses} expenses${
            counts.transfers > 0 ? ` · ${counts.transfers} moves` : ""
          }`}
          icon="📅"
        />
      </div>

      {/* ── Your money ────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">All time</h2>
          <div className="mt-3 space-y-2 text-sm">
            <Row
              label="Earnings"
              value={`+${formatPeso(money.earningsCents)}`}
              className="text-income"
            />
            <Row
              label="Expenses"
              value={`−${formatPeso(money.expenseCents)}`}
              className="text-outflow"
            />
            <div className="border-t border-slate-100 pt-2">
              <Row
                label="Net"
                value={formatPeso(money.balanceCents)}
                className={
                  money.balanceCents < 0 ? "text-outflow" : "text-income"
                }
                bold
              />
            </div>
            {habits.firstEntry && (
              <p className="pt-1 text-xs text-slate-400">
                Since your first entry on {longDayLabel(habits.firstEntry)}.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">
            {monthLabel(money.month.from.slice(0, 7))} so far
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            <Row
              label="Earnings"
              value={`+${formatPeso(money.month.earningsCents)}`}
              className="text-income"
            />
            <Row
              label="Expenses"
              value={`−${formatPeso(money.month.expenseCents)}`}
              className="text-outflow"
            />
            <div className="border-t border-slate-100 pt-2">
              <Row
                label="Net"
                value={formatPeso(money.month.balanceCents)}
                className={
                  money.month.balanceCents < 0 ? "text-outflow" : "text-income"
                }
                bold
              />
            </div>
            <p className="pt-1 text-xs text-slate-400">
              You encoded something on {money.month.daysEncoded} day
              {money.month.daysEncoded === 1 ? "" : "s"} this month.
            </p>
          </div>
        </div>
      </div>

      {/* ── Monthly limits ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-700">
            This month&apos;s limits
          </h2>
          {limits.length > 0 && (
            <span
              className={`text-xs font-semibold ${
                overLimit.length
                  ? "text-outflow"
                  : nearLimit.length
                    ? "text-amber-700"
                    : "text-income"
              }`}
            >
              {overLimit.length
                ? `${overLimit.length} over budget`
                : nearLimit.length
                  ? `${nearLimit.length} close to the limit`
                  : "All within budget"}
            </span>
          )}
        </div>

        {limits.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No limits set yet. Put a monthly cap on a category — cigarettes,
            beer, softdrinks — on the{" "}
            <Link href="/categories" className="text-brand hover:underline">
              Categories
            </Link>{" "}
            page, and you will see where you stand here and every time you
            encode.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {limits.map((l) => (
              <li key={l.id}>
                <div className="flex items-center gap-1.5 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: l.color ?? "#64748B" }}
                  />
                  <span className="truncate text-slate-700">{l.name}</span>
                </div>
                <BudgetBar
                  spentCents={l.spentCents}
                  limitCents={l.limitCents}
                  className="mt-1"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Wallets ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-700">Your wallets</h2>
          <span className="text-sm font-bold tabular-nums text-slate-700">
            {formatPeso(money.walletTotalCents)}
          </span>
        </div>
        {wallets.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No wallets yet.{" "}
            <Link href="/wallets" className="text-brand hover:underline">
              Add one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {wallets.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-2.5">
                <WalletAvatar wallet={w} size="xs" />
                <Link
                  href={`/wallets/${w.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-slate-700 hover:text-brand-dark hover:underline"
                >
                  {w.name}
                </Link>
                {w.low && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                    Low
                  </span>
                )}
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    w.balanceCents < 0 ? "text-outflow" : "text-slate-700"
                  }`}
                >
                  {formatPeso(w.balanceCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Where it goes ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">
            Where your money goes
          </h2>
          {habits.topCategories.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Nothing encoded yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {habits.topCategories.map((c) => {
                const biggest = habits.topCategories[0].totalCents || 1;
                return (
                  <li key={c.name}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: c.color ?? "#64748B" }}
                        />
                        <span className="truncate text-slate-700">
                          {c.name}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          ×{c.count}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-outflow">
                        {formatPeso(c.totalCents)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ice">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(3, (c.totalCents / biggest) * 100)}%`,
                          background: c.color ?? "#64748B",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700">Your records</h2>
          <div className="mt-3 space-y-3 text-sm">
            {habits.biggestEarning ? (
              <Extreme
                label="Biggest earning"
                amount={`+${formatPeso(habits.biggestEarning.amountCents)}`}
                className="text-income"
                detail={`${habits.biggestEarning.category}${
                  habits.biggestEarning.note
                    ? ` · ${habits.biggestEarning.note}`
                    : ""
                }`}
                when={longDayLabel(ymdFromISO(habits.biggestEarning.date))}
              />
            ) : (
              <p className="text-slate-400">No earnings encoded yet.</p>
            )}
            {habits.biggestExpense ? (
              <Extreme
                label="Biggest expense"
                amount={`−${formatPeso(habits.biggestExpense.amountCents)}`}
                className="text-outflow"
                detail={`${habits.biggestExpense.category}${
                  habits.biggestExpense.note
                    ? ` · ${habits.biggestExpense.note}`
                    : ""
                }`}
                when={longDayLabel(ymdFromISO(habits.biggestExpense.date))}
              />
            ) : (
              <p className="text-slate-400">No expenses encoded yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── What you have been doing ──────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">
          Your recent activity
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          The last few things you did in myPesoFlow — only yours.
        </p>
        {recentActivity.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Nothing here yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {recentActivity.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 py-2.5 text-sm"
              >
                <span className="min-w-0 text-slate-700">
                  {a.summary}
                  {a.impersonatedByEmail && (
                    <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                      via {a.impersonatedByEmail}
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 whitespace-nowrap text-xs text-slate-400"
                  title={fullMomentLabel(a.createdAt)}
                >
                  {relativeLabel(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Account safety ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-700">Account & security</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-500">
          <li>
            You sign in with <strong className="text-slate-700">{signIn}</strong>
            . Change your email or password on the{" "}
            <Link href="/settings" className="text-brand hover:underline">
              Settings
            </Link>{" "}
            page.
          </li>
          <li>
            You are signed out automatically after{" "}
            <strong className="text-slate-700">{SESSION_IDLE_LABEL}</strong>{" "}
            without activity.
          </li>
          <li>
            Your books are yours alone — wallets, categories and entries are
            never shared with another account.
          </li>
        </ul>
      </div>
    </div>
  );
}

function CountCard({
  href,
  label,
  value,
  limit,
  sub,
  icon,
}: {
  href: string;
  label: string;
  value: number;
  /** Shown as "of 15" when the account is capped. */
  limit: number | null;
  sub: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition hover:border-brand"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon} {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-800">
        {value}
        {limit !== null && (
          <span className="ml-1 text-sm font-semibold text-slate-400">
            of {limit}
          </span>
        )}
      </p>
      <p className="mt-0.5 truncate text-xs text-slate-400">{sub}</p>
    </Link>
  );
}

function Row({
  label,
  value,
  className,
  bold,
}: {
  label: string;
  value: string;
  className: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={bold ? "font-semibold text-slate-700" : "text-slate-500"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${bold ? "text-base font-bold" : "font-semibold"} ${className}`}
      >
        {value}
      </span>
    </div>
  );
}

function Extreme({
  label,
  amount,
  className,
  detail,
  when,
}: {
  label: string;
  amount: string;
  className: string;
  detail: string;
  when: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-slate-500">{label}</span>
        <span className={`font-bold tabular-nums ${className}`}>{amount}</span>
      </div>
      <p className="truncate text-xs text-slate-400">
        {detail} · {when}
      </p>
    </div>
  );
}
