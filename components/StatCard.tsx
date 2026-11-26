import { formatPeso } from "@/lib/money";

type Tone = "brand" | "income" | "outflow" | "plain";

const TONES: Record<Tone, { card: string; label: string; value: string }> = {
  brand: {
    card: "border-transparent bg-brand text-white shadow-md",
    label: "text-white/75",
    value: "text-white",
  },
  income: {
    card: "border-slate-200 bg-surface",
    label: "text-slate-500",
    value: "text-income",
  },
  outflow: {
    card: "border-slate-200 bg-surface",
    label: "text-slate-500",
    value: "text-outflow",
  },
  plain: {
    card: "border-slate-200 bg-surface",
    label: "text-slate-500",
    value: "text-slate-800",
  },
};

/**
 * One headline number. `tone` picks the colour: income green, outflow red,
 * brand for the filled accent card, plain for neutral.
 * A balance is rendered green when positive and red when negative.
 */
export default function StatCard({
  label,
  cents,
  tone = "plain",
  hint,
  signed = false,
}: {
  label: string;
  cents: number;
  tone?: Tone;
  hint?: string;
  /** Colour the value by sign (used for balance cards). */
  signed?: boolean;
}) {
  const t = TONES[tone];
  const valueClass =
    signed && tone !== "brand"
      ? cents < 0
        ? "text-outflow"
        : "text-income"
      : t.value;

  return (
    <div className={`rounded-2xl border p-4 ${t.card}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${t.label}`}>
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${valueClass}`}>
        {signed && cents > 0 ? "+" : ""}
        {formatPeso(cents)}
      </p>
      {hint && (
        <p className={`mt-1 text-xs ${tone === "brand" ? "text-white/70" : "text-slate-400"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}
