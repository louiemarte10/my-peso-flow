// Environment-derived feature flags, in one place so pages and route handlers
// agree on them. (Route modules may only export request handlers, so flags
// cannot live next to the routes that use them.)

/** Shown whenever an email address already belongs to an account. */
export const EMAIL_TAKEN =
  "That email is not available — it already has an account";

/**
 * How many LIVE categories a plain USER may keep. Archived ones don't count,
 * so the way past the cap is to archive something you no longer use.
 * Admins are not capped.
 *
 * The starter set is deliberately smaller than this, so a new account has room
 * to add its own before it ever meets the limit.
 */
export const USER_CATEGORY_LIMIT = 15;

/** Self sign-up is on unless ALLOW_SIGNUP is explicitly "false". */
export function signupEnabled(): boolean {
  return process.env.ALLOW_SIGNUP !== "false";
}
