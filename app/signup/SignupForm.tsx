"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import ThemeToggle from "@/components/ThemeToggle";

type EmailState = "idle" | "checking" | "free" | "taken" | "invalid";

export default function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailState, setEmailState] = useState<EmailState>("idle");

  // Tell them the address is taken while they type, instead of making them
  // fill the whole form first. The server still decides on submit.
  /* The hint tracks an answer only the server has, so it genuinely belongs in
     an effect. The rule below exists to catch render loops; this debounced
     fetch settles after one round trip. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const value = email.trim().toLowerCase();

    if (!value) {
      setEmailState("idle");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailState("invalid");
      return;
    }

    setEmailState("checking");
    const cancel = { current: false };
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean | null }>(
          `/api/auth/check-email?email=${encodeURIComponent(value)}`,
        );
        if (cancel.current) return;
        setEmailState(res.available === false ? "taken" : "free");
      } catch {
        // A failed check must never block signing up — the server decides.
        if (!cancel.current) setEmailState("idle");
      }
    }, 450);

    return () => {
      cancel.current = true;
      clearTimeout(timer);
    };
  }, [email]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await api.post("/api/auth/signup", {
        name: name.trim(),
        email: cleanEmail,
        password,
      });
      // Deliberately not signed in: go and prove the password works.
      router.replace(
        `/login?created=1&email=${encodeURIComponent(cleanEmail)}`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
      setLoading(false);
    }
  }

  const emailTaken = emailState === "taken";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-light via-ice to-ice p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl font-bold text-white shadow-lg">
            ₱
          </div>
          <h1 className="text-2xl font-bold text-brand-dark">myPesoFlow</h1>
          <p className="text-sm text-slate-500">
            Create your account and start tracking
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
              Your name
            </label>
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Juan Dela Cruz"
            />
          </div>

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
              className={`${inputCls} ${
                emailTaken ? "border-red-500 focus:border-red-500" : ""
              }`}
              placeholder="you@example.com"
              aria-invalid={emailTaken}
            />
            <p className="mt-1 min-h-[1.25rem] text-xs">
              {emailState === "checking" && (
                <span className="text-slate-400">Checking…</span>
              )}
              {emailState === "free" && (
                <span className="text-income">✓ That email is available</span>
              )}
              {emailTaken && (
                <span className="text-red-600">
                  That email is not available —{" "}
                  <Link
                    href={`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                    className="font-semibold underline"
                  >
                    sign in instead
                  </Link>
                </span>
              )}
              {emailState === "invalid" && (
                <span className="text-slate-400">
                  Enter a complete email address
                </span>
              )}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-16`}
                placeholder="At least 8 characters"
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

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Confirm password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
              placeholder="Type it again"
            />
          </div>

          <button
            type="submit"
            disabled={loading || emailTaken}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create account"}
          </button>

          <p className="text-center text-xs text-slate-400">
            You get your own wallets, categories and ledger. Nobody else can see
            them.
          </p>
        </form>

        <div className="mx-auto mt-4 max-w-[13rem]">
          <ThemeToggle />
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand transition hover:text-brand-dark hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
