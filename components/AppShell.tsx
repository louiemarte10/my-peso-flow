"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import ThemeToggle from "@/components/ThemeToggle";

type NavItem = { href: string; label: string; icon: string };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/wallets", label: "My Wallets", icon: "👛" },
  { href: "/earnings", label: "Earnings", icon: "💰" },
  { href: "/expenses", label: "Expenses", icon: "🧾" },
  { href: "/history", label: "All Transactions", icon: "📅" },
  { href: "/categories", label: "Categories", icon: "🏷️" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
  { href: "/guide", label: "How to Use", icon: "📘" },
];

export default function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; image: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api.post("/api/auth/logout");
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {NAV.map((item) => {
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
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
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

      <div className="border-t border-slate-100 p-3">
        <ThemeToggle />
        <div className="mb-2 flex items-center gap-2 px-1">
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
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-700">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          Sign out
        </button>
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
