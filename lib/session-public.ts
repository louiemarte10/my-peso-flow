// The handful of session facts the browser is allowed to know, kept apart
// from lib/session.ts so a client component can import them without pulling
// `jose` and the signing secret into the browser bundle.

/**
 * How long a session survives with no activity: four hours.
 *
 * This is an IDLE timeout, not a fixed lifetime. Every page view and every
 * API call re-issues the cookie (see proxy.ts), so the four hours always run
 * from the last thing the person actually did. Stop using the app — or close
 * the browser — and the session is gone four hours later.
 */
export const SESSION_IDLE_SECONDS = 60 * 60 * 4;

export const SESSION_IDLE_MS = SESSION_IDLE_SECONDS * 1000;

/** Human wording for the timeout, so every message says the same thing. */
export const SESSION_IDLE_LABEL = "4 hours";

/**
 * A readable companion cookie holding the moment the session goes stale, as
 * milliseconds since the epoch.
 *
 * It carries no identity and grants nothing — it exists so an open tab can
 * sign itself out at the right moment instead of sitting on a dead session
 * until the next click. The httpOnly session cookie is still the only thing
 * the server trusts; this one is just a clock the page can see.
 */
export const SESSION_DEADLINE_COOKIE = "pesoflow_until";

/** Read the deadline the server last wrote, or null if there isn't one. */
export function readSessionDeadline(): number | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${SESSION_DEADLINE_COOKIE}=`));
  if (!hit) return null;
  const ms = Number(hit.slice(SESSION_DEADLINE_COOKIE.length + 1));
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
