import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateAnimationSchema,
  animationDataSchema,
  modelAnimationSchema,
  sanitizeAnimationData,
  validateOrError,
  type ModelAnimation,
} from "@/lib/security/validation";
import {
  anonGenerateLimiter,
  anonDailyGenerateLimiter,
  authedGenerateLimiter,
  authedDailyGenerateLimiter,
  uploadLimiter,
  checkRateLimit,
  logSecurityEvent,
} from "@/lib/security/rateLimit";
import { generateAnimationFromGemini } from "@/lib/ai/gemini";
import { generateWhiteboardImage, mapWithConcurrency } from "@/lib/ai/image";
import { isAdminEmail } from "@/lib/auth/admin";
import { FREE_LONG_FORM_LIMIT } from "@/lib/plans";
import type { AnimationData, AnimationFormat } from "@/lib/types/animation";
import type { Complexity, Json } from "@/lib/types/database";

export const runtime = "nodejs";
// Vercel Hobby (free) caps serverless functions at 60s. We stay under that:
// the text plan is fast, illustrations are generated in parallel, and a hard
// time budget (below) returns whatever finished before the cap.
export const maxDuration = 60;

const ILLUSTRATION_BUCKET = "illustrations";
/** Cap on generated illustrations per video (latency + cost control). */
const MAX_IMAGES: Record<AnimationFormat, number> = { standard: 6, long: 10 };
/** Generate illustrations in parallel (wall-time ≈ slowest image, not sum). */
const IMAGE_CONCURRENCY = 6;
/**
 * Hard wall-clock budget: stop *starting* new image generations past this.
 * An already-started image can still take ~10-12s, so we keep this well below
 * Vercel's 60s kill (≈45s + one in-flight image + upload/DB ≈ under 60s). The
 * video uses whatever illustrations completed (+ labels) and drops the rest.
 */
const REQUEST_BUDGET_MS = 45_000;

/**
 * Normalizes a question for cache keying: trim, lowercase, collapse runs of
 * whitespace. The hash combines this with the complexity so the same question
 * at different depths caches separately. Attachments are hashed by content so
 * "explain this PDF" with different PDFs never collides in the cache.
 */
function questionHash(
  question: string,
  complexity: Complexity,
  format: AnimationFormat,
  context: string,
  attachmentDigest: string,
): string {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  const ctx = context.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256")
    .update(`${normalized}|${complexity}|${format}|${ctx}|${attachmentDigest}`)
    .digest("hex");
}

/**
 * POST /api/generate-animation
 *
 * 1. Resolve session → 2. validate body → 3. rate limit → 4. cache lookup →
 * 5. on miss, generate with Gemini, validate output, persist → return.
 *
 * Thin wrapper: any unexpected throw is caught and mapped to a generic 500 so
 * we never leak stack traces / SDK internals (Next.js would otherwise surface
 * its default error response, which includes the stack in dev mode).
 */
