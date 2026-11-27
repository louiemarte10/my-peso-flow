"use client";

import { useEffect } from "react";
import {
  SESSION_IDLE_LABEL,
  readSessionDeadline,
} from "@/lib/session-public";

/**
 * Signs a forgotten tab out on time.
 *
 * The server is what actually ends the session: the cookie carries a four-hour
 * expiry that the proxy slides forward on every request, so once someone stops
 * using the app it dies on its own and nothing they do afterwards is accepted.
 *
 * What this adds is punctuality. Without it a tab left open overnight still
 * LOOKS signed in — yesterday's numbers on screen, a sidebar that goes nowhere
 * — until something is clicked. This notices the deadline passing and moves to
 * the sign-in page, so what is on screen always matches what the session can
 * still do.
 *
 * It reads the deadline from a cookie the server writes, never from a timer
 * started at page load, so an action taken in another tab correctly keeps this
 * one alive too.
 */
export default function SessionWatchdog() {
  useEffect(() => {
    let done = false;

    function check() {
      if (done) return;
      const deadline = readSessionDeadline();

      // No deadline cookie: either signed out elsewhere, or the cookie itself
      // has expired in the browser. Either way this tab is finished — but let
      // the server confirm rather than guessing, in case it simply hasn't been
      // written yet on a very first paint.
      if (deadline === null) return;

      if (Date.now() >= deadline) {
        done = true;
        console.info(
          `[myPesoFlow] Session ended after ${SESSION_IDLE_LABEL} without activity.`,
        );
        window.location.href = "/login?timeout=1";
      }
    }

    // Once a minute is precise enough for a four-hour window and costs nothing.
    const timer = setInterval(check, 60_000);

    // A laptop that was asleep fires no intervals, so check the moment the tab
    // is looked at again — that is when a stale screen would otherwise show.
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    check();

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  return null;
}
