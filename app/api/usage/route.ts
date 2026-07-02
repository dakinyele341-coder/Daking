import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  anonGenerateLimiter,
  anonDailyGenerateLimiter,
  authedGenerateLimiter,
  authedDailyGenerateLimiter,
  GENERATE_LIMITS,
} from "@/lib/security/rateLimit";
import { isAdminEmail } from "@/lib/auth/admin";
import { FREE_LONG_FORM_LIMIT } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/usage — read-only status for the current user: plan, generation
 * rate-limit state (peeked via `getRemaining`, which does NOT consume a
 * request), and long-form trial credits. Powers the Settings page and the
 * create-page trial banner.
 */
export async function GET() {
  try {
    return await handleUsage();
  } catch (err) {
    console.error("[Skribbl] usage handler error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

async function handleUsage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const isAdmin = isAdminEmail(user.email);
  const isAnonymous = user.is_anonymous ?? false;

  // Both reads are user-scoped (RLS: own rows only) and independent.
  const [profileRes, longFormRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, subscription_status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("long_form_usage")
      .select("used")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const premium =
    isAdmin ||
    profileRes.data?.plan === "premium" ||
    profileRes.data?.subscription_status === "active";

  // Peek at the rate limiters without consuming a request. This is a status
  // read, so unlike checkRateLimit it degrades gracefully (nulls) if Redis
  // is unreachable — generation itself still fails closed.
  const cfg = isAnonymous ? GENERATE_LIMITS.anon : GENERATE_LIMITS.authed;
  const hourlyLimiter = isAnonymous ? anonGenerateLimiter : authedGenerateLimiter;
  const dailyLimiter = isAnonymous
    ? anonDailyGenerateLimiter
    : authedDailyGenerateLimiter;

  const peekWindow = async (
    limiter: typeof hourlyLimiter,
    limit: number,
  ): Promise<{
    limit: number;
    remaining: number | null;
    used: number | null;
    reset: number | null;
  }> => {
    try {
      const peek = await limiter.getRemaining(user.id);
      const remaining = Math.max(0, Math.min(limit, peek.remaining));
      return { limit, remaining, used: limit - remaining, reset: peek.reset };
    } catch (err) {
      console.error("[Skribbl] usage: rate limiter peek failed:", err);
      return { limit, remaining: null, used: null, reset: null };
    }
  };

  const [hourly, daily] = await Promise.all([
    peekWindow(hourlyLimiter, cfg.hourly),
    peekWindow(dailyLimiter, cfg.daily),
  ]);

  const longFormUsed = longFormRes.data?.used ?? 0;
  const longFormRemaining = Math.max(0, FREE_LONG_FORM_LIMIT - longFormUsed);

  return NextResponse.json({
    plan: premium ? "premium" : "free",
    isAnonymous,
    isAdmin,
    // Anonymous users have an empty-string email — normalize to null.
    email: user.email || null,
    generations: {
      hourly,
      daily,
      // Attachment (image/PDF) generations share these quotas, plus this cap.
      attachmentsHourlyLimit: GENERATE_LIMITS.attachments.hourly,
    },
    longForm: premium
      ? {
          unlimited: true,
          limit: null,
          used: null,
          remaining: null,
          comingSoon: false,
        }
      : {
          unlimited: false,
          limit: FREE_LONG_FORM_LIMIT,
          used: longFormUsed,
          remaining: longFormRemaining,
          comingSoon: longFormRemaining === 0,
        },
  });
}