export async function POST(request: NextRequest) {
  try {
    return await handleGenerate(request);
  } catch (err) {
    console.error("[Skribbl] generate-animation handler error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

async function handleGenerate(request: NextRequest) {
  // Wall-clock budget for the whole request (keeps us under Vercel's 60s cap).
  const deadline = Date.now() + REQUEST_BUDGET_MS;

  // 1. Session — every visitor has one (anonymous or full account).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // 2. Validate input. Field-level errors are safe to return.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateOrError(generateAnimationSchema, body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed.", fields: validation.errors },
      { status: 400 },
    );
  }
  const { question, complexity } = validation.data;
  const format: AnimationFormat = validation.data.format ?? "standard";
  const context = validation.data.context ?? "";
  const attachments = validation.data.attachments ?? [];

  // 2a. Attachments (images/PDFs) are a long-form-only capability.
  if (attachments.length > 0 && format !== "long") {
    return NextResponse.json(
      {
        error: "Generating from images or PDFs is available for long-form videos only.",
        code: "attachments_long_only",
      },
      { status: 400 },
    );
  }

  // 2b. Long-form gate: premium users (and admins) have unlimited access.
  // Everyone else gets FREE_LONG_FORM_LIMIT free long-form videos as a trial;
  // once used up the feature is "coming soon" until they upgrade.
  const premium = isAdminEmail(user.email) || (await isPremium(supabase, user.id));
  let onLongFormTrial = false;
  if (format === "long" && !premium) {
    const used = await getLongFormUsed(supabase, user.id);
    if (used >= FREE_LONG_FORM_LIMIT) {
      return NextResponse.json(
        {
          error:
            "You've used all your free long-form videos. Long-form is coming soon for everyone — stay tuned!",
          code: "coming_soon",
        },
        { status: 403 },
      );
    }
    onLongFormTrial = true;
  }

  // 3. Rate limit: hourly burst cap + daily ceiling (anonymous users get a
  // tighter quota than authed free users), plus a separate cap on
  // attachment-based generations (they cost more per request).
  const isAnonymous = user.is_anonymous ?? false;
  const meta = { route: "generate-animation", isAnonymous };
  const limiters = [
    isAnonymous ? anonGenerateLimiter : authedGenerateLimiter,
    isAnonymous ? anonDailyGenerateLimiter : authedDailyGenerateLimiter,
    ...(attachments.length > 0 ? [uploadLimiter] : []),
  ];
  for (const limiter of limiters) {
    const { success, reset } = await checkRateLimit(limiter, user.id, meta);
    if (!success) {
      const retryAfter = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  // Attachments are content-hashed into the cache key.
  const attachmentDigest = attachments
    .map((a) => createHash("sha256").update(a.data).digest("hex"))
    .join(",");
  const hash = questionHash(question, complexity, format, context, attachmentDigest);
  const admin = createAdminClient();

  // 4. Cache lookup — animations are publicly readable, but skip expired rows.
  const { data: cached } = await supabase
    .from("animations")
    .select("id, animation_data, summary")
    .eq("question_hash", hash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    // Bump hit_count (fire-and-forget; needs service role since users can't
    // write to `animations`).
    void bumpHitCount(admin, cached.id);
    await recordHistory(supabase, user.id, cached.id);
    // A cached long-form video still consumes a trial credit — the trial
    // covers deliveries of the feature, not just fresh generations.
    const longForm = onLongFormTrial
      ? await consumeLongFormCredit(admin, user.id)
      : undefined;

    return NextResponse.json({
      animationId: cached.id,
      summary: cached.summary,
      animation: cached.animation_data as unknown as AnimationData,
      cached: true,
      ...(longForm ? { longForm } : {}),
    });
  }

  // 5. Cache miss — generate with Gemini.
  const result = await generateAnimationFromGemini(
    question,
    complexity,
    format,
    context || undefined,
    attachments.length > 0
      ? attachments.map((a) => ({ mimeType: a.mimeType, data: a.data }))
      : undefined,
  );

  if (!result.ok) {
    if (result.reason === "blocked") {
      await logSecurityEvent("ai_content_blocked", user.id, {
        route: "generate-animation",
        detail: result.detail,
      });
      return NextResponse.json(
        { error: "That request couldn't be turned into a lesson. Try rephrasing." },
        { status: 422 },
      );
    }
    // api_error / empty / invalid_json → upstream failure.
    return NextResponse.json(
      { error: "Animation generation failed. Please try again." },
      { status: 502 },
    );
  }

  // 6. Validate the UNTRUSTED model output (image elements still carry prompts).
  // Sanitize first so one stray element can't sink the whole animation.
  const parsedModel = validateOrError(
    modelAnimationSchema,
    sanitizeAnimationData(result.data),
  );
  if (!parsedModel.success) {
    await logSecurityEvent("ai_output_validation_failed", user.id, {
      route: "generate-animation",
      complexity,
      errors: parsedModel.errors,
    });
    return NextResponse.json(
      { error: "Animation generation failed. Please try again." },
      { status: 502 },
    );
  }

  // 6b. Generate the whiteboard illustrations the model asked for, upload them
  // to storage, and swap each image element's prompt for its URL.
  const built = await buildIllustratedAnimation(
    admin,
    hash,
    parsedModel.data,
    format,
    deadline,
  );

  // 6c. Re-validate the final shape (image elements now carry URLs).
  const parsed = validateOrError(animationDataSchema, built);
  if (!parsed.success) {
    await logSecurityEvent("ai_output_validation_failed", user.id, {
      route: "generate-animation",
      complexity,
      errors: parsed.errors,
      stage: "final",
    });
    return NextResponse.json(
      { error: "Animation generation failed. Please try again." },
      { status: 502 },
    );
  }
  const animation: AnimationData = parsed.data;

  // 7. Persist to the shared cache (admin client — bypasses RLS on `animations`).
  const { data: inserted, error: insertError } = await admin
    .from("animations")
    .insert({
      question_hash: hash,
      question_text: question,
      complexity,
      animation_data: animation as unknown as Json,
      summary: animation.summary,
    })
    .select("id")
    .single();

  let animationId: string;
  if (insertError) {
    // Likely a race: another request inserted the same hash first. Re-read it.
    const { data: raced } = await supabase
      .from("animations")
      .select("id")
      .eq("question_hash", hash)
      .maybeSingle();
    if (!raced) {
      return NextResponse.json(
        { error: "Animation generation failed. Please try again." },
        { status: 502 },
      );
    }
    animationId = raced.id;
  } else {
    animationId = inserted.id;
  }

  // 8. Record in the user's history (user-scoped client; RLS enforces ownership).
  await recordHistory(supabase, user.id, animationId);

  // 9. Consume a free long-form trial credit only after a successful delivery.
  const longForm = onLongFormTrial
    ? await consumeLongFormCredit(admin, user.id)
    : undefined;

  return NextResponse.json({
    animationId,
    summary: animation.summary,
    animation,
    cached: false,
    ...(longForm ? { longForm } : {}),
  });
}

/**
 * How many long-form videos this user has generated on the free trial.
 * User-scoped read (RLS: select own row). Missing row / error → 0, which
 * errs on letting the user try; the increment itself is service-role-only.
 */
async function getLongFormUsed(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from("long_form_usage")
    .select("used")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.used ?? 0;
}

/**
 * Atomically consumes one free long-form credit (service-role RPC; users have
 * no write access to `long_form_usage`). Best-effort: on failure the user
 * simply gets a free pass this once, never a failed request.
 */
async function consumeLongFormCredit(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ used: number; limit: number; remaining: number } | undefined> {
  try {
    const { data: used, error } = await admin.rpc("increment_long_form_used", {
      uid: userId,
    });
    if (error || typeof used !== "number") return undefined;
    return {
      used,
      limit: FREE_LONG_FORM_LIMIT,
      remaining: Math.max(0, FREE_LONG_FORM_LIMIT - used),
    };
  } catch {
    return undefined;
  }
}

/**
 * Generates the whiteboard illustrations the model requested (in parallel,
 * bounded), uploads each to storage, and returns a final animation where every
 * `image` element carries a public URL instead of a prompt. Image elements
 * whose generation fails (or that exceed the per-video cap) are dropped; scenes
 * left empty are dropped too.
 */
async function buildIllustratedAnimation(
  admin: ReturnType<typeof createAdminClient>,
  hash: string,
  model: ModelAnimation,
  format: AnimationFormat,
  deadline: number,
): Promise<unknown> {
  const cap = MAX_IMAGES[format];
  const jobs: { si: number; ei: number; prompt: string; labels?: string[] }[] = [];
  model.scenes.forEach((scene, si) => {
    scene.elements.forEach((el, ei) => {
      if (el.type === "image" && jobs.length < cap) {
        jobs.push({ si, ei, prompt: el.prompt, labels: el.labels });
      }
    });
  });

  const urls = await mapWithConcurrency(jobs, IMAGE_CONCURRENCY, async (job) => {
    // Don't start a new generation if we're out of time — fall back to labels.
    if (Date.now() > deadline) return null;
    const buf = await generateWhiteboardImage(job.prompt, job.labels);
    if (!buf) return null;
    const path = `${hash}/${job.si}-${job.ei}.png`;
    const { error } = await admin.storage
      .from(ILLUSTRATION_BUCKET)
      .upload(path, buf, { contentType: "image/png", upsert: true });
    if (error) return null;
    return admin.storage.from(ILLUSTRATION_BUCKET).getPublicUrl(path).data
      .publicUrl;
  });

  const urlByKey = new Map<string, string>();
  jobs.forEach((job, i) => {
    const url = urls[i];
    if (url) urlByKey.set(`${job.si}-${job.ei}`, url);
  });

  const scenes: unknown[] = [];
  model.scenes.forEach((scene, si) => {
    const elements: unknown[] = [];
    let droppedImage = false;
    scene.elements.forEach((el, ei) => {
      if (el.type === "image") {
        const url = urlByKey.get(`${si}-${ei}`);
        if (!url) {
          droppedImage = true; // failed / over cap — drop
          return;
        }
        elements.push({
          type: "image",
          url,
          x: el.x,
          y: el.y,
          w: el.w,
          h: el.h,
          alt: el.prompt.slice(0, 300),
        });
      } else {
        elements.push(el);
      }
    });
    if (elements.length === 0) return;
    // An illustrated scene is an image + (at most) a short caption. If the
    // image was dropped, what's left is a caption on a blank board while the
    // narration talks about a visual that isn't there — drop the whole scene
    // rather than ship a blank one.
    if (droppedImage && elements.every((e) => (e as { type: string }).type === "text")) {
      return;
    }
    scenes.push({ ...scene, elements });
  });

  return {
    summary: model.summary,
    scenes,
    quiz: model.quiz,
    flashcards: model.flashcards,
  };
}

/**
 * Whether the user is on a premium plan. Reads their own profile via the
 * user-scoped client (RLS lets a user read their own row). Fails closed: any
 * error → treated as NOT premium.
 */
async function isPremium(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("plan, subscription_status")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return false;
  return data.plan === "premium" || data.subscription_status === "active";
}

/** Increment hit_count by 1. Best-effort; swallow errors. */
async function bumpHitCount(
  admin: ReturnType<typeof createAdminClient>,
  animationId: string,
): Promise<void> {
  try {
    const { data } = await admin
      .from("animations")
      .select("hit_count")
      .eq("id", animationId)
      .single();
    if (data) {
      await admin
        .from("animations")
        .update({ hit_count: data.hit_count + 1 })
        .eq("id", animationId);
    }
  } catch {
    // non-critical
  }
}

/** Insert a history row for this user + animation. Best-effort. */
async function recordHistory(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  animationId: string,
): Promise<void> {
  try {
    await supabase
      .from("user_history")
      .insert({ user_id: userId, animation_id: animationId });
  } catch {
    // non-critical: a failed history write shouldn't fail the generation.
  }
}
