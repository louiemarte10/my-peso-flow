import "server-only";
import { prisma } from "./db";
import { DEFAULT_CATEGORIES, DEFAULT_WALLETS } from "./defaults";

/** Give a brand-new account its starter categories and wallets (idempotent). */
export async function seedStarterData(userId: string): Promise<void> {
  await Promise.all([
    prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })),
      skipDuplicates: true,
    }),
    prisma.wallet.createMany({
      data: DEFAULT_WALLETS.map((w) => ({ ...w, userId })),
      skipDuplicates: true,
    }),
  ]);
}

/** @deprecated kept for older call sites — use seedStarterData. */
export const seedCategories = seedStarterData;
