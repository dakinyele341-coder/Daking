/**
 * ============================================================
 * Animation playback controller
 * ============================================================
 * Drives an `AnimationData` onto a canvas, scene by scene:
 *   - apportions drawing time across each scene's elements (icons: a fixed
 *     0.6s self-drawing animation),
 *   - narrates each scene via `speechSynthesis` (rate 0.95, best voice),
 *   - advances frames with `requestAnimationFrame` and eased progress.
 *
 * Pacing is EVENT-DRIVEN: a scene only advances once BOTH its drawing has
 * finished AND its narration has ended (speech `onend`/`onerror`), with a
 * 15-second safety ceiling so a stuck/absent voice can never hang playback.
 *
 * Browser-only. Construct from a client component after the canvas mounts.
 */

import type { AnimationData } from "@/lib/types/animation";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/types/animation";
import {
  clearCanvas,
  drawElement,
  elementDrawCost,
  type IconCache,
  type ImageCache,
} from "@/lib/animation/renderer";
import { pickBestVoice, waitForVoices } from "@/lib/animation/voice";

/** Tunable playback speeds (all times in ms). */
export const SPEED = {
  /** Canvas px drawn per millisecond. */
  DRAW_PX_PER_MS: 0.9,
  /** Floor on how long any single element takes to draw. */
  MIN_ELEMENT_MS: 250,
  /** Icons always self-draw over exactly this long. */
  ICON_DRAW_MS: 600,
  /** Speech synthesis rate. */
  TTS_RATE: 0.95,
  /**
   * Estimated ms the narration takes per word at the rate above. Used to PACE
   * the drawing so strokes appear while the line is being spoken (rather than
   * finishing early and sitting idle). Tuned to typical Web Speech timing.
   */
  MS_PER_WORD: 360,
  /** Small lead-in before speech actually starts (engine warm-up). */
  NARRATION_LEAD_MS: 250,
} as const;

/** Hard ceiling on how long a single scene may take, even waiting on speech. */
const SCENE_SAFETY_MS = 20_000;

export type PlaybackState = "idle" | "playing" | "paused" | "finished";

export interface ControllerCallbacks {
  onScene?: (index: number, total: number) => void;
  onProgress?: (fraction: number) => void;
  onStateChange?: (state: PlaybackState) => void;
  onComplete?: () => void;
}

interface ScheduledElement {
  index: number;
  start: number; // ms from scene start
  end: number; // ms from scene start
}

