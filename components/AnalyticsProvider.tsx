"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics/posthog";

/**
 * Initializes PostHog once on the client. Renders nothing — it just runs the
 * init side-effect after hydration. Safe to include in the root layout.
 */
export function AnalyticsProvider() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}
