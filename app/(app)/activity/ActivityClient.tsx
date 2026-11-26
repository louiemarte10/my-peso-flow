"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ActivityLog, type ActivityPerson } from "@/lib/client";
import { Skeleton } from "@/components/Skeleton";

/** Groups shown as filter chips, matched as a prefix on the action. */
const GROUPS: { label: string; value: string }[] = [
  { label: "Everything", value: "" },
  { label: "Sign-ins", value: "auth" },
  { label: "Earnings", value: "earning" },
  { label: "Expenses", value: "expense" },
  { label: "Entries", value: "entry" },
  { label: "Moves", value: "transfer" },
  { label: "Wallets", value: "wallet" },
  { label: "Categories", value: "category" },
  { label: "Accounts", value: "account" },
  { label: "Admin", value: "admin" },
];

/** A dot colour per family of action, so the list scans quickly. */
function toneFor(action: string): string {
  if (action.startsWith("admin")) return "#A855F7";
  if (action.startsWith("auth") || action.startsWith("account")) return "#0078BF";
  if (action.includes("delete")) return "#E5484D";
  if (action.includes("archive")) return "#F97316";
  if (action.includes("restore")) return "#0F9D58";
  if (action.startsWith("earning")) return "#0F9D58";
  if (action.startsWith("expense")) return "#E5484D";
  return "#64748B";
}

/** "2 minutes ago", "3 hours ago", "12 Nov" — the log is read newest-first. */
function whenLabel(iso: string): string {
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ActivityClient() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [people, setPeople] = useState<ActivityPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [group, setGroup] = useState("");
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  // Only fire a request once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const query = useCallback(
    (cursor?: string) => {
      const p = new URLSearchParams();
      if (group) p.set("action", group);
      if (userId) p.set("userId", userId);
      if (search) p.set("q", search);
      if (cursor) p.set("cursor", cursor);
      return `/api/activity?${p}`;
    },
    [group, userId, search],
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api.get<{
        logs: ActivityLog[];
        people: ActivityPerson[];
        total: number;
        nextCursor: string | null;
      }>(query());
      setLogs(d.logs);
      setPeople(d.people);
      setTotal(d.total);
      setNextCursor(d.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const d = await api.get<{
        logs: ActivityLog[];
        nextCursor: string | null;
      }>(query(nextCursor));
      setLogs((prev) => [...prev, ...d.logs]);
      setNextCursor(d.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Activity</h1>
        <p className="mt-1 max-w-[75ch] text-sm text-slate-500">
          Everything anyone has done, newest first — including your own admin
          actions. Entries themselves stay private: this records that something
          was encoded, not the contents of anyone&apos;s ledger.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              onClick={() => setGroup(g.value)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                group === g.value
                  ? "border-brand bg-brand text-white"
                  : "border-slate-300 bg-surface text-slate-600 hover:border-brand hover:text-brand-dark"
              }`}
            >
              {g.label}
            </button>
          ))}

          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-surface px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-brand"
          >
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="ml-auto w-full max-w-xs rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>

        <p className="mb-3 text-xs text-slate-400">
          {loading ? "Loading…" : `${total} record${total === 1 ? "" : "s"}`}
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Nothing matches that filter yet.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {logs.map((l) => (
                <li key={l.id} className="flex items-start gap-3 py-3">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: toneFor(l.action) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">{l.actorName}</span>{" "}
                      {l.summary}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {l.actorEmail} · {l.action}
                      {l.impersonatedByEmail && (
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                          via {l.impersonatedByEmail}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-xs text-slate-400"
                    title={new Date(l.createdAt).toLocaleString("en-PH")}
                  >
                    {whenLabel(l.createdAt)}
                  </span>
                </li>
              ))}
            </ul>

            {nextCursor && (
              <div className="mt-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand hover:text-brand-dark disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load older"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
