import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "./db";
import { DEFAULT_CATEGORIES, DEFAULT_WALLETS } from "./defaults";

/**
 * Just the model delegates we touch, so this accepts either the long-lived
 * `prisma` client or a transaction handle from `prisma.$transaction`.
 */
type SeedClient = Pick<PrismaClient, "category" | "wallet">;

/**
 * Give a brand-new account its starter categories and wallets (idempotent).
 *
 * Pass a transaction handle when creating an account, so a failure here rolls
 * the whole account back instead of leaving a half-built one behind.
 */
export async function seedStarterData(
  userId: string,
  client: SeedClient = prisma,
): Promise<void> {
  await client.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })),
    skipDuplicates: true,
  });
  await client.wallet.createMany({
    data: DEFAULT_WALLETS.map((w) => ({ ...w, userId })),
    skipDuplicates: true,
  });
}

/** @deprecated kept for older call sites — use seedStarterData. */
export const seedCategories = seedStarterData;
