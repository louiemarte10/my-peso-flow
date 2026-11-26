// Small client-side fetch wrapper. Throws on non-2xx with the server message.

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
};

// ---- Shared shapes returned by the API -------------------------------------

export type EntryKind = "EARNING" | "EXPENSE";

export type Category = {
  id: string;
  name: string;
  kind: EntryKind;
  color: string | null;
  archived: boolean;
  _count?: { entries: number };
};

export type Entry = {
  id: string;
  date: string; // ISO instant of 00:00 Manila for that day
  kind: EntryKind;
  amountCents: number;
  note: string | null;
  method: string | null;
  categoryId: string | null;
  category?: { id: string; name: string; color: string | null } | null;
  createdAt: string;
};

export type Totals = {
  earningsCents: number;
  expenseCents: number;
  balanceCents: number;
};

export type Bucket = Totals & {
  key: string; // "YYYY-MM-DD" for day buckets, "YYYY-MM" for month buckets
  label: string;
};

export type CategorySlice = {
  id: string | null;
  name: string;
  color: string | null;
  amountCents: number;
};

export type DashboardData = {
  today: Totals & { key: string; label: string };
  last7: Totals & { from: string; to: string };
  month: Totals & { key: string; label: string };
  year: Totals & { key: string; label: string };
  allTime: Totals & { firstEntry: string | null };
  view: {
    mode: "7d" | "month" | "year";
    label: string;
    from: string;
    to: string;
    totals: Totals;
    buckets: Bucket[];
  };
  topExpenses: CategorySlice[];
  topEarnings: CategorySlice[];
  recent: Entry[];
};
