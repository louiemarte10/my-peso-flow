// Starter categories created for every new account, so the encode pages are
// usable the moment you sign in. You can rename, add or archive them later on
// the Categories page.

export type SeedCategory = {
  name: string;
  kind: "EARNING" | "EXPENSE";
  color: string;
};

export const DEFAULT_CATEGORIES: SeedCategory[] = [
  // Money in
  { name: "Salary", kind: "EARNING", color: "#0078BF" },
  { name: "Freelance", kind: "EARNING", color: "#2E9BD6" },
  { name: "Business", kind: "EARNING", color: "#55A5D4" },
  { name: "Bonus / 13th Month", kind: "EARNING", color: "#1D4ED8" },
  { name: "Other Income", kind: "EARNING", color: "#7DBEE3" },

  // Money out
  { name: "Food & Groceries", kind: "EXPENSE", color: "#EF4444" },
  { name: "Transportation", kind: "EXPENSE", color: "#F97316" },
  { name: "Bills & Utilities", kind: "EXPENSE", color: "#EAB308" },
  { name: "Rent", kind: "EXPENSE", color: "#A855F7" },
  { name: "Load & Internet", kind: "EXPENSE", color: "#06B6D4" },
  { name: "Health", kind: "EXPENSE", color: "#10B981" },
  { name: "Family / Padala", kind: "EXPENSE", color: "#EC4899" },
  { name: "Savings & Investment", kind: "EXPENSE", color: "#6366F1" },
  { name: "Others", kind: "EXPENSE", color: "#64748B" },
];

/** Payment / channel options offered on the encode forms. */
export const METHODS = ["Cash", "GCash", "Maya", "Bank", "Card", "Other"];
