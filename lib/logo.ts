// Wallet logos are stored inline as data URLs rather than as files, because
// the host filesystem is read-only. The browser shrinks each one to a small
// square PNG before upload, so a logo is a few KB; these limits are the
// backstop for anything that did not come from our own form.

/** Hard ceiling on the stored string. A 128px PNG is far below this. */
export const MAX_LOGO_CHARS = 200_000; // ~150 KB of image

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export type LogoCheck =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Validate a logo coming from a request body.
 *
 * Empty / null clears the logo. Anything else must be a data URL for an image
 * type we are willing to render, and within the size cap — we never fetch a
 * remote URL on the user's behalf, so a plain http(s) link is rejected rather
 * than quietly stored and loaded from someone else's server.
 */
export function checkLogo(raw: unknown): LogoCheck {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  if (typeof raw !== "string") {
    return { ok: false, error: "That logo could not be read" };
  }

  const value = raw.trim();
  if (!value) return { ok: true, value: null };

  if (!value.startsWith("data:")) {
    return {
      ok: false,
      error: "Upload an image file rather than linking to one",
    };
  }

  const match = /^data:([a-z+/-]+);base64,/i.exec(value);
  if (!match || !ALLOWED.includes(match[1].toLowerCase())) {
    return { ok: false, error: "Use a PNG, JPG, WEBP or SVG image" };
  }

  if (value.length > MAX_LOGO_CHARS) {
    return { ok: false, error: "That image is too large — use a smaller one" };
  }

  return { ok: true, value };
}
