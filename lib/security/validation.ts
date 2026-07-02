import { z } from "zod";
import { ALLOWED_ICONS } from "@/lib/types/animation";
import type { AnimationData } from "@/lib/types/animation";

/**
 * ============================================================
 * Input validation schemas
 * Define a schema for EVERY input the app accepts, even if a
 * given route isn't wired up yet. Route handlers should call
 * `validateOrError` first thing, before any side effects.
 * ============================================================
 */

export const complexitySchema = z.enum(["eli5", "standard", "advanced"]);

export const formatSchema = z.enum(["standard", "long"]);

/** File types a learner may attach to a long-form generation. */
export const ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

/**
 * Attachment size caps. Sent as base64 in the JSON body (~4/3 inflation), and
 * Vercel caps request bodies at 4.5 MB — so ~2 MB per file / ~3 MB total raw
 * keeps the whole request safely under that.
 */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS = 2;
const MAX_ATTACHMENT_B64 = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4;
const MAX_TOTAL_ATTACHMENT_B64 = Math.ceil((MAX_TOTAL_ATTACHMENT_BYTES * 4) / 3) + 8;

export const attachmentSchema = z.object({
  mimeType: z.enum(ATTACHMENT_MIME_TYPES),
  // Strict base64 payload (no data: prefix, no whitespace).
  data: z
    .string()
    .min(64)
    .max(MAX_ATTACHMENT_B64)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Invalid base64 data"),
  name: z.string().trim().min(1).max(120).optional(),
});
export type AttachmentInput = z.infer<typeof attachmentSchema>;

export const generateAnimationSchema = z
  .object({
    question: z.string().trim().min(10).max(500),
    complexity: complexitySchema,
    // Long-form is a premium feature; defaults to standard.
    format: formatSchema.optional().default("standard"),
    // Optional conversation context for follow-up questions (prior questions in
    // the same chat), so the model understands "explain that further" etc.
    context: z.string().trim().max(2000).optional(),
    // Optional image/PDF sources to explain from. Long-form only (enforced in
    // the route so the error message can be friendly).
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
  })
  .superRefine((val, ctx) => {
    const total = (val.attachments ?? []).reduce((n, a) => n + a.data.length, 0);
    if (total > MAX_TOTAL_ATTACHMENT_B64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attachments"],
        message: "Attachments are too large (3 MB total max).",
      });
    }
  });
export type GenerateAnimationInput = z.infer<typeof generateAnimationSchema>;

export const followUpSchema = z.object({
  animationId: z.string().uuid(),
  question: z.string().trim().min(10).max(300),
});
export type FollowUpInput = z.infer<typeof followUpSchema>;

export const historyMutationSchema = z.object({
  animationId: z.string().uuid(),
  isFavorite: z.boolean().optional(),
});
export type HistoryMutationInput = z.infer<typeof historyMutationSchema>;

