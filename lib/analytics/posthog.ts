"use client";

import posthog from "posthog-js";

/**
 * ============================================================
 * PostHog analytics (client-only)
 * ============================================================
 * Initialized once on mount via <AnalyticsProvider />. If no
 * NEXT_PUBLIC_POSTHOG_KEY is configured, analytics is simply disabled — the
 * app works exactly the same, events just no-op.
 *
 * PRIVACY: only ever capture metadata (counts, lengths, booleans, categories)
 * — never question text, narration, or any user-identifiable string. See
 * lib/analytics/events.ts for the typed event helpers that enforce this.
 */

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!key) return; // analytics disabled when unconfigured

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    // Don't record the pixel-heavy whiteboard canvas in session replays.
    session_recording: {
      blockSelector: "canvas",
    },
  });

  initialized = true;
}

/** True once PostHog has been initialized with a real key. */
export function isAnalyticsReady(): boolean {
  return initialized;
}

/**
 * Safe capture: no-ops when analytics is disabled or running server-side.
 * Use the typed helpers in events.ts rather than calling this directly.
 */
export function captureEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined" || !initialized) return;
  posthog.capture(event, properties);
}
