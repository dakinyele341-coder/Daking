import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyEmailToken } from "@/lib/email/token";

export const runtime = "nodejs";

/**
 * GET /api/email/unsubscribe?token=
 * Marks the user as unsubscribed from lifecycle emails (account/transactional
 * emails are unaffected), then redirects to a confirmation page.
 */
export async function GET(request: NextRequest) {
  const userId = verifyEmailToken(request.nextUrl.searchParams.get("token"));
  const done = new URL("/unsubscribed", request.url);

  if (userId) {
    try {
      const admin = createAdminClient();
      // Upsert so we honor an unsubscribe even if no lifecycle row exists yet.
      await admin.from("email_lifecycle").upsert(
        {
          user_id: userId,
          unsubscribed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    } catch (err) {
      console.error("[email/unsubscribe] failed", err);
    }
  }

  return NextResponse.redirect(done);
}
