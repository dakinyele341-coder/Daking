"use client";

import { captureEvent } from "@/lib/analytics/posthog";
import type { Complexity } from "@/lib/types/database";

/**
 * Typed analytics event helpers. Keeping every event behind a function with a
 * fixed property shape guarantees consistent names and — critically — that we
 * only ever send METADATA (counts, lengths, booleans, categories), never raw
 * question text, narration, or other user-identifiable strings.
 */
export type FeedbackCategory = "bug" | "idea" | "confusing" | "other";

export const track = {
  questionSubmitted(complexity: Complexity, questionLength: number): void {
    captureEvent("question_submitted", { complexity, questionLength });
  },
  animationGenerated(cacheHit: boolean, sceneCount: number): void {
    captureEvent("animation_generated", { cacheHit, sceneCount });
  },
  animationCompleted(sceneCount: number): void {
    captureEvent("animation_completed", { sceneCount });
  },
  quizCompleted(score: number, total: number): void {
    captureEvent("quiz_completed", { score, total });
  },
  generationRefused(reason: string): void {
    captureEvent("generation_refused", { reason });
  },
  rateLimitHit(): void {
    captureEvent("rate_limit_hit");
  },
  feedbackSubmitted(category: FeedbackCategory): void {
    captureEvent("feedback_submitted", { category });
  },
} as const;
