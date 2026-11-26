"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type ManagedUser, type Role } from "@/lib/client";
import { longDayLabel, ymdFromISO } from "@/lib/date";
import ConfirmModal, { type ConfirmState } from "@/components/ConfirmModal";
import { SkeletonRows } from "@/components/Skeleton";

type NewUser = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

const emptyUser = (): NewUser => ({
  name: "",
  email: "",
  password: "",
  role: "USER",
});

export default function UsersClient() {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [meId, setMeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState<NewUser>(emptyUser());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [resetFor, setResetFor] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const [editFor, setEditFor] = useState<ManagedUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await api.get<{ users: ManagedUser[]; me: string }>(
        "/api/users",
      );
      setUsers(res.users);
      setMeId(res.me);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount-and-refetch: setState inside load() happens after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function createUser() {
    setFormError("");
    if (!form.name.trim()) return setFormError("Enter a name.");
    if (!form.email.trim()) return setFormError("Enter an email address.");
    if (form.password.length < 8) {
      return setFormError("Use a password of at least 8 characters.");
    }
    setSaving(true);
    try {
      await api.post("/api/users", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      setNotice(
        `Account created for ${form.email.trim().toLowerCase()}. Share the password with them — they can change it under Settings.`,
      );
      setForm(emptyUser());
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create");
    } finally {
      setSaving(false);
    }
  }

  async function patch(u: ManagedUser, body: Record<string, unknown>) {
    setError("");
    setNotice("");
    try {
      await api.patch(`/api/users/${u.id}`, body);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  async function doResetPassword() {
    if (!resetFor) return;
    if (resetPassword.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    await patch(resetFor, { newPassword: resetPassword });
    setNotice(
      `Password reset for ${resetFor.email}. Share the new one with them.`,
    );
    setResetFor(null);
    setResetPassword("");
  }

  async function saveEdit() {
    if (!editFor) return;
    const name = editName.trim();
    const email = editEmail.trim().toLowerCase();
    if (!name) return setError("Enter a name.");
    if (!email) return setError("Enter an email address.");
    await patch(editFor, { name, email });
    setNotice(`Updated ${name}.`);
    setEditFor(null);
  }

  /** Switch this session into that person's account, keeping a way back. */
  async function loginAs(u: ManagedUser) {
    setError("");
    try {
      await api.post(`/api/users/${u.id}/impersonate`);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch");
    }
  }

  function requestDelete(u: ManagedUser) {
    setConfirm({
      title: `Delete ${u.name}'s account`,
      message: `This permanently deletes ${u.email} along with all ${u._count.entries} of their entries, their wallets and their categories. This cannot be undone. Consider disabling the account instead — that blocks sign-in but keeps everything.`,
      confirmLabel: "Delete everything",
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await api.del(`/api/users/${u.id}`);
          setConfirm(null);
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not delete");
          setConfirm(null);
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">People</h1>
          <p className="mt-1 max-w-[75ch] text-sm text-slate-500">
            Everyone with an account here. Each person has their own entirely
            separate ledger — their own wallets, categories, earnings and
            expenses. Nobody can see anyone else&apos;s, admins included.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setFormError("");
          }}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          {showForm ? "Cancel" : "+ Add person"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-brand-light px-3 py-2 text-sm text-brand-dark">
          {notice}
        </div>
      )}

      {showForm && (
        <div className="rounded-2xl border border-brand bg-surface p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-800">New account</h2>

          {formError && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Field label="Full name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Juan Dela Cruz"
                className={inputCls}
              />
            </Field>
            <Field label="Email (their sign-in)" className="lg:col-span-2">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="juan@example.com"
                className={inputCls}
              />
            </Field>
            <Field label="Starting password">
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="at least 8 characters"
                className={inputCls}
              />
            </Field>
            <Field label="Role">
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as Role })
                }
                className={inputCls}
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={createUser}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create account"}
            </button>
            <p className="text-xs text-slate-400">
              They sign in with that email and password, and get their own
              starter wallets and categories. Only an admin can see this page.
            </p>
          </div>
        </div>
      )}

      {/* Edit person */}
      {editFor && (
        <div className="rounded-2xl border border-brand bg-surface p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-800">Edit {editFor.name}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Full name">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Email (their sign-in)">
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className={inputCls}
              />
            </Field>
            <div className="flex items-end gap-2">
              <button
                onClick={saveEdit}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                Save changes
              </button>
              <button
                onClick={() => setEditFor(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password reset */}
      {resetFor && (
        <div className="rounded-2xl border border-brand bg-surface p-5 shadow-sm">
          <h2 className="mb-1 font-bold text-slate-800">
            Reset password for {resetFor.name}
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            This replaces their password immediately. Tell them the new one, and
            they can change it themselves under Settings.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="New password (8+ characters)"
              className={`${inputCls} max-w-xs`}
            />
            <button
              onClick={doResetPassword}
              disabled={resetPassword.length < 8}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
            >
              Set password
            </button>
            <button
              onClick={() => {
                setResetFor(null);
                setResetPassword("");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-semibold">Person</th>
                <th className="px-3 py-2.5 font-semibold">Role</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Entries</th>
                <th className="px-3 py-2.5 font-semibold">Joined</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={3} cols={6} />
              ) : (
                users.map((u) => {
                  const isMe = u.id === meId;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-ice"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-700">
                          {u.name}
                          {isMe && (
                            <span className="ml-1.5 rounded-full bg-brand-light px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-dark">
                              you
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">
                          {u.email}
                          {u.googleLinked && " · Google linked"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            patch(u, { role: e.target.value })
                          }
                          className="rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs text-slate-700 outline-none focus:border-brand"
                        >
                          <option value="USER">User</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        {u.active ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-income">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {u._count.entries}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                        {longDayLabel(ymdFromISO(u.createdAt))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <Link
                          href={`/users/${u.id}`}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-light"
                        >
                          View books
                        </Link>
                        <button
                          onClick={() => {
                            setEditFor(u);
                            setEditName(u.name);
                            setEditEmail(u.email);
                          }}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-light"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setResetFor(u);
                            setResetPassword("");
                          }}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                          Reset password
                        </button>
                        {!isMe && (
                          <>
                            <button
                              onClick={() => loginAs(u)}
                              disabled={!u.active}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
                            >
                              Log in as
                            </button>
                            <button
                              onClick={() => patch(u, { active: !u.active })}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              {u.active ? "Disable" : "Enable"}
                            </button>
                            <button
                              onClick={() => requestDelete(u)}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        <strong>View books</strong> is a read-only summary.{" "}
        <strong>Log in as</strong> switches this session into their account so
        you can encode for them; a banner stays on screen and brings you
        straight back. Disabling an account blocks sign-in but keeps every
        record. Deleting one
        removes the person and everything they encoded, permanently. The last
        remaining admin can&apos;t be demoted, disabled or deleted.
      </p>

      <ConfirmModal
        state={confirm}
        loading={confirmLoading}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
