import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, getCurrentUserRecord } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/api";
import { pesosToCents } from "@/lib/money";
import { walletSummaries } from "@/lib/wallets";
import { checkLogo } from "@/lib/logo";
import { logActivity } from "@/lib/activity";
import { USER_WALLET_LIMIT } from "@/lib/config";
import type { WalletType } from "@/generated/prisma/client";

const TYPES = ["BANK", "EWALLET", "CASH", "SAVINGS", "CREDIT"] as const;

function parseType(raw: unknown): WalletType | null {
  const s = String(raw ?? "");
  return (TYPES as readonly string[]).includes(s) ? (s as WalletType) : null;
}

/** GET /api/wallets?includeArchived=1 — every wallet with its derived balance. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const includeArchived =
    new URL(req.url).searchParams.get("includeArchived") === "1";

  const wallets = await walletSummaries(user.sub, { includeArchived });

  const active = wallets.filter((w) => !w.archived);
  const totalCents = active.reduce((sum, w) => sum + w.balanceCents, 0);

  return NextResponse.json({
    wallets,
    totals: {
      totalCents,
      walletCount: active.length,
      lowCount: active.filter((w) => w.low).length,
    },
  });
}

/** POST /api/wallets */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const name = String(body.name ?? "").trim();
  if (!name) return badRequest("Enter a wallet name");

  // Plain accounts are capped; admins are not. The role is read from the
  // database rather than the cookie, so a stale session cannot lift the cap.
  // Archived wallets are excluded: archiving one frees a slot immediately.
  const me = await getCurrentUserRecord();
  if (me && me.role !== "ADMIN") {
    const live = await prisma.wallet.count({
      where: { userId: user.sub, archivedAt: null },
    });
    if (live >= USER_WALLET_LIMIT) {
      return badRequest(
        `You already have ${live} of ${USER_WALLET_LIMIT} wallets. ` +
          `Archive one you no longer use, then add this.`,
      );
    }
  }

  const type = parseType(body.type);
  if (!type) return badRequest("Choose a wallet type");

  const duplicate = await prisma.wallet.findFirst({
    where: { userId: user.sub, name },
    select: { id: true },
  });
  if (duplicate) return badRequest(`"${name}" already exists`);

  const logo = checkLogo(body.logo);
  if (!logo.ok) return badRequest(logo.error);

  const count = await prisma.wallet.count({ where: { userId: user.sub } });

  const wallet = await prisma.wallet.create({
    data: {
      userId: user.sub,
      name,
      type,
      color: body.color ? String(body.color).trim() : null,
      icon: body.icon ? String(body.icon).trim() : null,
      logo: logo.value,
      accountRef: body.accountRef ? String(body.accountRef).trim() : null,
      openingBalanceCents: pesosToCents(Number(body.openingBalance) || 0),
      lowBalanceCents: pesosToCents(Number(body.lowBalance) || 0),
      sortOrder: count,
    },
  });

  await logActivity(user, {
    action: "wallet.create",
    summary: `Added the wallet "${wallet.name}"`,
    targetType: "Wallet",
    targetId: wallet.id,
  });

  return NextResponse.json({ wallet }, { status: 201 });
}
