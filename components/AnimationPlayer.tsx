"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationData } from "@/lib/types/animation";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/types/animation";
import {
  AnimationController,
  type PlaybackState,
} from "@/lib/animation/controller";
import {
  clearCanvas,
  loadIcon,
  type IconCache,
  type ImageCache,
} from "@/lib/animation/renderer";
import { Quiz } from "@/components/Quiz";
import { Flashcards } from "@/components/Flashcards";
import { track } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

type StudyMode = "none" | "flashcards" | "quiz";

interface AnimationPlayerProps {
  animation: AnimationData;
  animationId: string;
  /**
   * Whether to show the summary + quiz after playback. Defaults to true.
   * The landing-page demo sets this false (its sample animationId isn't a real
   * DB row, so quiz submission would have nothing to attach to).
   */
  enableQuiz?: boolean;
}

/** Collects the distinct icon names referenced anywhere in the animation. */
function collectIconNames(animation: AnimationData): string[] {
  const names = new Set<string>();
  for (const scene of animation.scenes) {
    for (const el of scene.elements) {
      if (el.type === "icon") names.add(el.icon);
    }
  }
  return [...names];
}

/** Collects the distinct illustration URLs referenced in the animation. */
function collectImageUrls(animation: AnimationData): string[] {
  const urls = new Set<string>();
  for (const scene of animation.scenes) {
    for (const el of scene.elements) {
      if (el.type === "image") urls.add(el.url);
    }
  }
  return [...urls];
}

/** Loads an <img> for canvas drawing; resolves null (never rejects) on error. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Ensures the handwritten canvas font is loaded BEFORE the first stroke draws.
 * Canvas text doesn't trigger CSS font loading, so without this the first
 * playback can silently fall back to a system font mid-scene.
 */
async function preloadCanvasFonts(): Promise<void> {
  try {
    if (typeof document === "undefined" || !document.fonts) return;
    await Promise.all([
      document.fonts.load('28px "Kalam"'),
      document.fonts.load('44px "Kalam"'),
    ]);
  } catch {
    // Non-fatal: worst case the canvas uses the fallback font.
  }
}

