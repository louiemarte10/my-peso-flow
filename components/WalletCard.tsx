import Link from "next/link";
import { WALLET_TYPE_LABEL, type Wallet } from "@/lib/client";
import { formatPeso } from "@/lib/money";

/** One wallet tile: balance, type, and how long it lasts at your recent rate. */
export default function WalletCard({
  wallet,
  href,
  compact = false,
}: {
  wallet: Wallet;
  href?: string;
  compact?: boolean;
}) {
  const accent = wallet.color ?? "#0078BF";

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
            style={{ background: `${accent}22` }}
          >
            {wallet.icon ?? "👛"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {wallet.name}
            </p>
            <p className="truncate text-[11px] text-slate-400">
              {WALLET_TYPE_LABEL[wallet.type]}
              {wallet.accountRef ? ` · ${wallet.accountRef}` : ""}
            </p>
          </div>
        </div>
        {wallet.low && (
          <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">
            Low
          </span>
        )}
      </div>

      <p
        className={`mt-3 text-xl font-bold tabular-nums ${
          wallet.balanceCents < 0 ? "text-outflow" : "text-slate-800"
        }`}
      >
        {formatPeso(wallet.balanceCents)}
      </p>

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span>
            Spends{" "}
            <strong className="font-semibold text-slate-500">
              {formatPeso(wallet.avgDailySpendCents)}
            </strong>
            /day
          </span>
          {wallet.runwayDays !== null && (
            <span>
              ·{" "}
              <strong
                className={`font-semibold ${
                  wallet.runwayDays <= 7 ? "text-outflow" : "text-slate-500"
                }`}
              >
                {wallet.runwayDays}d
              </strong>{" "}
              left at that rate
            </span>
          )}
        </div>
      )}

      {/* Accent strip so each wallet is recognisable at a glance. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-2xl"
        style={{ background: accent }}
      />
    </>
  );

  const className =
    "relative block rounded-2xl border border-slate-200 bg-surface p-4 pt-5 shadow-sm transition hover:border-brand hover:shadow-md";

  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