export const quizResultSchema = z.object({
  animationId: z.string().uuid(),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
});
export type QuizResultInput = z.infer<typeof quizResultSchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const feedbackSchema = z.object({
  category: z.enum(["bug", "idea", "confusing", "other"]),
  message: z.string().trim().min(1).max(1000),
  pagePath: z.string().max(200).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export const adminSetPlanSchema = z.object({
  userId: z.string().uuid(),
  plan: z.enum(["free", "premium"]),
});
export type AdminSetPlanInput = z.infer<typeof adminSetPlanSchema>;

/**
 * ============================================================
 * AI output schema (animationDataSchema)
 * ============================================================
 * Validates the JSON returned by Gemini before it is ever stored or sent to a
 * browser. This is an UNTRUSTED boundary — the model can return anything — so
 * every string is length-bounded, every array is size-bounded, coordinates
 * are clamped to (a margin around) the 1280x720 canvas, and icon names are
 * restricted to the closed `ALLOWED_ICONS` set.
 *
 * This schema is kept structurally identical to the `AnimationData` type in
 * lib/types/animation.ts. The compile-time assertion at the bottom of this
 * block FAILS the build if the two ever drift apart.
 */

// Canvas is 1280x720; allow a small off-screen margin for strokes that start
// or end just past an edge, but reject wildly out-of-range coordinates.
const coordX = z.number().finite().min(-100).max(1380);
const coordY = z.number().finite().min(-100).max(820);

const strokeColor = z.string().trim().min(1).max(32).optional();
const strokeWidth = z.number().finite().min(0.5).max(20).optional();

const lineSchema = z.object({
  type: z.literal("line"),
  x1: coordX,
  y1: coordY,
  x2: coordX,
  y2: coordY,
  color: strokeColor,
  strokeWidth,
});

const arrowSchema = z.object({
  type: z.literal("arrow"),
  x1: coordX,
  y1: coordY,
  x2: coordX,
  y2: coordY,
  color: strokeColor,
  strokeWidth,
});

const circleSchema = z.object({
  type: z.literal("circle"),
  cx: coordX,
  cy: coordY,
  r: z.number().finite().min(1).max(720),
  color: strokeColor,
  strokeWidth,
});

const rectSchema = z.object({
  type: z.literal("rect"),
  x: coordX,
  y: coordY,
  w: z.number().finite().min(1).max(1280),
  h: z.number().finite().min(1).max(720),
  color: strokeColor,
  strokeWidth,
});

const iconSchema = z.object({
  type: z.literal("icon"),
  icon: z.enum(ALLOWED_ICONS),
  x: coordX,
  y: coordY,
  size: z.number().finite().min(8).max(400),
});

const textSchema = z.object({
  type: z.literal("text"),
  text: z.string().trim().min(1).max(120),
  x: coordX,
  y: coordY,
  size: z.number().finite().min(8).max(120).optional(),
  color: strokeColor,
});

// Freeform SVG path. Restrict to the path-data charset (commands + numbers +
// separators) so untrusted model output can't smuggle anything else in, and
// bound the length so a single illustration can't be enormous.
const pathSchema = z.object({
  type: z.literal("path"),
  d: z
    .string()
    .trim()
    .min(4)
    .max(6000)
    .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE,.\s+-]+$/, "Invalid SVG path data"),
  color: strokeColor,
  strokeWidth,
  fill: strokeColor,
});

const imageBox = {
  x: coordX,
  y: coordY,
  w: z.number().finite().min(40).max(1280),
  h: z.number().finite().min(40).max(720),
};

// As the MODEL emits it: a prompt describing the illustration to generate, plus
// the exact part names to label INSIDE the illustration (drawn by the image
// model, so the labels/pointers land accurately on the real features).
const modelImageSchema = z.object({
  type: z.literal("image"),
  prompt: z.string().trim().min(3).max(300),
  labels: z.array(z.string().trim().min(1).max(48)).max(10).optional(),
  ...imageBox,
});

// As it's stored / sent to the client: a URL to the generated illustration.
const imageSchema = z.object({
  type: z.literal("image"),
  url: z.string().url().max(600),
  ...imageBox,
  alt: z.string().trim().max(300).optional(),
});

const sharedElementSchemas = [
  lineSchema,
  arrowSchema,
  circleSchema,
  rectSchema,
  iconSchema,
  textSchema,
  pathSchema,
] as const;

/** Final element union (image carries a URL) — matches the AnimationData type. */
const animationElementSchema = z.discriminatedUnion("type", [
  ...sharedElementSchemas,
  imageSchema,
]);

/** Model-output element union (image carries a prompt). */
const modelElementSchema = z.discriminatedUnion("type", [
  ...sharedElementSchemas,
  modelImageSchema,
]);

const quizQuestionSchema = z.object({
  question: z.string().trim().min(1).max(240),
  options: z.tuple([
    z.string().trim().min(1).max(160),
    z.string().trim().min(1).max(160),
    z.string().trim().min(1).max(160),
    z.string().trim().min(1).max(160),
  ]),
  correctIndex: z.number().int().min(0).max(3),
});

const flashCardSchema = z.object({
  front: z.string().trim().min(1).max(200),
  back: z.string().trim().min(1).max(400),
});

const animationSceneSchema = z.object({
  narration: z.string().trim().min(1).max(400),
  elements: z.array(animationElementSchema).min(1).max(50),
});

