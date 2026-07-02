import { NextResponse, type NextRequest } from "next/server";
import { createElement } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sender";
import { signEmailToken } from "@/lib/email/token";
import Welcome from "@/emails/welcome";
import Day3Checkin from "@/emails/day3-checkin";
import Day7Upgrade from "@/emails/day7-upgrade";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 50;
const SEND_DELAY_MS = 100;
const DAY7_MIN_ANIMATIONS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

/**
 * GET /api/email/lifecycle — Vercel Cron only (Cron triggers via GET and adds
 * the `Authorization: Bearer <CRON_SECRET>` header automatically).
 * Sends pending welcome / day-3 / day-7 lifecycle emails. Idempotent: each
 * email is recorded in `email_lifecycle`, so a user is never emailed twice.
 */
export async function GET(request: NextRequest) {
  // 1. Authorize: only the Vercel Cron (which sends `Bearer <CRON_SECRET>`).
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const base = appUrl();
  const sent = { welcome: 0, day3: 0, day7: 0 };

  try {
    // ---- 2. WELCOME: confirmed users who haven't been welcomed yet ----------
    const { data: welcomedRows } = await admin
      .from("email_lifecycle")
      .select("user_id")
      .not("welcome_sent_at", "is", null);
    const welcomed = new Set((welcomedRows ?? []).map((r) => r.user_id));

    const { data: list } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const newlyConfirmed = (list?.users ?? [])
      .filter(
        (u) =>
          !u.is_anonymous &&
          !!u.email &&
          !!u.email_confirmed_at &&
          !welcomed.has(u.id),
      )
      .slice(0, BATCH);

    for (const u of newlyConfirmed) {
      const email = u.email!;
      const token = signEmailToken(u.id);
      const res = await sendEmail({
        to: email,
        subject: "Your Skribbl account is ready",
        template: createElement(Welcome, {
          appUrl: base,
          unsubscribeUrl: `${base}/api/email/unsubscribe?token=${token}`,
        }),
      });
      // Record regardless of send success so we don't spam on transient errors;
      // (a one-off failed welcome is acceptable — better than a loop).
      await admin
        .from("email_lifecycle")
        .upsert(
          {
            user_id: u.id,
            email,
            welcome_sent_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (res.success) sent.welcome++;
      await sleep(SEND_DELAY_MS);
    }

    // ---- 3. DAY 3: welcomed > 3 days ago, not yet sent, not unsubscribed ----
    const threeDaysAgo = new Date(Date.now() - 3 * 86400_000).toISOString();
    const { data: day3Rows } = await admin
      .from("email_lifecycle")
      .select("user_id, email")
      .lt("welcome_sent_at", threeDaysAgo)
      .is("day3_sent_at", null)
      .is("unsubscribed_at", null)
      .not("email", "is", null)
      .limit(BATCH);

    for (const row of day3Rows ?? []) {
      if (!row.email) continue;
      const token = signEmailToken(row.user_id);
      const res = await sendEmail({
        to: row.email,
        subject: "How's Skribbl working for you?",
        template: createElement(Day3Checkin, { baseUrl: base, token }),
      });
      await admin
        .from("email_lifecycle")
        .update({ day3_sent_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      if (res.success) sent.day3++;
      await sleep(SEND_DELAY_MS);
    }

    // ---- 4. DAY 7: welcomed > 7 days ago, engaged (>=3 animations) ----------
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: day7Rows } = await admin
      .from("email_lifecycle")
      .select("user_id, email")
      .lt("welcome_sent_at", sevenDaysAgo)
      .is("day7_sent_at", null)
      .is("unsubscribed_at", null)
      .not("email", "is", null)
      .limit(BATCH);

    for (const row of day7Rows ?? []) {
      if (!row.email) continue;
      const { count } = await admin
        .from("user_history")
        .select("*", { count: "exact", head: true })
        .eq("user_id", row.user_id);
      const animationCount = count ?? 0;
      if (animationCount < DAY7_MIN_ANIMATIONS) continue; // not engaged — skip

      const token = signEmailToken(row.user_id);
      const res = await sendEmail({
        to: row.email,
        subject: "Would you pay for more Skribbl?",
        template: createElement(Day7Upgrade, {
          baseUrl: base,
          token,
          animationCount,
        }),
      });
      await admin
        .from("email_lifecycle")
        .update({ day7_sent_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      if (res.success) sent.day7++;
      await sleep(SEND_DELAY_MS);
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error("[email/lifecycle] error", err);
    return NextResponse.json(
      { error: "Lifecycle run failed.", sent },
      { status: 500 },
    );
  }
}
