"use client";

import { useEffect } from "react";

/**
 * Fires the instant-welcome check once per browser session. The endpoint is a
 * cheap no-op for anonymous/already-welcomed users, so this is safe to mount
 * globally. Renders nothing.
 */
export function WelcomeOnLoad() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("skribbl:welcome-pinged")) return;
      sessionStorage.setItem("skribbl:welcome-pinged", "1");
    } catch {
      // sessionStorage unavailable (private mode) — still fine to ping once.
    }
    void fetch("/api/email/welcome", { method: "POST" }).catch(() => {});
  }, []);

  return null;
}
