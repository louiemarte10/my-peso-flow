// Starter categories and wallets created for every new account, so the encode
// pages are usable the moment you sign in. Rename, add or archive them later on
// the Categories and Wallets pages.

export type SeedCategory = {
  name: string;
  kind: "EARNING" | "EXPENSE";
  color: string;
  /** Catch-all buckets make the note mandatory — see Category.requiresDetail. */
  requiresDetail?: boolean;
};

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  // Money in
  { name: "Salary", kind: "EARNING", color: "#0078BF" },
  { name: "Freelance", kind: "EARNING", color: "#2E9BD6" },
  { name: "Business", kind: "EARNING", color: "#55A5D4" },
  { name: "Bonus / 13th Month", kind: "EARNING", color: "#1D4ED8" },
  { name: "Other Income", kind: "EARNING", color: "#7DBEE3", requiresDetail: true },

  // Money out
  { name: "Food & Groceries", kind: "EXPENSE", color: "#EF4444" },
  { name: "Transportation", kind: "EXPENSE", color: "#F97316" },
  { name: "Bills & Utilities", kind: "EXPENSE", color: "#EAB308" },
  { name: "Rent", kind: "EXPENSE", color: "#A855F7" },
  { name: "Load & Internet", kind: "EXPENSE", color: "#06B6D4" },
  { name: "Health", kind: "EXPENSE", color: "#10B981" },
  { name: "Family / Padala", kind: "EXPENSE", color: "#EC4899" },
  { name: "Shopping", kind: "EXPENSE", color: "#8B5CF6", requiresDetail: true },
  { name: "Savings & Investment", kind: "EXPENSE", color: "#6366F1" },
  { name: "Fees & Charges", kind: "EXPENSE", color: "#94A3B8" },
  { name: "Others", kind: "EXPENSE", color: "#64748B", requiresDetail: true },
];

export type SeedWallet = {
  name: string;
  type: "BANK" | "EWALLET" | "CASH" | "SAVINGS" | "CREDIT";
  color: string;
  icon: string;
  sortOrder: number;
};

export const DEFAULT_WALLETS: SeedWallet[] = [
  { name: "Cash on Hand", type: "CASH", color: "#0F9D58", icon: "💵", sortOrder: 0 },
  { name: "GCash", type: "EWALLET", color: "#0078BF", icon: "📱", sortOrder: 1 },
  { name: "Security Bank", type: "BANK", color: "#1D4ED8", icon: "🏦", sortOrder: 2 },
  { name: "GoTyme", type: "BANK", color: "#55A5D4", icon: "🏦", sortOrder: 3 },
];

export const WALLET_TYPES = [
  { value: "CASH", label: "Cash", hint: "Physical money in your pocket" },
  { value: "EWALLET", label: "E-wallet", hint: "GCash, Maya, ShopeePay…" },
  { value: "BANK", label: "Bank", hint: "Security Bank, GoTyme, BPI…" },
  { value: "SAVINGS", label: "Savings", hint: "Money you set aside (ipon)" },
  { value: "CREDIT", label: "Credit", hint: "Credit card or credit line" },
] as const;

export const WALLET_COLORS = [
  "#0078BF",
  "#55A5D4",
  "#1D4ED8",
  "#0F9D58",
  "#10B981",
  "#F97316",
  "#EAB308",
  "#A855F7",
  "#EC4899",
  "#64748B",
];

export const WALLET_ICONS = [
  "💵",
  "📱",
  "🏦",
  "💳",
  "🐷",
  "👛",
  "💼",
  "🪙",
  "🏧",
  "⭐",
];