interface ScenePlan {
  drawDuration: number;
  elements: ScheduledElement[];
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function countWords(text: string): number {
  const t = text.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

/** Rough estimate of how long the narration will be spoken (ms). */
function estimateNarrationMs(narration: string): number {
  const words = countWords(narration);
  if (words === 0) return 0;
  return SPEED.NARRATION_LEAD_MS + words * SPEED.MS_PER_WORD;
}

export class AnimationController {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly data: AnimationData;
  private readonly icons: IconCache;
  private readonly images: ImageCache;
  private readonly callbacks: ControllerCallbacks;

  private readonly plans: ScenePlan[];
  private readonly sceneCount: number;

  private state: PlaybackState = "idle";
  private sceneIndex = 0;

  private rafId: number | null = null;
  private sceneStartedAt = 0;
  private pausedAt = 0;

  // Per-scene completion signals.
  private narrationStarted = false;
  private drawingDone = false;
  private speechDone = false;
  /** Generation counter so a stale utterance's onend can't settle a new scene. */
  private speechGen = 0;

  private voice: SpeechSynthesisVoice | null = null;

  constructor(
    ctx: CanvasRenderingContext2D,
    data: AnimationData,
    icons: IconCache,
    images: ImageCache,
    callbacks: ControllerCallbacks = {},
  ) {
    this.ctx = ctx;
    this.data = data;
    this.icons = icons;
    this.images = images;
    this.callbacks = callbacks;
    this.sceneCount = data.scenes.length;

    this.plans = data.scenes.map((scene) =>
      this.planScene(scene.elements, scene.narration),
    );

    // Pick the nicest voice once it's available (async); until then we fall
    // back to the browser default.
    void waitForVoices().then((voices) => {
      this.voice = pickBestVoice(voices);
    });
  }

  // ---- Planning -------------------------------------------------------------

  private planScene(
    elements: AnimationData["scenes"][number]["elements"],
    narration: string,
  ): ScenePlan {
    // 1. Raw drawing time from each element's "ink cost".
    const scheduled: ScheduledElement[] = [];
    let rawDuration = 0;
    elements.forEach((el, index) => {
      const dur =
        el.type === "icon"
          ? SPEED.ICON_DRAW_MS
          : Math.max(SPEED.MIN_ELEMENT_MS, elementDrawCost(el) / SPEED.DRAW_PX_PER_MS);
      scheduled.push({ index, start: rawDuration, end: rawDuration + dur });
      rawDuration += dur;
    });

    // 2. Stretch (never compress) the schedule so the drawing spans roughly the
    //    spoken narration — strokes land WHILE the matching words are said,
    //    instead of finishing early and idling. Event-driven advance (waiting
    //    on speech `onend`) still corrects any estimate drift.
    const narrationMs = estimateNarrationMs(narration);
    const span = Math.max(rawDuration, narrationMs);
    const scale = rawDuration > 0 ? span / rawDuration : 1;
    if (scale !== 1) {
      for (const s of scheduled) {
        s.start *= scale;
        s.end *= scale;
      }
    }

    return { drawDuration: span, elements: scheduled };
  }

  // ---- Public controls ------------------------------------------------------

  play(): void {
    if (this.state === "playing") return;
    if (this.state === "finished" || this.state === "idle") {
      this.sceneIndex = 0;
    }
    this.beginScene(this.sceneIndex);
    this.setState("playing");
    this.loop();
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.pausedAt = this.now();
    this.cancelRaf();
    this.safeSpeech((s) => s.pause());
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.sceneStartedAt += this.now() - this.pausedAt;
    this.safeSpeech((s) => s.resume());
    this.setState("playing");
    this.loop();
  }

  toggle(): void {
    if (this.state === "playing") this.pause();
    else if (this.state === "paused") this.resume();
    else this.play();
  }

  stop(): void {
    this.cancelRaf();
    this.speechGen++; // invalidate any in-flight utterance callbacks
    this.safeSpeech((s) => s.cancel());
    this.sceneIndex = 0;
    this.setState("idle");
    clearCanvas(this.ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.callbacks.onProgress?.(0);
  }

  seekToScene(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.sceneCount - 1));
    this.cancelRaf();
    this.safeSpeech((s) => s.cancel());
    this.sceneIndex = clamped;
    this.beginScene(clamped);
    this.setState("playing");
    this.loop();
  }

  destroy(): void {
    this.cancelRaf();
    this.speechGen++;
    this.safeSpeech((s) => s.cancel());
    this.state = "idle";
  }

  getState(): PlaybackState {
    return this.state;
  }

  getSceneCount(): number {
    return this.sceneCount;
  }

  // ---- Internal -------------------------------------------------------------

  private beginScene(index: number): void {
    this.sceneStartedAt = this.now();
    this.narrationStarted = false;
    this.drawingDone = false;
    this.speechDone = false;
    this.speechGen++; // any older utterance callback is now stale
    this.callbacks.onScene?.(index, this.sceneCount);
  }

  private loop = (): void => {
    if (this.state !== "playing") return;

    const plan = this.plans[this.sceneIndex];
    const scene = this.data.scenes[this.sceneIndex];
    if (!plan || !scene) {
      this.finish();
      return;
    }

    const elapsed = this.now() - this.sceneStartedAt;

    // Kick off narration once, at the start of the scene.
    if (!this.narrationStarted) {
      this.narrationStarted = true;
      this.speak(scene.narration);
    }

    this.renderScene(this.sceneIndex, elapsed);

    if (elapsed >= plan.drawDuration) this.drawingDone = true;
    this.reportProgress(elapsed, plan);

    // Advance once both drawing and speech are done, or the safety cap trips.
    if ((this.drawingDone && this.speechDone) || elapsed >= SCENE_SAFETY_MS) {
      this.advanceScene();
      return;
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private renderScene(sceneIndex: number, elapsed: number): void {
    const plan = this.plans[sceneIndex];
    const scene = this.data.scenes[sceneIndex];
    if (!plan || !scene) return;

    clearCanvas(this.ctx, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const sched of plan.elements) {
      const element = scene.elements[sched.index];
      if (!element) continue;

      let progress: number;
      if (elapsed >= sched.end) {
        progress = 1;
      } else if (elapsed <= sched.start) {
        continue; // not started yet
      } else {
        const span = sched.end - sched.start;
        progress = easeInOutQuad(span === 0 ? 1 : (elapsed - sched.start) / span);
      }

      drawElement(this.ctx, element, progress, this.icons, this.images);
    }
  }

  private advanceScene(): void {
    if (this.sceneIndex >= this.sceneCount - 1) {
      this.finish();
      return;
    }
    this.sceneIndex += 1;
    this.beginScene(this.sceneIndex);
    this.rafId = requestAnimationFrame(this.loop);
  }

  private finish(): void {
    this.cancelRaf();
    this.callbacks.onProgress?.(1);
    this.setState("finished");
    this.callbacks.onComplete?.();
  }

  private reportProgress(elapsed: number, plan: ScenePlan): void {
    if (this.sceneCount === 0) return;
    const frac =
      plan.drawDuration > 0 ? Math.min(1, elapsed / plan.drawDuration) : 1;
    const overall = (this.sceneIndex + frac) / this.sceneCount;
    this.callbacks.onProgress?.(Math.min(1, overall));
  }

  private setState(state: PlaybackState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private cancelRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  // ---- Speech synthesis -----------------------------------------------------

  private speak(text: string): void {
    const token = this.speechGen;

    const ran = this.safeSpeech((synth) => {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = SPEED.TTS_RATE;
      if (this.voice) utterance.voice = this.voice;
      utterance.onend = () => this.settleSpeech(token);
      utterance.onerror = () => this.settleSpeech(token);
      synth.speak(utterance);
    });

    // No speech synthesis available → treat narration as instantly "done" so
    // pacing falls back to drawing duration only.
    if (!ran) this.speechDone = true;
  }

  /** Marks speech finished, but only for the scene that started it. */
  private settleSpeech(token: number): void {
    if (token !== this.speechGen) return; // stale (scene changed)
    this.speechDone = true;
  }

  /** Runs `fn` with the speech engine if present; returns whether it ran. */
  private safeSpeech(fn: (synth: SpeechSynthesis) => void): boolean {
    if (typeof window === "undefined") return false;
    const synth = window.speechSynthesis;
    if (!synth) return false;
    try {
      fn(synth);
      return true;
    } catch {
      return false;
    }
  }
}
