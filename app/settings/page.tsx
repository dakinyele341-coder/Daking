"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";

interface QuotaWindow {
  limit: number;
  remaining: number | null;
  used: number | null;
  reset: number | null;
}

/** Shape of GET /api/usage. */
interface UsageInfo {
  plan: "free" | "premium";
  isAnonymous: boolean;
  isAdmin: boolean;
  email: string | null;
  generations: {
    hourly: QuotaWindow;
    daily: QuotaWindow;
    attachmentsHourlyLimit: number;
  };
  longForm: {
    unlimited: boolean;
    limit: number | null;
    used: number | null;
    remaining: number | null;
    comingSoon: boolean;
  };
}

/** "in 42 min" / "in 2 hr" from a unix-ms reset timestamp. */
function formatReset(reset: number | null): string | null {
  if (!reset) return null;
  const ms = reset - Date.now();
  if (ms <= 0) return "now";
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `in ${min} min`;
  return `in ${Math.ceil(min / 60)} hr`;
}

export default function SettingsPage() {
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      if (!res.ok) {
        setError("Couldn't load your usage right now. Please try again.");
        return;
      }
      setUsage((await res.json()) as UsageInfo);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lf = usage?.longForm;
  const lfPct =
    lf && !lf.unlimited && lf.limit
      ? Math.min(100, ((lf.used ?? 0) / lf.limit) * 100)
      : 0;

  return (
    <main className="container max-w-3xl py-10">
      <AppHeader />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="mb-6 text-sm text-destructive">{error}</p>}

      {usage === null && !error ? (
        <SettingsSkeleton />
      ) : usage === null ? null : (
        <div className="space-y-6">
          {/* Account */}
          <section className="rounded-lg border border-border p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Account
            </h2>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {usage.email ?? "Guest session"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {usage.isAnonymous
                    ? "You're browsing as a guest — your history is saved to this device's session."
                    : "Signed in"}
                </p>
              </div>
              <span
                className={cn(
                  "rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide",
                  usage.plan === "premium"
                    ? "bg-marker text-paper"
                    : "bg-muted text-ink-muted",
                )}
              >
                {usage.isAdmin ? "Admin" : usage.plan}
              </span>
            </div>
            {usage.isAnonymous && (
              <p className="mt-3 text-sm">
                <Link href="/signup" className="font-medium text-marker underline">
                  Create a free account
                </Link>{" "}
                to keep your history everywhere and triple your hourly limit.
              </p>
            )}
          </section>

          {/* Generation rate limits */}
          <section className="rounded-lg border border-border p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Video generations
            </h2>
            <div className="space-y-5">
              <QuotaMeter
                label="This hour"
                window={usage.generations.hourly}
              />
              <QuotaMeter label="Today" window={usage.generations.daily} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Videos generated from images or PDFs also count here, capped at{" "}
              {usage.generations.attachmentsHourlyLimit} per hour.
              {usage.isAnonymous &&
                " Create a free account for higher limits."}
            </p>
          </section>

          {/* Long-form trial */}
          <section className="rounded-lg border border-border p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Long-form videos
            </h2>
            {lf?.unlimited ? (
              <p className="text-sm">
                <span className="rounded bg-marker px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper">
                  Premium
                </span>{" "}
                <span className="ml-1 text-muted-foreground">
                  Unlimited long-form videos are included in your plan.
                </span>
              </p>
            ) : lf ? (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-sm">
                    <span className="text-2xl font-bold">{lf.remaining}</span>{" "}
                    <span className="text-muted-foreground">
                      of {lf.limit} free videos left
                    </span>
                  </p>
                  {lf.comingSoon && (
                    <span className="rounded bg-chalkboard px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper">
                      Coming soon
                    </span>
                  )}
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={lf.used ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={lf.limit ?? 0}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-chalkboard transition-all"
                    style={{ width: `${lfPct}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {lf.comingSoon
                    ? "You've used your free previews. Long-form videos (and generating from images & PDFs) are coming soon for everyone — stay tuned!"
                    : "Every account gets free long-form previews while the feature is in early access. Generating from images & PDFs is part of long-form and uses the same free videos."}
                </p>
              </>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}

/** One quota window (hourly/daily): count, reset hint, and a progress bar. */
function QuotaMeter({ label, window: win }: { label: string; window: QuotaWindow }) {
  if (win.remaining === null) {
    return (
      <p className="text-sm text-muted-foreground">
        {label}: usage info is temporarily unavailable — your limit is {win.limit}.
      </p>
    );
  }
  const pct = Math.min(100, ((win.used ?? 0) / win.limit) * 100);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm">
          <span className="text-2xl font-bold">{win.remaining}</span>{" "}
          <span className="text-muted-foreground">
            of {win.limit} left {label.toLowerCase()}
          </span>
        </p>
        {formatReset(win.reset) && (win.used ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            Resets {formatReset(win.reset)}
          </p>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={win.used ?? 0}
        aria-valuemin={0}
        aria-valuemax={win.limit}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-marker transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-border p-5">
          <div className="mb-4 h-3 w-28 rounded bg-muted" />
          <div className="mb-2 h-6 w-40 rounded bg-muted" />
          <div className="h-2 w-full rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}
