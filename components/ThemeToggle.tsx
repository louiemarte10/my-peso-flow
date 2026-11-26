"use client";

import { useSyncExternalStore } from "react";

const THEME_EVENT = "pesoflow:theme";

/**
 * The theme lives on <html data-theme> (set before first paint by the inline
 * script in the root layout), which makes it an external store rather than
 * React state. useSyncExternalStore reads it without a setState-in-effect, and
 * falls back to "light" during server render / hydration.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function getSnapshot(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function getServerSnapshot(): boolean {
  return false;
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = dark ? "light" : "dark";
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode — the theme just won't persist */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      onClick={toggle}
      className="mb-2 flex w-full items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
      aria-label="Toggle dark mode"
    >
      <span className="flex items-center gap-2">
        <span>{dark ? "🌙" : "☀️"}</span>
        {dark ? "Dark mode" : "Light mode"}
      </span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          dark ? "bg-brand" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            dark ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
