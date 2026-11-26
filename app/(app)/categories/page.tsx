"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Category, type EntryKind, type Role } from "@/lib/client";
import { USER_CATEGORY_LIMIT } from "@/lib/config";
import ConfirmModal, { type ConfirmState } from "@/components/ConfirmModal";
import { Skeleton } from "@/components/Skeleton";

const SWATCHES = [
  "#0078BF",
  "#55A5D4",
  "#0F9D58",
  "#E5484D",
  "#F97316",
  "#EAB308",
  "#A855F7",
  "#EC4899",
  "#06B6D4",
  "#64748B",
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [role, setRole] = useState<Role>("USER");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [cats, me] = await Promise.all([
        api.get<{ categories: Category[] }>("/api/categories"),
        api.get<{ user: { role: Role } }>("/api/me"),
      ]);
      setCategories(cats.categories);
      setRole(me.user.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount-and-refetch: every setState inside load() happens after an await,
    // so this does not cascade renders the way the rule assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function create(kind: EntryKind, name: string, color: string) {
    await api.post("/api/categories", { kind, name, color });
    await load();
  }

  async function update(id: string, patch: Partial<Category>) {
    try {
      await api.patch(`/api/categories/${id}`, patch);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  function requestDelete(c: Category) {
    const used = c._count?.entries ?? 0;
    setConfirm({
      title: `Archive "${c.name}"`,
      message:
        `This category stops appearing on the encode forms. ` +
        (used > 0
          ? `The ${used} entr${used === 1 ? "y" : "ies"} filed under it keep their label and their amounts. `
          : "") +
        "You can restore it or delete it for good from the Archived page.",
      confirmLabel: "Archive",
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await api.del(`/api/categories/${c.id}`);
          setConfirm(null);
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not remove");
          setConfirm(null);
        } finally {
          setConfirmLoading(false);
        }
      },
    });
  }

  // The cap counts live categories across both kinds; archived ones are free.
  const liveCount = categories.filter((c) => !c.archived).length;
  const atLimit = role !== "ADMIN" && liveCount >= USER_CATEGORY_LIMIT;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Categories</h1>
        <p className="mt-1 max-w-[75ch] text-sm text-slate-500">
          These are the choices you get when encoding. The colour is what shows
          in the dashboard breakdown bars. Tick{" "}
          <strong>needs details</strong> on a vague catch-all like
          &ldquo;Others&rdquo; and encoding against it will insist you write
          what it actually was &mdash; e.g.{" "}
          <em>6 Marlboro at 11 pesos each</em>. Archiving never loses anything:
          it waits on the{" "}
          <a href="/archived" className="text-brand hover:underline">
            Archived
          </a>{" "}
          page until you restore it or delete it for good.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {role !== "ADMIN" && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            atLimit
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-slate-200 bg-surface text-slate-500"
          }`}
        >
          <strong className="text-slate-700">
            {liveCount} of {USER_CATEGORY_LIMIT}
          </strong>{" "}
          categories used.{" "}
          {atLimit ? (
            <>
              You have reached the limit — archive one you no longer use and the
              slot frees up straight away. Archiving keeps all its past entries.
            </>
          ) : (
            <>
              {USER_CATEGORY_LIMIT - liveCount} slot
              {USER_CATEGORY_LIMIT - liveCount === 1 ? "" : "s"} left. Archived
              categories do not count towards this.
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <KindPanel
          kind="EARNING"
          title="Earning sources"
          categories={categories.filter((c) => c.kind === "EARNING")}
          loading={loading}
          atLimit={atLimit}
          onCreate={create}
          onUpdate={update}
          onDelete={requestDelete}
        />
        <KindPanel
          kind="EXPENSE"
          title="Expense categories"
          categories={categories.filter((c) => c.kind === "EXPENSE")}
          loading={loading}
          atLimit={atLimit}
          onCreate={create}
          onUpdate={update}
          onDelete={requestDelete}
        />
      </div>

      <ConfirmModal
        state={confirm}
        loading={confirmLoading}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}

function KindPanel({
  kind,
  title,
  categories,
  loading,
  atLimit,
  onCreate,
  onUpdate,
  onDelete,
}: {
  kind: EntryKind;
  title: string;
  categories: Category[];
  loading: boolean;
  /** True when this account has used up its category allowance. */
  atLimit: boolean;
  onCreate: (kind: EntryKind, name: string, color: string) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Category>) => Promise<void>;
  onDelete: (c: Category) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(kind === "EARNING" ? "#0F9D58" : "#E5484D");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (atLimit) {
      setError("You have reached your category limit. Archive one first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate(kind, trimmed, color);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    } finally {
      setSaving(false);
    }
  }

  async function commitRename(c: Category) {
    const trimmed = editName.trim();
    setEditingId(null);
    if (trimmed && trimmed !== c.name) await onUpdate(c.id, { name: trimmed });
  }

  const active = categories.filter((c) => !c.archived);

  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-slate-800">{title}</h2>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Add row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          disabled={atLimit}
          placeholder={
            atLimit ? "Limit reached — archive one first" : "New category name…"
          }
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        <div className="flex items-center gap-1">
          {SWATCHES.map((s) => (
            <button
              key={s}
              onClick={() => setColor(s)}
              aria-label={`Use colour ${s}`}
              className={`h-5 w-5 rounded-full border-2 transition ${
                color === s ? "border-slate-800 scale-110" : "border-transparent"
              }`}
              style={{ background: s }}
            />
          ))}
        </div>
        <button
          onClick={add}
          disabled={saving || !name.trim() || atLimit}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {active.length === 0 && (
              <li className="py-6 text-center text-sm text-slate-400">
                No categories yet — add your first above.
              </li>
            )}
            {active.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <input
                  type="color"
                  value={c.color ?? "#64748B"}
                  onChange={(e) => onUpdate(c.id, { color: e.target.value })}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={`Colour for ${c.name}`}
                />

                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => commitRename(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(c);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-brand bg-surface px-2 py-1 text-sm text-slate-800 outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-sm text-slate-700 hover:text-brand"
                    title="Click to rename"
                  >
                    {c.name}
                  </button>
                )}

                <label
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-400"
                  title={`When on, encoding against "${c.name}" requires you to write what it actually was.`}
                >
                  <input
                    type="checkbox"
                    checked={c.requiresDetail}
                    onChange={(e) =>
                      onUpdate(c.id, { requiresDetail: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                  />
                  needs details
                </label>
                <span className="shrink-0 text-xs text-slate-400">
                  {c._count?.entries ?? 0} used
                </span>
                {editingId === c.id ? (
                  <button
                    onClick={() => commitRename(c)}
                    className="shrink-0 rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand-dark"
                  >
                    Save
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand-light"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => onDelete(c)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                >
                  Archive
                </button>
              </li>
            ))}
          </ul>

        </>
      )}
    </div>
  );
}
