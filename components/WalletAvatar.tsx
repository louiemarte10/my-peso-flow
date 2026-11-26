/**
 * The little square that identifies a wallet: its uploaded logo if it has one,
 * otherwise the chosen emoji, otherwise a generic purse. Used on the cards, the
 * wallet page header and the ledger tables so a wallet looks the same wherever
 * it appears.
 */
export default function WalletAvatar({
  wallet,
  size = "md",
  className = "",
}: {
  wallet: {
    name: string;
    icon?: string | null;
    logo?: string | null;
    color?: string | null;
  };
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const box = {
    xs: "h-5 w-5 rounded text-[11px]",
    sm: "h-7 w-7 rounded-lg text-sm",
    md: "h-8 w-8 rounded-lg text-base",
    lg: "h-11 w-11 rounded-xl text-xl",
  }[size];

  const tint = `${wallet.color ?? "#0078BF"}22`;

  if (wallet.logo) {
    return (
      // A data URL, so next/image would only add indirection.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={wallet.logo}
        alt=""
        aria-hidden="true"
        className={`${box} shrink-0 object-contain ${className}`}
        style={{ background: tint }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} flex shrink-0 items-center justify-center ${className}`}
      style={{ background: tint }}
    >
      {wallet.icon ?? "👛"}
    </span>
  );
}
