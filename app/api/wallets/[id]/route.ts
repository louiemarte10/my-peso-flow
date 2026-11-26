import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/api";
import { pesosToCents } from "@/lib/money";
import { walletBalance } from "@/lib/wallets";
import { LIVE } from "@/lib/archive";
import { checkLogo } from "@/lib/logo";
import { logActivity } from "@/lib/activity";
import type { WalletType } from "@/generated/prisma/client";

type Ctx = { params: Promise<{ id: string }> };

const TYPES = ["BANK", "EWALLET", "CASH", "SAVINGS", "CREDIT"] as const;

function parseType(raw: unknown): WalletType | null {
  const s = String(raw ?? "");
  return (TYPES as readonly string[]).includes(s) ? (s as WalletType) : null;
}

/**
 * GET /api/wallets/:id — the wallet, its derived balance, and its full
 * movement ledger (entries + transfers) with a running balance.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const summary = await walletBalance(user.sub, id);
  if (!summary) return notFound("That wallet no longer exists");

  const [entries, transfersOut, transfersIn] = await Promise.all([
    prisma.entry.findMany({
      where: { userId: user.sub, walletId: id, ...LIVE },
      include: { category: { select: { name: true, color: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 400,
    }),
    prisma.transfer.findMany({
      where: { userId: user.sub, fromWalletId: id, ...LIVE },
      include: { toWallet: { select: { name: true, icon: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 400,
    }),
    prisma.transfer.findMany({
      where: { userId: user.sub, toWalletId: id, ...LIVE },
      include: { fromWallet: { select: { name: true, icon: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 400,
    }),
  ]);

  type Movement = {
    id: string;
    source: "entry" | "transfer";
    kind: "EARNING" | "EXPENSE" | "TRANSFER_IN" | "TRANSFER_OUT";
    date: string;
    createdAt: string;
    label: string;
    color: string | null;
    note: string | null;
    amountCents: number;
    feeCents: number;
    /** Signed effect on this wallet's balance. */
    deltaCents: number;
    balanceAfterCents: number;
  };

  const movements: Movement[] = [
    ...entries.map((e) => ({
      id: e.id,
      source: "entry" as const,
      kind: e.kind,
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      label: e.category?.name ?? "Uncategorised",
      color: e.category?.color ?? null,
      note: e.note,
      amountCents: e.amountCents,
      feeCents: 0,
      deltaCents: e.kind === "EARNING" ? e.amountCents : -e.amountCents,
      balanceAfterCents: 0,
    })),
    ...transfersOut.map((t) => ({
      id: t.id,
      source: "transfer" as const,
      kind: "TRANSFER_OUT" as const,
      date: t.date.toISOString(),
      createdAt: t.createdAt.toISOString(),
      label: `Moved to ${t.toWallet.name}`,
      color: null,
      note: t.note,
      amountCents: t.amountCents,
      feeCents: t.feeCents,
      // The fee leaves this wallet too, so it is part of the outflow.
      deltaCents: -(t.amountCents + t.feeCents),
      balanceAfterCents: 0,
    })),
    ...transfersIn.map((t) => ({
      id: t.id,
      source: "transfer" as const,
      kind: "TRANSFER_IN" as const,
      date: t.date.toISOString(),
      createdAt: t.createdAt.toISOString(),
      label: `Moved from ${t.fromWallet.name}`,
      color: null,
      note: t.note,
      amountCents: t.amountCents,
      feeCents: 0,
      deltaCents: t.amountCents,
      balanceAfterCents: 0,
    })),
  ];

  // Newest first.
  movements.sort((a, b) =>
    a.date === b.date
      ? b.createdAt.localeCompare(a.createdAt)
      : b.date.localeCompare(a.date),
  );

  // Walk backwards from today's true balance, so the running figure is right
  // even though the list is capped.
  let running = summary.balanceCents;
  for (const m of movements) {
    m.balanceAfterCents = running;
    running -= m.deltaCents;
  }

  return NextResponse.json({ wallet: summary, movements });
}

/** PATCH /api/wallets/:id */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.wallet.findFirst({
    where: { id, userId: user.sub },
  });
  if (!existing) return notFound("That wallet no longer exists");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const data: {
    name?: string;
    type?: WalletType;
    color?: string | null;
    icon?: string | null;
    logo?: string | null;
    accountRef?: string | null;
    openingBalanceCents?: number;
    lowBalanceCents?: number;
    archivedAt?: Date | null;
    sortOrder?: number;
  } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return badRequest("Enter a wallet name");
    const clash = await prisma.wallet.findFirst({
      where: { userId: user.sub, name, id: { not: id } },
      select: { id: true },
    });
    if (clash) return badRequest(`"${name}" already exists`);
    data.name = name;
  }

  if (body.type !== undefined) {
    const type = parseType(body.type);
    if (!type) return badRequest("Choose a wallet type");
    data.type = type;
  }

  if (body.color !== undefined) {
    data.color = body.color ? String(body.color).trim() : null;
  }
  if (body.icon !== undefined) {
    data.icon = body.icon ? String(body.icon).trim() : null;
  }
  if (body.logo !== undefined) {
    const logo = checkLogo(body.logo);
    if (!logo.ok) return badRequest(logo.error);
    data.logo = logo.value;
  }
  if (body.accountRef !== undefined) {
    data.accountRef = body.accountRef ? String(body.accountRef).trim() : null;
  }
  if (body.openingBalance !== undefined) {
    data.openingBalanceCents = pesosToCents(Number(body.openingBalance) || 0);
  }
  if (body.lowBalance !== undefined) {
    data.lowBalanceCents = pesosToCents(Number(body.lowBalance) || 0);
  }
  if (body.archived !== undefined) {
    data.archivedAt = body.archived ? new Date() : null;
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (Number.isFinite(n)) data.sortOrder = Math.trunc(n);
  }

  if (Object.keys(data).length === 0) return badRequest("Nothing to update");

  await prisma.wallet.update({ where: { id }, data });
  await logActivity(user, {
    action: body.archived === false ? "wallet.restore" : "wallet.update",
    summary: `${body.archived === false ? "Restored" : "Edited"} the wallet "${data.name ?? existing.name}"`,
    targetType: "Wallet",
    targetId: id,
  });
  const wallet = await walletBalance(user.sub, id);
  return NextResponse.json({ wallet });
}

/**
 * DELETE /api/wallets/:id
 * A wallet with history is archived instead of deleted, so past entries keep
 * their labels. ?force=1 deletes it, which also deletes its transfers and
 * leaves its entries without a wallet.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const existing = await prisma.wallet.findFirst({
    where: { id, userId: user.sub },
    include: {
      _count: {
        select: { entries: true, transfersFrom: true, transfersTo: true },
      },
    },
  });
  if (!existing) return notFound("That wallet no longer exists");

  const url = new URL(req.url);
  const force =
    url.searchParams.get("force") === "1" ||
    url.searchParams.get("purge") === "1";

  if (!force) {
    await prisma.wallet.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await logActivity(user, {
      action: "wallet.archive",
      summary: `Archived the wallet "${existing.name}"`,
      targetType: "Wallet",
      targetId: id,
    });
    return NextResponse.json({ archived: true });
  }

  await prisma.wallet.delete({ where: { id } });
  await logActivity(user, {
    action: "wallet.delete",
    summary: `Deleted the wallet "${existing.name}" for good`,
    targetType: "Wallet",
    targetId: id,
  });
  return NextResponse.json({ ok: true, archived: false });
}
