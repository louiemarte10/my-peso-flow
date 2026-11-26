"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Skeleton } from "@/components/Skeleton";
import ThemeToggle from "@/components/ThemeToggle";

type Me = {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  createdAt: string;
  hasPassword: boolean;
  googleLinked: boolean;
  _count: { entries: number; categories: number; wallets: number };
};

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Display name
  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Sign-in email
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const load = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: Me }>("/api/me");
      setMe(user);
      setName(user.name);
      setEmail(user.email);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveName() {
    setNameErr("");
    setNameMsg("");
    setSavingName(true);
    try {
      await api.patch("/api/me", { name });
      setNameMsg("Saved.");
      router.refresh();
      await load();
    } catch (err) {
      setNameErr(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingName(false);
    }
  }

  async function saveEmail() {
    setEmailErr("");
    setEmailMsg("");
    setSavingEmail(true);
    try {
      await api.patch("/api/me", {
        email: email.trim().toLowerCase(),
        currentPassword: emailPassword || undefined,
      });
      setEmailMsg("Sign-in email updated. Use it the next time you sign in.");
      setEmailPassword("");
      router.refresh();
      await load();
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingEmail(false);
    }
  }

  async function savePassword() {
    setPwErr("");
    setPwMsg("");
    if (newPassword !== confirmPassword) {
      setPwErr("The two new passwords do not match.");
      return;
    }
    setSavingPw(true);
    try {
      await api.patch("/api/me", {
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setPwMsg(
        me?.hasPassword
          ? "Password changed."
          : "Password set — you can now sign in with your email too.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await load();
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingPw(false);
    }
  }

  if (loading || !me) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const emailChanged = email.trim().toLowerCase() !== me.email;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your sign-in details and how myPesoFlow looks.
        </p>
      </div>

      {/* ── Account at a glance ── */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-slate-800">Account</h2>

        <dl className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="Sign-in methods">
            {[me.hasPassword && "Password", me.googleLinked && "Google"]
              .filter(Boolean)
              .join(" + ") || "—"}
          </Fact>
          <Fact label="Entries">{me._count.entries}</Fact>
          <Fact label="Wallets">{me._count.wallets}</Fact>
          <Fact label="Categories">{me._count.categories}</Fact>
        </dl>

        {/* Display name */}
        {nameErr && <Alert tone="error">{nameErr}</Alert>}
        {nameMsg && <Alert tone="ok">{nameMsg}</Alert>}

        <label className="mb-1 block text-xs font-medium text-slate-500">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`min-w-0 flex-1 ${inputCls}`}
          />
          <button
            onClick={saveName}
            disabled={savingName || !name.trim() || name === me.name}
            className={btnCls}
          >
            {savingName ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {/* ── Sign-in email ── */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Sign-in email</h2>
        <p className="mb-4 text-sm text-slate-500">
          This is the address you sign in with. Changing it takes effect
          immediately — the old one stops working.
          {me.googleLinked && (
            <>
              {" "}
              Your Google sign-in keeps working either way, because it is linked
              to your Google account rather than to this address.
            </>
          )}
        </p>

        {emailErr && <Alert tone="error">{emailErr}</Alert>}
        {emailMsg && <Alert tone="ok">{emailMsg}</Alert>}

        <div className="space-y-3">
          <Labeled label="Email address">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </Labeled>

          {emailChanged && me.hasPassword && (
            <Labeled label="Confirm with your current password">
              <input
                type="password"
                autoComplete="current-password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
              />
            </Labeled>
          )}

          <button
            onClick={saveEmail}
            disabled={
              savingEmail ||
              !emailChanged ||
              (me.hasPassword && !emailPassword)
            }
            className={btnCls}
          >
            {savingEmail ? "Saving…" : "Change email"}
          </button>
        </div>
      </section>

      {/* ── Password ── */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">
          {me.hasPassword ? "Change password" : "Set a password"}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {me.hasPassword
            ? "You will stay signed in on this device."
            : "Your account signs in with Google only. Set a password to also sign in with your email."}
        </p>

        {pwErr && <Alert tone="error">{pwErr}</Alert>}
        {pwMsg && <Alert tone="ok">{pwMsg}</Alert>}

        <div className="space-y-3">
          {me.hasPassword && (
            <Labeled label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputCls}
              />
            </Labeled>
          )}
          <Labeled label="New password (at least 8 characters)">
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
            />
          </Labeled>
          <Labeled label="Confirm new password">
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls}
            />
          </Labeled>
          <button
            onClick={savePassword}
            disabled={savingPw || newPassword.length < 8}
            className={btnCls}
          >
            {savingPw
              ? "Saving…"
              : me.hasPassword
                ? "Change password"
                : "Set password"}
          </button>
        </div>
      </section>

      {/* ── Appearance ── */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Appearance</h2>
        <p className="mb-4 text-sm text-slate-500">
          Light uses #0078BF, dark uses #55A5D4. Your choice is remembered on
          this device.
        </p>
        <div className="max-w-xs">
          <ThemeToggle />
        </div>
      </section>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

const btnCls =
  "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40";

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="truncate text-slate-700">{children}</dd>
    </div>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-3 rounded-lg px-3 py-2 text-sm ${
        tone === "error"
          ? "bg-red-50 text-red-600"
          : "bg-brand-light text-brand-dark"
      }`}
    >
      {children}
    </div>
  );
}
