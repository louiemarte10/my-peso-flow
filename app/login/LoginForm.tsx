"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import ThemeToggle from "@/components/ThemeToggle";

const OAUTH_ERRORS: Record<string, string> = {
  google_not_configured:
    "Google sign-in is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env.",
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in failed. Please try again.",
  bad_state: "That sign-in link expired. Please try again.",
  email_unverified: "Verify your email with Google first, then try again.",
  not_allowed: "That Google account is not allowed to use this app.",
  account_disabled: "That account has been disabled.",
};

export default function LoginForm({
  googleEnabled,
  signupEnabled,
  next,
  errorCode,
}: {
  googleEnabled: boolean;
  /** Whether self sign-up is open (ALLOW_SIGNUP). */
  signupEnabled: boolean;
  /** Where to land after signing in (already validated server-side). */
  next: string;
  /** An OAuth failure code bounced back by the Google callback, if any. */
  errorCode: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const error =
    formError ||
    (errorCode
      ? (OAUTH_ERRORS[errorCode] ?? "Sign-in failed. Please try again.")
      : "");

  const setError = setFormError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/login", { email, password });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-light via-ice to-ice p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl font-bold text-white shadow-lg">
            ₱
          </div>
          <h1 className="text-2xl font-bold text-brand-dark">myPesoFlow</h1>
          <p className="text-sm text-slate-500">
            Track your earnings, expenses and balance
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5"
        >
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 pr-16 text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-slate-500 transition hover:text-brand"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          {googleEnabled && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  or
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <a
                href={`/api/auth/google?next=${encodeURIComponent(next)}`}
                className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-surface py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <GoogleMark />
                Sign in with Google
              </a>
            </>
          )}
        </form>

        <div className="mx-auto mt-4 max-w-[13rem]">
          <ThemeToggle />
        </div>

        {signupEnabled && (
          <p className="mt-4 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-brand transition hover:text-brand-dark hover:underline"
            >
              Create an account
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.98 21.98 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
