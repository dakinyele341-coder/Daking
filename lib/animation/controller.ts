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
  drawWatermark,
  drawBurnedCaption,
  elementDrawCost,
  type IconCache,
  type ImageCache,
} from "@/lib/animation/renderer";
import { pickBestVoice, waitForVoices } from "@/lib/animation/voice";

/**
 * Narration engine: the browser's built-in speechSynthesis, or "enhanced" —
 * pre-rendered AI audio fetched from /api/tts (falls back to browser TTS on
 * any failure, so enhanced mode can never break playback).
 */
export type VoiceMode = "browser" | "enhanced";

export interface ControllerOptions {
  voiceMode?: VoiceMode;
}

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
   * finishing early and sitting idle). Deliberately on the SLOW side — many
   * voices (Google's remote voices especially) speak slower than the classic
   * estimate and fire no boundary events, and captions that lag slightly feel
   * fine while captions that lead the voice feel broken. A per-playback
   * calibration (see speechRateFactor) corrects the estimate from the actual
   * spoken duration of earlier scenes.
   */
  MS_PER_WORD: 400,
  /** Small lead-in before speech actually starts (engine warm-up). */
  NARRATION_LEAD_MS: 250,
  /**
   * Max factor the drawing may be sped up to fit the narration estimate. A
   * drawing-heavy scene compresses toward the spoken duration instead of
   * trailing long after the voice has finished — but never so fast it blurs.
   */
  MAX_DRAW_SPEEDUP: 1.6,
  /**
   * Once the voice has ACTUALLY finished but strokes are still going, the
   * clock runs this much faster so the board catches up within a beat.
   */
  CATCHUP_FACTOR: 1.8,
  /** Floor on a scene's drawing span so compression can't make it jarring. */
  MIN_SCENE_MS: 1800,
} as const;

/** Longest caption line shown at once (chars). Roughly one spoken phrase. */
const CAPTION_MAX_CHARS = 64;

/** Hard ceiling on how long a single scene may take, even waiting on speech. */
const SCENE_SAFETY_MS = 20_000;

export type PlaybackState = "idle" | "playing" | "paused" | "finished";

export interface ControllerCallbacks {
  onScene?: (index: number, total: number) => void;
  onProgress?: (fraction: number) => void;
  onStateChange?: (state: PlaybackState) => void;
  onComplete?: () => void;
  /** Fires whenever the caption line changes (line-by-line subtitles). */
  onCaption?: (text: string) => void;
}

export interface ScheduledElement {
  index: number;
  start: number; // ms from scene start
  end: number; // ms from scene start
}

/** One subtitle line: its text plus its character range in the narration. */
export interface CaptionChunk {
  text: string;
  /** Index of the chunk's first character in the full narration string. */
  start: number;
  /** Index just past the chunk's last character. */
  end: number;
}

