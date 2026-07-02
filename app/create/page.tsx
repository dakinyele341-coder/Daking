"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimationPlayer } from "@/components/AnimationPlayer";
import { AppHeader } from "@/components/AppHeader";
import type { VoiceMode } from "@/lib/animation/controller";
import type { AnimationData, AnimationFormat } from "@/lib/types/animation";
import type { Complexity } from "@/lib/types/database";
import { FREE_LONG_FORM_LIMIT } from "@/lib/plans";
import {
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
} from "@/lib/security/validation";
import { track } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

/** An image/PDF the learner attached, held as base64 until submit. */
interface AttachedFile {
  name: string;
  mimeType: (typeof ATTACHMENT_MIME_TYPES)[number];
  /** Raw base64 payload (no data: prefix). */
  data: string;
  /** Original size in bytes, for the limit checks and the size chip. */
  size: number;
}

/** "245 KB" / "1.4 MB" */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads a File into raw base64 (strips the data-URL prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface GenerateResponse {
  animationId: string;
  animation: AnimationData;
  summary: string;
  cached: boolean;
  /** Present when a free long-form trial credit was consumed. */
  longForm?: { used: number; limit: number; remaining: number };
}

/** Shape of GET /api/usage (subset the create page needs). */
interface UsageInfo {
  plan: "free" | "premium";
  longForm: {
    unlimited: boolean;
    remaining: number | null;
    comingSoon: boolean;
  };
}

/** One turn in the chat: the question asked and the video it produced. */
interface Turn {
  id: string;
  question: string;
  /** Names of any attached files, for display in the thread. */
  attachmentNames?: string[];
  result: GenerateResponse;
}

const COMPLEXITY_OPTIONS: { value: Complexity; label: string; hint: string }[] = [
  { value: "eli5", label: "ELI5", hint: "Explain like I'm 5" },
  { value: "standard", label: "Standard", hint: "High-school level" },
  { value: "advanced", label: "Advanced", hint: "In-depth & technical" },
];

const MIN_LEN = 10;
const MAX_LEN = 500;

/** Human-friendly "resets in …" from a Retry-After header (seconds). */
function formatRetry(retryAfter: string | null): string {
  const s = retryAfter ? parseInt(retryAfter, 10) : NaN;
  if (!Number.isFinite(s) || s <= 0) return "a little while";
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.ceil(m / 60)} hr`;
}

export default function CreatePage() {
  const [question, setQuestion] = useState("");
  const [complexity, setComplexity] = useState<Complexity>("standard");
  const [format, setFormat] = useState<AnimationFormat>("standard");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("browser");
  const [enhancedVoiceAvailable, setEnhancedVoiceAvailable] = useState(false);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);

  const threadTopRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFollowUp = turns.length > 0;

  const trimmedLen = question.trim().length;
  const valid = trimmedLen >= MIN_LEN && trimmedLen <= MAX_LEN;

  const isPremium = usage?.plan === "premium";
  const longFormRemaining = usage?.longForm.remaining ?? null;
  const longFormComingSoon = usage !== null && !isPremium && usage.longForm.comingSoon;
  // Free users can use long-form while trial credits last; once loaded and
  // exhausted it's "coming soon".
  const longFormEnabled =
    isPremium || (usage !== null && (longFormRemaining ?? 0) > 0);

  // Prefill from a ?q= link (e.g. example questions in the welcome email).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuestion(q.slice(0, MAX_LEN));
  }, []);

  /** Plan + trial credits + rate limit state, from /api/usage. */
  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as UsageInfo;
      setUsage(data);
      // If the trial just ran out, don't leave an unusable format selected.
      if (data.plan !== "premium" && data.longForm.comingSoon) {
        setFormat((f) => (f === "long" ? "standard" : f));
      }
    } catch {
      // Status info is a nicety — never break the page over it.
    }
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  // Feature flags (e.g. whether the enhanced AI voice is configured) +
  // restore the user's saved voice preference.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        if (!res.ok) return;
        const cfg = (await res.json()) as { enhancedVoice?: boolean };
        if (!active || !cfg.enhancedVoice) return;
        setEnhancedVoiceAvailable(true);
        if (window.localStorage.getItem("skribbl-voice") === "enhanced") {
          setVoiceMode("enhanced");
        }
      } catch {
        // Flags are a nicety — never break the page over them.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function toggleVoiceMode() {
    setVoiceMode((v) => {
      const next: VoiceMode = v === "browser" ? "enhanced" : "browser";
      try {
        window.localStorage.setItem("skribbl-voice", next);
      } catch {
        // private mode etc.
      }
      track.voiceModeChanged(next);
      return next;
    });
  }

  // Attachments are a long-form-only capability: drop them if the user
  // switches back to standard (or the trial runs out and we auto-switch).
  useEffect(() => {
    if (format !== "long") setFiles([]);
  }, [format]);

  async function handleFilesSelected(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);

    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
        break;
      }
      const mimeType = ATTACHMENT_MIME_TYPES.find((m) => m === file.type);
      if (!mimeType) {
        setError("Only PNG, JPEG, WebP images and PDF files are supported.");
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(
          `"${file.name}" is too large — each file must be under ${formatSize(MAX_ATTACHMENT_BYTES)}.`,
        );
        continue;
      }
      const total = next.reduce((n, f) => n + f.size, 0) + file.size;
      if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
        setError(
          `Attachments must be under ${formatSize(MAX_TOTAL_ATTACHMENT_BYTES)} in total.`,
        );
        continue;
      }
      try {
        const data = await fileToBase64(file);
        next.push({ name: file.name, mimeType, data, size: file.size });
      } catch {
        setError(`Couldn't read "${file.name}". Please try again.`);
      }
    }
    setFiles(next);
    // Allow re-selecting the same file after removing it.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;

    const asked = question.trim();
    setLoading(true);
    setError(null);
    track.questionSubmitted(complexity, trimmedLen);

    // Build conversation context from earlier questions in this chat.
    const context = turns
      .map((t) => t.question)
      .slice(-4)
      .join(" → ");

    const attached = format === "long" ? files : [];

    try {
      const res = await fetch("/api/generate-animation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: asked,
          complexity,
          format,
          ...(context ? { context } : {}),
          ...(attached.length > 0
            ? {
                attachments: attached.map((f) => ({
                  mimeType: f.mimeType,
                  data: f.data,
                  name: f.name,
                })),
              }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (GenerateResponse & { error?: string; code?: string })
        | null;

      if (!res.ok) {
        if (res.status === 429) {
          track.rateLimitHit();
          setError(`You've hit today's limit. Resets in ${formatRetry(res.headers.get("Retry-After"))}.`);
        } else if (res.status === 403) {
          if (data?.code === "coming_soon") {
            setError(null);
            setNotice(
              "You've used all your free long-form videos — long-form is coming soon for everyone. Your video was not generated; switch to Standard to keep learning.",
            );
            setFormat("standard");
            void refreshUsage();
          } else {
            setError(data?.error ?? "Long-form videos are a premium feature.");
          }
        } else if (res.status === 422) {
          track.generationRefused(String(res.status));
          setError(
            "Couldn't turn that into a diagram — try rephrasing it as a question about a topic.",
          );
        } else {
          track.generationRefused(String(res.status));
          setError(data?.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      if (data) {
        track.animationGenerated(data.cached, data.animation.scenes.length);
        setTurns((prev) => [
          ...prev,
          {
            id: data.animationId,
            question: asked,
            ...(attached.length > 0
              ? { attachmentNames: attached.map((f) => f.name) }
              : {}),
            result: data,
          },
        ]);
        setQuestion("");
        setFiles([]);

        // A free long-form credit was consumed — update the counter and
        // remind the user how many are left.
        if (data.longForm) {
          const { remaining } = data.longForm;
          setNotice(
            remaining > 0
              ? `Free long-form video used — ${remaining} of ${FREE_LONG_FORM_LIMIT} left.`
              : "That was your last free long-form video. Long-form is coming soon for everyone!",
          );
          if (remaining === 0) setFormat("standard");
        }
        void refreshUsage();

        // Bring the freshly added (newest) turn into view.
        requestAnimationFrame(() =>
          threadTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleNewChat() {
    setTurns([]);
    setQuestion("");
    setFiles([]);
    setError(null);
  }

  return (
    <main className="container max-w-3xl py-5 sm:py-10">
      <AppHeader />

      {/* Free long-form trial banner — remind free users what they have left. */}
      {usage !== null && !isPremium && (longFormRemaining ?? 0) > 0 && (
        <div
          role="status"
          className="mb-6 flex items-start gap-2 rounded-md border border-marker/40 bg-marker/10 px-4 py-3 text-sm"
        >
          <span aria-hidden>🎁</span>
          <p>
            <span className="font-medium">Free preview:</span> you have{" "}
            <span className="font-semibold">
              {longFormRemaining} of {FREE_LONG_FORM_LIMIT}
            </span>{" "}
            free long-form videos left — including generating videos from your own
            images and PDFs. Try a deep-dive explainer before long-form goes
            premium!
          </p>
        </div>
      )}

      {/* One-off notices (credit used, trial ended, …) */}
      {notice && (
        <div
          role="status"
          className="mb-6 flex items-start justify-between gap-3 rounded-md border border-chalkboard/30 bg-muted px-4 py-3 text-sm"
        >
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notice"
            className="shrink-0 text-muted-foreground hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* Composer */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between">
          <label htmlFor="question" className="text-sm font-medium">
            {isFollowUp ? "Ask a follow-up" : "What would you like explained?"}
          </label>
          {isFollowUp && (
            <button
              type="button"
              onClick={handleNewChat}
              className="text-xs font-medium text-ink-muted underline"
            >
              New chat
            </button>
          )}
        </div>

        <div className="space-y-1">
          <textarea
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            maxLength={MAX_LEN}
            placeholder={
              isFollowUp
                ? "e.g. Why does that happen? Explain the next step…"
                : "e.g. How does photosynthesis work?"
            }
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{trimmedLen < MIN_LEN ? `At least ${MIN_LEN} characters` : " "}</span>
            <span>
              {trimmedLen} / {MAX_LEN}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-sm font-medium">Complexity</span>
          <div className="grid grid-cols-3 gap-2">
            {COMPLEXITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setComplexity(opt.value)}
                className={cn(
                  "rounded-md border px-2 py-2 text-left transition-colors sm:px-3",
                  complexity === opt.value
                    ? "border-chalkboard bg-chalkboard text-paper"
                    : "border-ink/20 hover:bg-muted",
                )}
              >
                <span className="block text-sm font-medium">{opt.label}</span>
                <span
                  className={cn(
                    "hidden text-xs sm:block",
                    complexity === opt.value ? "text-paper/70" : "text-muted-foreground",
                  )}
                >
                  {opt.hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Voice — only shown when the enhanced AI voice is configured */}
        {enhancedVoiceAvailable && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Voice</span>
            <button
              type="button"
              onClick={toggleVoiceMode}
              aria-pressed={voiceMode === "enhanced"}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                voiceMode === "enhanced"
                  ? "border-chalkboard bg-chalkboard text-paper"
                  : "border-ink/30 text-ink hover:bg-muted",
              )}
            >
              {voiceMode === "enhanced" ? "✨ Enhanced" : "Standard"}
            </button>
            <span className="text-xs text-muted-foreground">
              {voiceMode === "enhanced"
                ? "Natural AI narration"
                : "Your device's built-in voice"}
            </span>
          </div>
        )}

        {/* Length / format — long-form is premium */}
        <div className="space-y-1">
          <span className="text-sm font-medium">Length</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat("standard")}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors",
                format === "standard"
                  ? "border-chalkboard bg-chalkboard text-paper"
                  : "border-ink/20 hover:bg-muted",
              )}
            >
              <span className="block text-sm font-medium">Standard</span>
              <span
                className={cn(
                  "block text-xs",
                  format === "standard" ? "text-paper/70" : "text-muted-foreground",
                )}
              >
                A focused explainer
              </span>
            </button>

            <button
              type="button"
              onClick={() => longFormEnabled && setFormat("long")}
              disabled={!longFormEnabled}
              aria-disabled={!longFormEnabled}
              title={
                longFormEnabled
                  ? undefined
                  : longFormComingSoon
                    ? "Coming soon"
                    : "Checking availability…"
              }
              className={cn(
                "relative rounded-md border px-3 py-2 text-left transition-colors",
                format === "long"
                  ? "border-chalkboard bg-chalkboard text-paper"
                  : "border-ink/20 hover:bg-muted",
                !longFormEnabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                Long-form
                {isPremium ? (
                  <span className="rounded bg-marker px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper">
                    Premium
                  </span>
                ) : longFormComingSoon ? (
                  <span className="rounded bg-chalkboard px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper">
                    Coming soon
                  </span>
                ) : usage !== null ? (
                  <span className="rounded bg-marker px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-paper">
                    {longFormRemaining} free left
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "block text-xs",
                  format === "long" ? "text-paper/70" : "text-muted-foreground",
                )}
              >
                A deep, detailed video
              </span>
            </button>
          </div>
          {longFormComingSoon && (
            <p className="text-xs text-muted-foreground">
              Long-form videos (and generating from images &amp; PDFs) are coming
              soon — you&apos;ve used your free previews.
            </p>
          )}
        </div>

        {/* Attachments — long-form only (image/PDF → video) */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Explain from a file</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {longFormComingSoon ? "Coming soon" : "Long-form only"}
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_MIME_TYPES.join(",")}
            multiple
            onChange={(e) => void handleFilesSelected(e.target.files)}
            className="hidden"
            id="attachments"
          />

          {format === "long" && longFormEnabled ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={files.length >= MAX_ATTACHMENTS}
                  className="rounded-md border border-dashed border-ink/30 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📎 Attach image or PDF
                </button>
                {files.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-muted px-3 py-1 text-xs"
                  >
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <span className="text-muted-foreground">{formatSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                      aria-label={`Remove ${f.name}`}
                      className="text-muted-foreground hover:text-ink"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Turn a diagram, textbook page, or PDF notes into a video. Up to{" "}
                {MAX_ATTACHMENTS} files, {formatSize(MAX_ATTACHMENT_BYTES)} each —
                counts as one of your free long-form videos.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {longFormComingSoon
                ? "Generating videos from images & PDFs is coming soon."
                : "Select Long-form above to generate a video from your own images or PDF notes."}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!valid || loading}
          className="w-full rounded-md bg-marker px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Sketching it out…" : isFollowUp ? "Ask" : "Show me"}
        </button>
      </form>

      {/* Thread (newest first) */}
      <section className="mt-10 space-y-10">
        <div ref={threadTopRef} />
        {loading && <PlayerSkeleton />}

        {[...turns].reverse().map((turn, i) => (
          <article key={turn.id} className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {/* number from oldest=1 */}
                {turns.length - i}
              </span>
              <h2 className="text-sm font-medium text-ink">{turn.question}</h2>
            </div>
            {turn.attachmentNames && turn.attachmentNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {turn.attachmentNames.map((name, j) => (
                  <span
                    key={`${name}-${j}`}
                    className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border border-ink/15 bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    📎 {name}
                  </span>
                ))}
              </div>
            )}
            <AnimationPlayer
              animation={turn.result.animation}
              animationId={turn.result.animationId}
              question={turn.question}
              voiceMode={voiceMode}
            />
          </article>
        ))}
      </section>
    </main>
  );
}

function PlayerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="aspect-video w-full animate-pulse rounded-lg border border-border bg-muted" />
      <div className="flex items-center gap-3">
        <div className="h-9 w-20 animate-pulse rounded-md bg-muted" />
        <div className="h-2 flex-1 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  );
}
