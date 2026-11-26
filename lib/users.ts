import "server-only";
import { prisma } from "./db";
import { DEFAULT_CATEGORIES } from "./defaults";

/** Give a brand-new account its starter categories (idempotent). */
export async function seedCategories(userId: string): Promise<void> {
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })),
    skipDuplicates: true,
  });
}
