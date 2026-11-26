// Money is stored as integer centavos everywhere in the DB/API.
// These helpers convert to/from pesos and format for display.

/** Convert centavos to a peso number (e.g. 3500 -> 35). */
export function centsToPesos(cents: number): number {
  return Math.round(cents) / 100;
}

/** Convert a peso amount (number or string) to integer centavos. */
export function pesosToCents(pesos: number | string): number {
  const n = typeof pesos === "string" ? parseFloat(pesos) : pesos;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Format centavos as a Philippine peso string, e.g. "P1,250.00". */
export function formatPeso(cents: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centsToPesos(cents));
}

/** Compact peso for chart axes and tight cards, e.g. "12.5k". */
export function formatPesoShort(cents: number): string {
  const pesos = centsToPesos(cents);
  const abs = Math.abs(pesos);
  const sign = pesos < 0 ? "-" : "";
  const peso = "₱";
  if (abs >= 1_000_000) return `${sign}${peso}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${peso}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${peso}${abs.toFixed(0)}`;
}
