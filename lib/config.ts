// Environment-derived feature flags, in one place so pages and route handlers
// agree on them. (Route modules may only export request handlers, so flags
// cannot live next to the routes that use them.)

/** Shown whenever an email address already belongs to an account. */
export const EMAIL_TAKEN =
  "That email is not available — it already has an account";

/** Self sign-up is on unless ALLOW_SIGNUP is explicitly "false". */
export function signupEnabled(): boolean {
  return process.env.ALLOW_SIGNUP !== "false";
}
