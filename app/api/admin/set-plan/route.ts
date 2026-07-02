import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin";
import { adminSetPlanSchema, validateOrError } from "@/lib/security/validation";

export const runtime = "nodejs";

/**
 * POST /api/admin/set-plan  — admin only.
 * Sets a user's plan (free/premium). Verifies the caller is an admin via their
 * session email, then writes with the service-role client.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const validation = validateOrError(adminSetPlanSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed.", fields: validation.errors },
        { status: 400 },
      );
    }
    const { userId, plan } = validation.data;

    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ plan })
      .eq("id", userId);

    if (error) {
      return NextResponse.json({ error: "Could not update plan." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId, plan });
  } catch (err) {
    console.error("[Skribbl] admin set-plan error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