export function AnimationPlayer({
  animation,
  animationId,
  enableQuiz = true,
}: AnimationPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<AnimationController | null>(null);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<PlaybackState>("idle");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [studyMode, setStudyMode] = useState<StudyMode>("none");
  const [captionsOn, setCaptionsOn] = useState(true);
  /** Current subtitle line (one phrase at a time, synced to the voice). */
  const [caption, setCaption] = useState("");

  const sceneCount = animation.scenes.length;
  const currentNarration = animation.scenes[sceneIndex]?.narration ?? "";
  const flashcards = animation.flashcards ?? [];
  const hasFlashcards = flashcards.length > 0;

  // Preload icons, then build the controller. Re-runs if the animation changes.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    clearCanvas(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    setReady(false);
    setStudyMode("none");
    setProgress(0);
    setSceneIndex(0);

    const icons: IconCache = new Map();
    const images: ImageCache = new Map();

    // Preload icons, illustration images, and the canvas font in parallel.
    // A missing asset shouldn't block playback — it just won't be drawn.
    const iconLoaders = collectIconNames(animation).map(async (name) => {
      const parsed = await loadIcon(name);
      if (parsed) icons.set(name, parsed);
    });
    const imageLoaders = collectImageUrls(animation).map(async (url) => {
      const img = await loadImage(url);
      if (img) images.set(url, img);
    });

    void Promise.all([...iconLoaders, ...imageLoaders, preloadCanvasFonts()]).then(() => {
      if (cancelled) return;
      controllerRef.current = new AnimationController(ctx, animation, icons, images, {
        onScene: (i) => setSceneIndex(i),
        onProgress: (f) => setProgress(f),
        onStateChange: (s) => setState(s),
        onCaption: (text) => setCaption(text),
        onComplete: () => {
          track.animationCompleted(animation.scenes.length);
        },
      });
      setReady(true);
    });

    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [animation]);

  // Auto-play once everything is loaded.
  useEffect(() => {
    if (ready) controllerRef.current?.play();
  }, [ready]);

  function handleToggle() {
    controllerRef.current?.toggle();
  }

  function handleReplay() {
    controllerRef.current?.play();
  }

  function handleSeek(index: number) {
    controllerRef.current?.seekToScene(index);
  }

  const isFinished = state === "finished";

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg border border-ink/15 bg-white shadow-sm">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block aspect-video w-full"
          aria-label={`Whiteboard animation. Current narration: ${currentNarration}`}
        />

        {/* Subtitles — one spoken line at a time, synced to the voice. */}
        {captionsOn &&
          caption &&
          (state === "playing" || state === "paused") && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2 sm:p-4">
              <p
                key={caption}
                className="max-w-[94%] animate-caption-in rounded-md bg-ink/85 px-3 py-1.5 text-center text-[13px] font-medium leading-snug text-paper sm:text-base"
              >
                {caption}
              </p>
            </div>
          )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={isFinished ? handleReplay : handleToggle}
          disabled={!ready}
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:px-4"
        >
          {!ready
            ? "Loading…"
            : isFinished
              ? "Replay"
              : state === "playing"
                ? "Pause"
                : "Play"}
        </button>

        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
          <span className="hidden sm:inline">Scene </span>
          {Math.min(sceneIndex + 1, sceneCount)} / {sceneCount}
        </span>

        {/* Timeline */}
        <div className="h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        {/* Subtitles toggle */}
        <button
          onClick={() => setCaptionsOn((v) => !v)}
          aria-pressed={captionsOn}
          title={captionsOn ? "Hide subtitles" : "Show subtitles"}
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-2 text-xs font-semibold transition-colors",
            captionsOn
              ? "border-chalkboard bg-chalkboard text-paper"
              : "border-ink/30 text-ink hover:bg-muted",
          )}
        >
          CC
        </button>
      </div>

      {/* Scene dots (click to seek) */}
      {sceneCount > 1 && (
        <div className="flex flex-wrap gap-2">
          {animation.scenes.map((_, i) => (
            <button
              key={i}
              onClick={() => handleSeek(i)}
              disabled={!ready}
              aria-label={`Go to scene ${i + 1}`}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-colors disabled:opacity-50",
                i === sceneIndex ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
              )}
            />
          ))}
        </div>
      )}

      {/* Text summary — available as soon as the video is generated. */}
      <div className="rounded-lg border border-ink/15 bg-muted/40 p-4">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Summary
        </h2>
        <p className="text-sm leading-relaxed text-ink">{animation.summary}</p>
      </div>

      {/* Study tools — OPTIONAL, offered after the video finishes (never forced).
          Flashcards + quiz; click a tab to open, click again to close. */}
      {enableQuiz && isFinished && (
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap gap-2">
            {hasFlashcards && (
              <button
                onClick={() =>
                  setStudyMode((m) => (m === "flashcards" ? "none" : "flashcards"))
                }
                className={cn(
                  "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                  studyMode === "flashcards"
                    ? "border-chalkboard bg-chalkboard text-paper"
                    : "border-ink text-ink hover:bg-muted",
                )}
              >
                Study flashcards ({flashcards.length})
              </button>
            )}
            <button
              onClick={() => setStudyMode((m) => (m === "quiz" ? "none" : "quiz"))}
              className={cn(
                "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                studyMode === "quiz"
                  ? "border-chalkboard bg-chalkboard text-paper"
                  : "border-ink text-ink hover:bg-muted",
              )}
            >
              Take the quiz ({animation.quiz.length})
            </button>
          </div>

          {studyMode === "flashcards" && hasFlashcards && (
            <Flashcards cards={flashcards} />
          )}
          {studyMode === "quiz" && (
            <Quiz quiz={animation.quiz} animationId={animationId} />
          )}
        </div>
      )}
    </div>
  );
}
