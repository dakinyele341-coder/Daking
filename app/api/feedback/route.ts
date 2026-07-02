import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { feedbackSchema, validateOrError } from "@/lib/security/validation";

export const runtime = "nodejs";

/**
 * POST /api/feedback
 *
 * Stores a feedback note. Anonymous users may submit too (user_id is then
 * their anon id, or null if there's somehow no session). Inserts via the
 * user-scoped client so RLS enforces the insert policy
 * (`auth.uid() = user_id or user_id is null`).
 */
export async function POST(request: NextRequest) {
  try {
    return await handleFeedback(request);
  } catch (err) {
    console.error("[Skribbl] feedback handler error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

async function handleFeedback(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateOrError(feedbackSchema, body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed.", fields: validation.errors },
      { status: 400 },
    );
  }
  const { category, message, pagePath } = validation.data;

  const { error } = await supabase.from("feedback").insert({
    user_id: user?.id ?? null,
    category,
    message,
    page_path: pagePath ?? null,
  });

  if (error) {
    return NextResponse.json(
      { error: "Could not save feedback." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
