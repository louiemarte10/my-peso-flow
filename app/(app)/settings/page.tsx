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
  _count: { entries: number; categories: number };
};

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [savingName, setSavingName] = useState(false);

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
        me?.hasPassword ? "Password changed." : "Password set — you can now sign in with your email too.",
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

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your account and how myPesoFlow looks.
        </p>
      </div>

      {/* Account */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-slate-800">Account</h2>

        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-400">Email</dt>
            <dd className="truncate text-slate-700">{me.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Sign-in methods</dt>
            <dd className="text-slate-700">
              {[me.hasPassword && "Password", me.googleLinked && "Google"]
                .filter(Boolean)
                .join(" + ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Entries encoded</dt>
            <dd className="text-slate-700">{me._count.entries}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Categories</dt>
            <dd className="text-slate-700">{me._count.categories}</dd>
          </div>
        </dl>

        {nameErr && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {nameErr}
          </div>
        )}
        {nameMsg && (
          <div className="mb-3 rounded-lg bg-brand-light px-3 py-2 text-sm text-brand-dark">
            {nameMsg}
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-slate-500">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          <button
            onClick={saveName}
            disabled={savingName || !name.trim() || name === me.name}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
          >
            {savingName ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {/* Password */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">
          {me.hasPassword ? "Change password" : "Set a password"}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {me.hasPassword
            ? "You will stay signed in on this device."
            : "Your account signs in with Google only. Set a password to also sign in with your email."}
        </p>

        {pwErr && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {pwErr}
          </div>
        )}
        {pwMsg && (
          <div className="mb-3 rounded-lg bg-brand-light px-3 py-2 text-sm text-brand-dark">
            {pwMsg}
          </div>
        )}

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
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
          >
            {savingPw ? "Saving…" : me.hasPassword ? "Change password" : "Set password"}
          </button>
        </div>
      </section>

      {/* Appearance */}
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
