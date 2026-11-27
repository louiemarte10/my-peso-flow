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
    // A 401 from inside the app means the session ran out while this tab sat
    // open. Send them to sign in rather than showing "Not signed in" on a
    // page they can no longer use. The sign-in endpoints are exempt: a 401
    // there is simply a wrong password.
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      !url.startsWith("/api/auth/") &&
      window.location.pathname !== "/login"
    ) {
      window.location.href = "/login?timeout=1";
    }
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

export type WalletType = "BANK" | "EWALLET" | "CASH" | "SAVINGS" | "CREDIT";

export type Category = {
  id: string;
  name: string;
  kind: EntryKind;
  color: string | null;
  archived: boolean;
  archivedAt?: string | null;
  /** Catch-all category: the note is mandatory when encoding against it. */
  requiresDetail: boolean;
  /** Monthly spending cap in centavos, or null for no limit. Expenses only. */
  monthlyLimitCents?: number | null;
  /** Spent against this category so far this Manila month, in centavos. */
  spentThisMonthCents?: number;
  _count?: { entries: number };
};

export type Role = "ADMIN" | "USER";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  imageUrl: string | null;
  createdAt: string;
  googleLinked: boolean;
  _count: { entries: number; wallets: number };
};

export type WalletRef = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  logo?: string | null;
};

/** A wallet plus everything derived from its movements. */
export type Wallet = {
  id: string;
  name: string;
  type: WalletType;
  color: string | null;
  icon: string | null;
  /** Uploaded logo as a data URL; takes precedence over `icon`. */
  logo: string | null;
  accountRef: string | null;
  openingBalanceCents: number;
  lowBalanceCents: number;
  archived: boolean;
  sortOrder: number;

  balanceCents: number;
  earningsCents: number;
  expenseCents: number;
  transferInCents: number;
  transferOutCents: number;
  feesCents: number;
  archivedAt: string | null;
  movementCount: number;

  recentSpendCents: number;
  avgDailySpendCents: number;
  runwayDays: number | null;
  low: boolean;
};

export type WalletTotals = {
  totalCents: number;
  walletCount: number;
  lowCount: number;
};

export type Entry = {
  id: string;
  date: string; // ISO instant of 00:00 Manila for that day
  kind: EntryKind;
  amountCents: number;
  note: string | null;
  categoryId: string | null;
  category?: { id: string; name: string; color: string | null } | null;
  walletId: string | null;
  wallet?: WalletRef | null;
  archivedAt?: string | null;
  createdAt: string;
};

export type Transfer = {
  id: string;
  date: string;
  amountCents: number;
  feeCents: number;
  note: string | null;
  fromWalletId: string;
  toWalletId: string;
  fromWallet: WalletRef;
  toWallet: WalletRef;
  archivedAt?: string | null;
  createdAt: string;
};

/** One row of a wallet's ledger — an entry or one side of a transfer. */
export type Movement = {
  id: string;
  source: "entry" | "transfer";
  kind: EntryKind | "TRANSFER_IN" | "TRANSFER_OUT";
  date: string;
  createdAt: string;
  label: string;
  color: string | null;
  note: string | null;
  amountCents: number;
  feeCents: number;
  deltaCents: number;
  balanceAfterCents: number;
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

/** One expense category's monthly cap, with the month's spend against it. */
export type CategoryLimit = {
  id: string;
  name: string;
  color: string | null;
  limitCents: number;
  spentCents: number;
};

export type DashboardData = {
  limits?: CategoryLimit[];
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
  wallets: Wallet[];
  walletTotals: WalletTotals;
};

/** Everything one person has archived, as the Archived page needs it. */
export type ArchiveData = {
  entries: Entry[];
  transfers: Transfer[];
  categories: Category[];
  wallets: (Wallet & { movementCount: number })[];
  counts: {
    entries: number;
    transfers: number;
    categories: number;
    wallets: number;
    total: number;
  };
};

/** An admin's read-only view of one person's books. */
export type UserOverview = {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
    imageUrl: string | null;
    createdAt: string;
  };
  today: Totals;
  last7: Totals;
  month: Totals;
  year: Totals;
  allTime: Totals & { firstEntry: string | null };
  wallets: Wallet[];
  walletTotals: WalletTotals;
  recent: Entry[];
};

export type ActivityLog = {
  id: string;
  createdAt: string;
  actorName: string;
  actorEmail: string;
  action: string;
  summary: string;
  targetType: string | null;
  targetId: string | null;
  impersonatedByEmail: string | null;
  userId: string | null;
};

export type ActivityPerson = { id: string; name: string; email: string };

export const WALLET_TYPE_LABEL: Record<WalletType, string> = {
  BANK: "Bank",
  EWALLET: "E-wallet",
  CASH: "Cash",
  SAVINGS: "Savings",
  CREDIT: "Credit",
};
