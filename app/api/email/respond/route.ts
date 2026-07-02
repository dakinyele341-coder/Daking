import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyEmailToken } from "@/lib/email/token";
import type { EmailType } from "@/lib/types/database";

export const runtime = "nodejs";

const VALID_TYPES: EmailType[] = ["day3_checkin", "day7_upgrade"];

/**
 * GET /api/email/respond?type=&r=&token=
 * Records a one-tap survey/feedback response from a lifecycle email, then
 * redirects to a thank-you page. The token is HMAC-signed, so the response is
 * attributed to a real user and can't be forged for someone else.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");
  const response = (searchParams.get("r") ?? "").slice(0, 40);
  const userId = verifyEmailToken(searchParams.get("token"));

  const thanks = new URL("/feedback-received", request.url);

  // Be forgiving: even on a bad/expired link we still show the thank-you page
  // (a broken link shouldn't feel like an error), we just don't record.
  if (
    userId &&
    type &&
    (VALID_TYPES as string[]).includes(type) &&
    response.length > 0
  ) {
    try {
      const admin = createAdminClient();
      await admin.from("email_responses").insert({
        user_id: userId,
        email_type: type as EmailType,
        response,
      });
      thanks.searchParams.set("r", response);
    } catch (err) {
      console.error("[email/respond] insert failed", err);
    }
  }

  return NextResponse.redirect(thanks);
}
