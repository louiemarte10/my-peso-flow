/**
 * Creates your first myPesoFlow account plus its starter categories.
 * Run once after `npm run db:push`:
 *
 *   npm run db:seed
 *
 * Credentials come from SEED_EMAIL / SEED_PASSWORD / SEED_NAME in .env.
 * Running it again is safe: an existing account is left alone and only the
 * missing categories are added.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_CATEGORIES } from "../lib/defaults";

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

  const { count } = await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id })),
    skipDuplicates: true,
  });

  console.log(
    existing
      ? `Account ${email} already existed — left as is.`
      : `Created account ${email} with password: ${password}`,
  );
  console.log(`Added ${count} categor${count === 1 ? "y" : "ies"}.`);
  if (!existing) {
    console.log("Sign in, then change the password under Settings.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
