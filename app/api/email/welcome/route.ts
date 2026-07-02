import { NextResponse } from "next/server";
import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sender";
import { signEmailToken } from "@/lib/email/token";
import Welcome from "@/emails/welcome";

export const runtime = "nodejs";

/**
 * POST /api/email/welcome
 *
 * Sends the welcome email to the CURRENT signed-in, confirmed user the moment
 * they land in the app — so it doesn't wait for the (Hobby: ~daily) cron.
 * Idempotent: guarded by `email_lifecycle.welcome_sent_at`, and only marks
 * sent on success, so it retries until email is actually configured.
 */
export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Only real, confirmed accounts get a welcome.
    if (!user || user.is_anonymous || !user.email || !user.email_confirmed_at) {
      return NextResponse.json({ ok: false, reason: "not_eligible" });
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("email_lifecycle")
      .select("welcome_sent_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (row?.welcome_sent_at) {
      return NextResponse.json({ ok: true, already: true });
    }

    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const token = signEmailToken(user.id);
    const res = await sendEmail({
      to: user.email,
      subject: "Your Skribbl account is ready",
      template: createElement(Welcome, {
        appUrl: base,
        unsubscribeUrl: `${base}/api/email/unsubscribe?token=${token}`,
      }),
    });

    if (!res.success) {
      // Don't mark — let it retry (e.g. once Gmail creds are set) or fall to cron.
      return NextResponse.json({ ok: false, reason: "send_failed" });
    }

    await admin.from("email_lifecycle").upsert(
      {
        user_id: user.id,
        email: user.email,
        welcome_sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email/welcome] error", err);
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
}