export interface ScenePlan {
  drawDuration: number;
  narrationMs: number;
  elements: ScheduledElement[];
  captions: CaptionChunk[];
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp01Local(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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

/**
 * Splits a narration into short caption lines shown one after another:
 * sentence boundaries first, then long sentences at commas/word boundaries so
 * no line exceeds ~CAPTION_MAX_CHARS. Character ranges are tracked against the
 * ORIGINAL string so speech `onboundary` charIndex events map straight onto a
 * chunk.
 */
export function chunkNarration(narration: string): CaptionChunk[] {
  const chunks: CaptionChunk[] = [];

  // Sentences (keep terminal punctuation). Falls back to the whole string.
  const sentenceRe = /[^.!?…]+[.!?…]*/g;
  let match: RegExpExecArray | null;
  const sentences: { text: string; start: number }[] = [];
  while ((match = sentenceRe.exec(narration)) !== null) {
    if (match[0].trim().length > 0) {
      sentences.push({ text: match[0], start: match.index });
    }
  }
  if (sentences.length === 0) {
    const t = narration.trim();
    if (t) sentences.push({ text: narration, start: 0 });
  }

  for (const sentence of sentences) {
    // Short enough → one caption line.
    if (sentence.text.trim().length <= CAPTION_MAX_CHARS) {
      pushChunk(chunks, narration, sentence.start, sentence.start + sentence.text.length);
      continue;
    }
    // Too long → split at word boundaries, preferring a comma/semicolon break.
    let cursor = sentence.start;
    const sentenceEnd = sentence.start + sentence.text.length;
    while (cursor < sentenceEnd) {
      const remaining = sentenceEnd - cursor;
      if (remaining <= CAPTION_MAX_CHARS) {
        pushChunk(chunks, narration, cursor, sentenceEnd);
        break;
      }
      const window = narration.slice(cursor, cursor + CAPTION_MAX_CHARS + 1);
      const comma = Math.max(window.lastIndexOf(","), window.lastIndexOf(";"));
      const space = window.lastIndexOf(" ");
      // Prefer a punctuation break past the halfway point, else last space.
      const cut =
        comma > CAPTION_MAX_CHARS / 2 ? comma + 1 : space > 0 ? space : CAPTION_MAX_CHARS;
      pushChunk(chunks, narration, cursor, cursor + cut);
      cursor += cut;
    }
  }

  return chunks;
}

function pushChunk(
  chunks: CaptionChunk[],
  narration: string,
  start: number,
  end: number,
): void {
  const text = narration.slice(start, end).trim();
  if (text.length > 0) chunks.push({ text, start, end });
}

/**
 * Builds the timing plan for one scene: when each element draws, how long the
 * scene spans, and its caption chunks. Shared by live playback (the
 * controller) and offline video export (lib/animation/exporter.ts) so both
 * produce identical pacing.
 */
export function planScene(
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

  // 2. Fit the schedule to the spoken narration: stretch a light scene so
  //    strokes land WHILE the words are said, and COMPRESS a drawing-heavy
  //    scene toward the narration (capped at MAX_DRAW_SPEEDUP so it never
  //    blurs) so the board doesn't keep scratching long after the voice
  //    stopped. Event-driven advance still corrects any estimate drift, and
  //    the runtime catch-up clock handles a voice that's faster than the
  //    estimate.
  const narrationMs = estimateNarrationMs(narration);
  const span = Math.max(
    Math.min(rawDuration, Math.max(narrationMs, rawDuration / SPEED.MAX_DRAW_SPEEDUP)),
    narrationMs,
    SPEED.MIN_SCENE_MS,
  );
  const scale = rawDuration > 0 ? span / rawDuration : 1;
  if (scale !== 1) {
    for (const s of scheduled) {
      s.start *= scale;
      s.end *= scale;
    }
  }

  return {
    drawDuration: span,
    narrationMs,
    elements: scheduled,
    captions: chunkNarration(narration),
  };
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
  /**
   * Scene time is a VIRTUAL clock accumulated per frame — it can run faster
   * than real time (catch-up once the voice finishes while strokes remain)
   * and simply stops accumulating while paused.
   */
  private virtualElapsed = 0;
  /** Real ms since the scene began (drives caption estimation — speech runs
   * in real time regardless of the drawing's catch-up scaling). */
  private realElapsed = 0;
  private lastFrameAt = 0;

  // Per-scene completion signals.
  private narrationStarted = false;
  private drawingDone = false;
  private speechDone = false;
  /** Generation counter so a stale utterance's onend can't settle a new scene. */
  private speechGen = 0;

  // Caption (line-by-line subtitle) tracking.
  private captionIndex = -1;
  /** True once this scene received a real speech word-boundary event. */
  private boundarySeen = false;
  /**
   * How much slower/faster the ACTUAL voice is vs. the word-count estimate
   * (actual ÷ estimated, EMA across scenes). Voices that fire no boundary
   * events rely on the estimate for caption timing — this calibrates it from
   * each finished scene so captions stop racing ahead of a slow voice.
   */
  private speechRateFactor = 1;

  private voice: SpeechSynthesisVoice | null = null;
  private readonly voiceMode: VoiceMode;

  // Enhanced-voice playback state.
  private audioEl: HTMLAudioElement | null = null;
  /** narration text → object URL of its rendered audio (session cache, so
   * replays and re-seeks never re-bill the TTS API). */
  private readonly audioCache = new Map<string, string>();

  /** When true, the current caption is also drawn ONTO the canvas (video
   * export — DOM captions aren't part of the recorded canvas). */
  private burnCaptions = false;

  constructor(
    ctx: CanvasRenderingContext2D,
    data: AnimationData,
    icons: IconCache,
    images: ImageCache,
    callbacks: ControllerCallbacks = {},
    options: ControllerOptions = {},
  ) {
    this.ctx = ctx;
    this.data = data;
    this.icons = icons;
    this.images = images;
    this.callbacks = callbacks;
    this.voiceMode = options.voiceMode ?? "browser";
    this.sceneCount = data.scenes.length;

    this.plans = data.scenes.map((scene) =>
      planScene(scene.elements, scene.narration),
    );

    // Pick the nicest voice once it's available (async); until then we fall
    // back to the browser default.
    void waitForVoices().then((voices) => {
      this.voice = pickBestVoice(voices);
    });
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
    this.cancelRaf();
    this.safeSpeech((s) => s.pause());
    this.audioEl?.pause();
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.lastFrameAt = this.now(); // don't count the paused gap
    this.safeSpeech((s) => s.resume());
    if (this.audioEl && !this.audioEl.ended) void this.audioEl.play().catch(() => {});
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
    this.stopAudio();
    this.sceneIndex = 0;
    this.setState("idle");
    clearCanvas(this.ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.callbacks.onProgress?.(0);
  }

  seekToScene(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.sceneCount - 1));
    this.cancelRaf();
    this.safeSpeech((s) => s.cancel());
    this.stopAudio();
    this.sceneIndex = clamped;
    this.beginScene(clamped);
    this.setState("playing");
    this.loop();
  }

  destroy(): void {
    this.cancelRaf();
    this.speechGen++;
    this.safeSpeech((s) => s.cancel());
    this.stopAudio();
    for (const url of this.audioCache.values()) URL.revokeObjectURL(url);
    this.audioCache.clear();
    this.state = "idle";
  }

  /**
   * Toggles burned-in captions (drawn onto the canvas itself). Enabled during
   * video export so the downloaded video keeps its subtitles.
   */
  setBurnCaptions(on: boolean): void {
    this.burnCaptions = on;
  }

  getState(): PlaybackState {
    return this.state;
  }

  getSceneCount(): number {
    return this.sceneCount;
  }

  // ---- Internal -------------------------------------------------------------

  private beginScene(index: number): void {
    this.virtualElapsed = 0;
    this.realElapsed = 0;
    this.lastFrameAt = this.now();
    this.stopAudio();
    this.narrationStarted = false;
    this.drawingDone = false;
    this.speechDone = false;
    this.speechGen++; // any older utterance callback is now stale
    this.captionIndex = -1;
    this.boundarySeen = false;
    this.callbacks.onScene?.(index, this.sceneCount);
    // Show the first caption line immediately (before any boundary event).
    this.setCaption(index, 0);
  }

  private loop = (): void => {
    if (this.state !== "playing") return;

    const plan = this.plans[this.sceneIndex];
    const scene = this.data.scenes[this.sceneIndex];
    if (!plan || !scene) {
      this.finish();
      return;
    }

    // Advance the clocks. The virtual (drawing) clock runs faster once the
    // voice has finished but strokes remain — the board catches up within a
    // beat instead of scratching on in silence.
    const now = this.now();
    const dt = Math.max(0, now - this.lastFrameAt);
    this.lastFrameAt = now;
    const catchingUp = this.speechDone && !this.drawingDone;
    this.virtualElapsed += dt * (catchingUp ? SPEED.CATCHUP_FACTOR : 1);
    this.realElapsed += dt;
    const elapsed = this.virtualElapsed;

    // Kick off narration once, at the start of the scene.
    if (!this.narrationStarted) {
      this.narrationStarted = true;
      this.speak(scene.narration);
    }

    // Caption fallback: no boundary events from this speech engine → advance
    // the line by time, proportional to the narration estimate.
    if (!this.boundarySeen && !this.speechDone && plan.captions.length > 1) {
      this.estimateCaptionFromTime(plan);
    }

    this.renderScene(this.sceneIndex, elapsed);

    if (elapsed >= plan.drawDuration) this.drawingDone = true;
    this.reportProgress(elapsed, plan);

    // Advance once both drawing and speech are done, or the safety cap trips.
    if ((this.drawingDone && this.speechDone) || this.realElapsed >= SCENE_SAFETY_MS) {
      this.advanceScene();
      return;
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  // ---- Captions (line-by-line subtitles) -------------------------------------

  /** Shows caption line `chunkIndex` of the given scene (if it changed). */
  private setCaption(sceneIndex: number, chunkIndex: number): void {
    const captions = this.plans[sceneIndex]?.captions ?? [];
    if (captions.length === 0) {
      if (this.captionIndex !== -1) return;
      this.callbacks.onCaption?.("");
      return;
    }
    const clamped = Math.max(0, Math.min(chunkIndex, captions.length - 1));
    if (clamped === this.captionIndex) return;
    this.captionIndex = clamped;
    this.callbacks.onCaption?.(captions[clamped]!.text);
  }

  /** Maps a speech charIndex (from `onboundary`) to its caption line. */
  private captionFromCharIndex(charIndex: number): void {
    const captions = this.plans[this.sceneIndex]?.captions ?? [];
    for (let i = captions.length - 1; i >= 0; i--) {
      if (charIndex >= captions[i]!.start) {
        this.setCaption(this.sceneIndex, i);
        return;
      }
    }
  }

  /**
   * Time-based caption fallback for engines without boundary events. With
   * enhanced (audio) narration the audio element's own clock gives an exact
   * fraction; otherwise fall back to the word-count estimate.
   */
  private estimateCaptionFromTime(plan: ScenePlan): void {
    let fraction: number;
    const audio = this.audioEl;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      fraction = clamp01Local(audio.currentTime / audio.duration);
    } else {
      // Word-count estimate, scaled by how fast this playback's voice has
      // actually been speaking so far (see settleSpeech calibration).
      const speakable =
        Math.max(1, plan.narrationMs - SPEED.NARRATION_LEAD_MS) *
        this.speechRateFactor;
      fraction = clamp01Local(
        (this.realElapsed - SPEED.NARRATION_LEAD_MS) / speakable,
      );
    }
    const captions = plan.captions;
    const last = captions[captions.length - 1]!;
    const charIndex = fraction * last.end;
    this.captionFromCharIndex(charIndex);
  }

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

    // Watermark sits on top of everything, once per frame.
    drawWatermark(this.ctx, CANVAS_WIDTH, CANVAS_HEIGHT);

    // During export, captions are burned into the canvas so the recorded
    // video keeps its subtitles.
    if (this.burnCaptions) {
      const caption = plan.captions[this.captionIndex]?.text ?? "";
      drawBurnedCaption(this.ctx, caption, CANVAS_WIDTH, CANVAS_HEIGHT);
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
    if (this.voiceMode === "enhanced") {
      void this.speakEnhanced(text, token);
    } else {
      this.speakBrowser(text, token);
    }
  }

  private speakBrowser(text: string, token: number): void {
    const ran = this.safeSpeech((synth) => {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = SPEED.TTS_RATE;
      if (this.voice) utterance.voice = this.voice;
      utterance.onend = () => this.settleSpeech(token);
      utterance.onerror = () => this.settleSpeech(token);
      // Word-boundary events sync the caption line to the actual voice.
      // (Not fired by every engine — the loop has a time-based fallback.)
      utterance.onboundary = (e) => {
        if (token !== this.speechGen) return; // stale scene
        if (typeof e.charIndex !== "number") return;
        this.boundarySeen = true;
        this.captionFromCharIndex(e.charIndex);
      };
      synth.speak(utterance);
    });

    // No speech synthesis available → treat narration as instantly "done" so
    // pacing falls back to drawing duration only.
    if (!ran) this.speechDone = true;
  }

  /**
   * Enhanced narration: fetches pre-rendered AI audio from /api/tts and plays
   * it. Audio is cached per narration for the session (replays are free).
   * ANY failure — network, 4xx/5xx, blocked autoplay — falls back to browser
   * TTS so enhanced mode can never stall playback.
   */
  private async speakEnhanced(text: string, token: number): Promise<void> {
    // Make sure no browser utterance is talking over the audio.
    this.safeSpeech((s) => s.cancel());

    let url = this.audioCache.get(text);
    if (!url) {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        this.audioCache.set(text, url);
      } catch {
        if (token === this.speechGen) this.speakBrowser(text, token);
        return;
      }
    }

    if (token !== this.speechGen) return; // scene changed while fetching

    const audio = new Audio(url);
    this.audioEl = audio;
    audio.onended = () => this.settleSpeech(token);
    audio.onerror = () => this.settleSpeech(token);

    // Don't autoplay into a pause the user hit while we were fetching;
    // resume() starts it back up.
    if (this.state !== "playing") return;
    try {
      await audio.play();
    } catch {
      // Autoplay blocked → browser TTS (which may itself no-op; the scene
      // safety ceiling still guarantees progress).
      this.audioEl = null;
      if (token === this.speechGen) this.speakBrowser(text, token);
    }
  }

  /** Halts and detaches the current enhanced-voice audio element (if any). */
  private stopAudio(): void {
    const audio = this.audioEl;
    if (!audio) return;
    this.audioEl = null;
    audio.onended = null;
    audio.onerror = null;
    try {
      audio.pause();
    } catch {
      // ignore
    }
  }

  /** Marks speech finished, but only for the scene that started it. */
  private settleSpeech(token: number): void {
    if (token !== this.speechGen) return; // stale (scene changed)
    this.speechDone = true;

    // Calibrate the caption-timing estimate from how long the voice ACTUALLY
    // took (real time from scene start to speech end vs. the estimate).
    const plan = this.plans[this.sceneIndex];
    if (plan && plan.narrationMs > SPEED.NARRATION_LEAD_MS) {
      const sample = this.realElapsed / plan.narrationMs;
      if (Number.isFinite(sample) && sample > 0.4 && sample < 3) {
        // EMA: adapt quickly (voice engines are consistent within a playback).
        this.speechRateFactor = this.speechRateFactor * 0.4 + sample * 0.6;
      }
    }
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