/** Final, client-facing animation (image elements have URLs). */
export const animationDataSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  scenes: z.array(animationSceneSchema).min(1).max(30),
  quiz: z.array(quizQuestionSchema).min(2).max(10),
  // Optional so pre-flashcard cached animations still validate.
  flashcards: z.array(flashCardSchema).min(1).max(16).optional(),
});

/** Raw model output (image elements have prompts; transformed server-side). */
export const modelAnimationSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  scenes: z
    .array(
      z.object({
        narration: z.string().trim().min(1).max(400),
        elements: z.array(modelElementSchema).min(1).max(50),
      }),
    )
    .min(1)
    .max(30),
  quiz: z.array(quizQuestionSchema).min(2).max(10),
  // Lenient (optional) so a missing/short flashcard set never fails the whole
  // generation; the prompt asks for a full set and the sanitizer drops bad ones.
  flashcards: z.array(flashCardSchema).max(16).optional(),
});
export type ModelAnimation = z.infer<typeof modelAnimationSchema>;

/**
 * Best-effort cleanup of raw AI output BEFORE strict validation.
 *
 * Models occasionally slip in a stray element (e.g. an icon name we don't
 * ship, or an invented element type). Rather than reject the whole animation,
 * we drop only the offending pieces: invalid elements are removed, scenes left
 * with no elements are dropped, and malformed quiz questions are filtered out.
 * Whatever survives is then validated strictly by `animationDataSchema`.
 */
export function sanitizeAnimationData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;

  const rawScenes = Array.isArray(obj.scenes) ? obj.scenes : [];
  const scenes: unknown[] = [];
  for (const scene of rawScenes) {
    if (!scene || typeof scene !== "object") continue;
    const s = scene as Record<string, unknown>;
    const elements = Array.isArray(s.elements) ? s.elements : [];
    const cleanElements = elements.filter(
      (el) => modelElementSchema.safeParse(el).success,
    );
    if (cleanElements.length === 0) continue; // drop now-empty scenes
    scenes.push({ ...s, elements: cleanElements });
  }

  const quiz = Array.isArray(obj.quiz)
    ? obj.quiz.filter((q) => quizQuestionSchema.safeParse(q).success)
    : [];

  const flashcards = Array.isArray(obj.flashcards)
    ? obj.flashcards.filter((f) => flashCardSchema.safeParse(f).success)
    : [];

  return { ...obj, scenes, quiz, flashcards };
}

// Compile-time guarantee that the schema and the hand-written `AnimationData`
// type stay in lockstep. These are type-only checks (no runtime code): if the
// inferred schema type and `AnimationData` stop being mutually assignable,
// `Expect<false>` violates its `extends true` constraint and the build fails —
// forcing both sides to be updated together.
type Assignable<A, B> = [A] extends [B] ? true : false;
type Expect<T extends true> = T;
type _SchemaToType = Expect<
  Assignable<z.infer<typeof animationDataSchema>, AnimationData>
>;
type _TypeToSchema = Expect<
  Assignable<AnimationData, z.infer<typeof animationDataSchema>>
>;

/**
 * Discriminated result for validation. On failure we return only
 * field-level messages — safe to expose to the client, since they
 * describe the user's own input, not internal state.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

export function validateOrError<T>(
  schema: z.ZodType<T>,
  data: unknown,
): ValidationResult<T> {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  return {
    success: false,
    errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
  };
}

/**
 * ============================================================
 * Environment variable startup check
 * Fail LOUDLY at boot if a required server-side env var is
 * missing, instead of failing mysteriously deep in a request.
 * ============================================================
 */

const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

const REQUIRED_SERVER_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

/**
 * Asserts that all required env vars are present. The server-only
 * vars are only checked when running on the server (no `window`),
 * so this is safe to call from shared module-init code.
 *
 * Throws an Error listing every missing var.
 */
export function assertServerEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_PUBLIC_ENV) {
    if (!process.env[key]) missing.push(key);
  }

  // Server-only vars must never be read in the browser bundle.
  if (typeof window === "undefined") {
    for (const key of REQUIRED_SERVER_ENV) {
      if (!process.env[key]) missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[Skribbl] Missing required environment variable(s): ${missing.join(
        ", ",
      )}. Copy .env.local.example to .env.local and fill in the values.`,
    );
  }
}
