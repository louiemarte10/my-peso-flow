"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

/**
 * Always-visible reminder that this session is an admin looking at somebody
 * else's books. Without it, it is far too easy to encode your own spending
 * into another person's ledger.
 */
export default function ImpersonationBanner({
  actingAs,
  admin,
}: {
  actingAs: { name: string; email: string };
  admin: { name: string; email: string };
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function stop() {
    setLeaving(true);
    try {
      await api.post("/api/auth/stop-impersonating");
      router.replace("/users");
      router.refresh();
    } catch {
      setLeaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2.5 text-sm text-amber-900">
      <span className="text-base">👁️</span>
      <p className="min-w-0 flex-1">
        You are signed in as <strong>{actingAs.name}</strong> ({actingAs.email}).
        Anything you change here is <strong>their</strong> data, not yours.
      </p>
      <button
        onClick={stop}
        disabled={leaving}
        className="shrink-0 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-800 disabled:opacity-60"
      >
        {leaving ? "Returning…" : `Back to ${admin.name}`}
      </button>
    </div>
  );
}
