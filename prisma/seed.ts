/**
 * Creates your first myPesoFlow account plus its starter categories and wallets.
 * Run once after `npm run db:push`:
 *
 *   npm run db:seed
 *
 * Credentials come from SEED_EMAIL / SEED_PASSWORD / SEED_NAME in .env.
 * Running it again is safe: an existing account is left alone and only the
 * missing categories and wallets are added.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_CATEGORIES, DEFAULT_WALLETS } from "../lib/defaults";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set DATABASE_URL (and ideally DIRECT_URL) in your .env");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const email = (process.env.SEED_EMAIL ?? "me@pesoflow.local").toLowerCase();
  const name = process.env.SEED_NAME ?? "Me";
  const password = process.env.SEED_PASSWORD ?? "pesoflow123";

  const existing = await prisma.user.findUnique({ where: { email } });

  const user = existing
    ? existing
    : await prisma.user.create({
        data: {
          email,
          name,
          role: "ADMIN",
          passwordHash: await bcrypt.hash(password, 10),
        },
      });

  const [categories, wallets] = await Promise.all([
    prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })),
      skipDuplicates: true,
    }),
    prisma.wallet.createMany({
      data: DEFAULT_WALLETS.map((w) => ({ ...w, userId: user.id })),
      skipDuplicates: true,
    }),
  ]);

  console.log(
    existing
      ? `Account ${email} already existed - left as is.`
      : `Created account ${email} with password: ${password}`,
  );
  // Bring existing installs in line: the catch-all buckets should demand a
  // description. createMany above skips rows that already exist, so set it here.
  let flagged = 0;
  for (const c of DEFAULT_CATEGORIES.filter((c) => c.requiresDetail)) {
    const r = await prisma.category.updateMany({
      where: { userId: user.id, kind: c.kind, name: c.name },
      data: { requiresDetail: true },
    });
    flagged += r.count;
  }

  console.log(`Added ${categories.count} categories and ${wallets.count} wallets.`);
  console.log(`${flagged} catch-all categories now require a description.`);
  if (!existing) {
    console.log("Sign in, then change the password under Settings.");
  }
  console.log(
    "Tip: set each wallet's opening balance on the Wallets page so the running balances match real life.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
