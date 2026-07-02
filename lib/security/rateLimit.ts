import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ============================================================
 * Rate limiting (Upstash Redis)
 * ============================================================
 * All limiters are keyed by `user_id` (every visitor has one, even
 * anonymous — see getOrCreateUser). We never key by raw IP alone:
 * IPs are spoofable behind some proxies and shared behind NAT. An
 * IP hash can still be passed as a secondary signal in metadata.
 */

const redis = Redis.fromEnv();

const PREFIX = "skribbl:rl";

/**
 * Generation quota configuration, exported so status endpoints (/api/usage)
 * can report the limits without consuming a request. Keep the limiters below
 * built FROM these values so the two can never drift.
 *
 * Budget note: a generation can cost real money (Gemini text + up to 6-10
 * generated illustrations), so quotas are deliberately conservative: an hourly
 * burst cap plus a daily ceiling. The shared animations cache absorbs repeat
 * questions for free.
 */
export const GENERATE_LIMITS = {
  anon: { hourly: 6, daily: 12 },
  authed: { hourly: 15, daily: 40 },
  /** Attachment-based (image/PDF) generations, on top of the caps above. */
  attachments: { hourly: 5 },
} as const;

/** Anonymous users: hourly burst cap. */
export const anonGenerateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(GENERATE_LIMITS.anon.hourly, "1 h"),
  analytics: true,
  prefix: `${PREFIX}:gen:anon`,
});

/** Anonymous users: daily ceiling. */
export const anonDailyGenerateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(GENERATE_LIMITS.anon.daily, "24 h"),
  analytics: true,
  prefix: `${PREFIX}:gen:anon:day`,
});

/** Authenticated free-plan users: hourly burst cap. */
export const authedGenerateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(GENERATE_LIMITS.authed.hourly, "1 h"),
  analytics: true,
  prefix: `${PREFIX}:gen:authed`,
});

/** Authenticated free-plan users: daily ceiling. */
export const authedDailyGenerateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(GENERATE_LIMITS.authed.daily, "24 h"),
  analytics: true,
  prefix: `${PREFIX}:gen:authed:day`,
});

/**
 * Attachment (image/PDF) generations: 5 per hour regardless of plan — these
 * send file bytes to Gemini as input tokens, so they cost more per request.
 */
export const uploadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(GENERATE_LIMITS.attachments.hourly, "1 h"),
  analytics: true,
  prefix: `${PREFIX}:upload`,
});

export interface RateLimitResult {
  success: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Unix epoch (ms) when the window resets. */
  reset: number;
  /** Total allowed in the window. */
  limit: number;
}

/** How long to ask a client to back off when Redis is unreachable (ms). */
const FAIL_CLOSED_BACKOFF_MS = 60_000;

/**
 * Checks a limiter for the given identifier (a `user_id`).
 *
 * On a rate-limit hit, fire-and-forget logs a `rate_limit_hit` row into
 * `security_events` via the service-role client. The log write is awaited so
 * it isn't dropped, but its own failure never blocks the caller.
 *
 * IMPORTANT — fails CLOSED: if Upstash/Redis is unreachable, `limiter.limit()`
 * throws. We swallow that here and return `{ success: false }` so the caller
 * DENIES the request. A Redis outage must never silently disable rate limiting
 * (which would expose us to unbounded, billable Gemini calls).
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
  metadata?: Record<string, unknown>,
): Promise<RateLimitResult> {
  let result: RateLimitResult;
  try {
    const { success, remaining, reset, limit } = await limiter.limit(identifier);
    result = { success, remaining, reset, limit };
  } catch (err) {
    // Log server-side only — never surface Redis internals to the client.
    console.error("[Skribbl] Rate limiter unavailable; failing closed:", err);
    await logSecurityEvent("rate_limit_unavailable", identifier, metadata);
    return {
      success: false,
      remaining: 0,
      reset: Date.now() + FAIL_CLOSED_BACKOFF_MS,
      limit: 0,
    };
  }

  if (!result.success) {
    await logSecurityEvent("rate_limit_hit", identifier, {
      limit: result.limit,
      reset: result.reset,
      ...metadata,
    });
  }

  return result;
}

/**
 * Writes a row to `security_events` using the admin client. Best-effort:
 * swallows its own errors so monitoring never breaks the request path.
 */
export async function logSecurityEvent(
  eventType: string,
  identifier: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("security_events").insert({
      event_type: eventType,
      identifier,
      metadata: (metadata ?? null) as never,
    });
  } catch (err) {
    console.error("[Skribbl] Failed to log security event:", err);
  }
}
