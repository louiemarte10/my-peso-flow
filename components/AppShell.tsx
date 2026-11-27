"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, type Role } from "@/lib/client";
import ThemeToggle from "@/components/ThemeToggle";

type NavItem = { href: string; label: string; icon: string; admin?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/wallets", label: "My Wallets", icon: "👛" },
  { href: "/earnings", label: "Earnings", icon: "💰" },
  { href: "/expenses", label: "Expenses", icon: "🧾" },
  { href: "/history", label: "All Transactions", icon: "📅" },
  { href: "/schedule", label: "Schedule Peso", icon: "🔁" },
  { href: "/categories", label: "Categories", icon: "🏷️" },
  { href: "/archived", label: "Archived", icon: "🗃️" },
  { href: "/users", label: "People", icon: "👥", admin: true },
  { href: "/activity", label: "Activity", icon: "📜", admin: true },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/guide", label: "How to Use", icon: "📘" },
];

export default function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; image: string | null; role: Role };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on a click elsewhere or on Escape, the way every
  // other menu on the web behaves.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // A move to another page should not leave the menu hanging open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  async function logout() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  // Admin-only destinations are hidden for everyone else. The API enforces it
  // too — hiding a link is presentation, not a permission check.
  const items = NAV.filter((n) => !n.admin || user.role === "ADMIN");

  const nav = (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-brand text-white shadow"
                : "text-slate-600 hover:bg-brand-light hover:text-brand-dark"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sidebarInner = (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-xl text-white">
          ₱
        </span>
        <div>
          <p className="text-sm font-bold leading-tight text-brand-dark">
            myPesoFlow
          </p>
          <p className="text-xs text-slate-400">Earnings &amp; Expenses</p>
        </div>
      </div>

      {nav}

      <div className="shrink-0 border-t border-slate-100 p-3">
        <ThemeToggle />
        <div ref={menuRef} className="relative">
          {menuOpen && (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-lg">
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-ice"
              >
                <span aria-hidden>🙋</span> My Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-ice"
              >
                <span aria-hidden>⚙️</span> Account settings
              </Link>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-outflow transition hover:bg-ice"
              >
                <span aria-hidden>↪</span> Sign out
              </button>
            </div>
          )}

          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-ice ${
              menuOpen ? "bg-ice" : ""
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light text-xs font-bold text-brand-dark">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                initials || "?"
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-700">
                {user.name}
              </span>
              <span className="block truncate text-xs text-slate-400">
                {user.role === "ADMIN" ? "Admin · " : ""}
                {user.email}
              </span>
            </span>
            <span
              aria-hidden
              className={`shrink-0 text-xs text-slate-400 transition-transform ${
                menuOpen ? "rotate-180" : ""
              }`}
            >
              ▲
            </span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-ice">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-slate-200 bg-surface md:flex">
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-surface shadow-xl">
            {sidebarInner}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-surface px-4 py-3 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="font-bold text-brand-dark">myPesoFlow</span>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
