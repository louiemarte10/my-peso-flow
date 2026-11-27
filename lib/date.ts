// myPesoFlow runs on Philippine time (UTC+8, no DST). These helpers convert
// between a Manila calendar day ("YYYY-MM-DD") and UTC instants for querying
// the `date` column, and for grouping by day / month / year.

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC instant of 00:00 Manila on the given "YYYY-MM-DD" Manila day. */
export function manilaDayStartUTC(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) - MANILA_OFFSET_MS);
}

/** The Manila calendar day ("YYYY-MM-DD") that an instant falls on. */
export function manilaDayKey(instant: Date): string {
  return new Date(instant.getTime() + MANILA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The Manila calendar day for an ISO instant string as the API returns it.
 * NEVER slice an ISO string to get the day: 00:00 Manila serialises as 16:00
 * UTC on the PREVIOUS date, so slicing shifts every date back by one.
 */
export function ymdFromISO(iso: string): string {
  return manilaDayKey(new Date(iso));
}

/** UTC half-open range [gte, lt) covering Manila days from..to (inclusive). */
export function manilaRangeUTC(fromYmd: string, toYmd: string) {
  const gte = manilaDayStartUTC(fromYmd);
  const lt = new Date(manilaDayStartUTC(toYmd).getTime() + DAY_MS);
  return { gte, lt };
}

/** Today's Manila calendar day. */
export function todayKey(): string {
  return manilaDayKey(new Date());
}

/** Shift a "YYYY-MM-DD" Manila day by n days. */
export function addDaysKey(ymd: string, n: number): string {
  return manilaDayKey(new Date(manilaDayStartUTC(ymd).getTime() + n * DAY_MS));
}

/** First day of the month that `ymd` falls in ("2026-11-07" -> "2026-11-01"). */
export function monthStartKey(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** Last day of the month that `ymd` falls in. */
export function monthEndKey(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ymd.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** First day of the year that `ymd` falls in. */
export function yearStartKey(ymd: string): string {
  return `${ymd.slice(0, 4)}-01-01`;
}

/** Last day of the year that `ymd` falls in. */
export function yearEndKey(ymd: string): string {
  return `${ymd.slice(0, 4)}-12-31`;
}

/** Shift a "YYYY-MM" month key by n months. */
export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** True when the string is a valid "YYYY-MM-DD". */
export function isYmd(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Short display label for a Manila day, e.g. "Nov 26". */
export function shortDayLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Long display label for a Manila day, e.g. "Nov 26, 2026". */
export function longDayLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Display label for a "YYYY-MM" month key, e.g. "Nov 2026". */
export function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The Manila wall-clock time of an instant, e.g. "11:42 PM".
 *
 * Shifts into Manila and then reads with UTC getters, so it shows the same
 * time no matter where the browser thinks it is — the whole app is Manila.
 */
export function manilaTimeLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + MANILA_OFFSET_MS);
  const minutes = d.getUTCMinutes();
  const hour24 = d.getUTCHours();
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;
}

/** "just now", "2 min ago", "3 hrs ago", "5 days ago", else the date. */
export function relativeLabel(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return longDayLabel(manilaDayKey(new Date(iso)));
}

/** "Nov 26, 2026, 11:42 PM" — the whole moment, for a tooltip. */
export function fullMomentLabel(iso: string): string {
  return `${longDayLabel(manilaDayKey(new Date(iso)))}, ${manilaTimeLabel(iso)}`;
}
