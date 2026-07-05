/**
 * ============================================================
 * Offline video export (WebCodecs → MP4)
 * ============================================================
 * Renders an animation to an MP4 file WITHOUT re-playing it in real time:
 * frames are drawn to an offscreen canvas and encoded as fast as the CPU
 * allows (a 60s video typically exports in a few seconds). Captions are
 * burned into the frames, the watermark is included, and — when the enhanced
 * voice is configured — the AI narration is mixed in as a real AAC audio
 * track. MP4/H.264 plays everywhere, including iPhone and WhatsApp.
 *
 * Falls back: callers should check `isOfflineExportSupported()` and use the
 * legacy MediaRecorder path when WebCodecs isn't available.
 *
 * Browser-only. Import from client components.
 */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { AnimationData } from "@/lib/types/animation";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/types/animation";
import {
  clearCanvas,
  drawElement,
  drawWatermark,
  drawBurnedCaption,
  type IconCache,
  type ImageCache,
} from "@/lib/animation/renderer";
import {
  planScene,
  easeInOutQuad,
  type ScenePlan,
} from "@/lib/animation/controller";

const FPS = 30;
const VIDEO_BITRATE = 4_000_000;
const AUDIO_SAMPLE_RATE = 44_100;
const AUDIO_BITRATE = 96_000;
/** Breathing room after each scene's narration ends. */
const SCENE_TAIL_MS = 350;
/** Hold the finished board on screen at the very end. */
const FINAL_HOLD_MS = 900;
/** H.264 codec candidates, most capable first (all handle 720p30). */
const AVC_CODECS = ["avc1.420028", "avc1.42001f", "avc1.4d0028"];

export interface ExportProgress {
  /** 0..1 across the whole export. */
  fraction: number;
  phase: "voice" | "render";
}

/** Whether this browser can do the fast offline MP4 export. */
export function isOfflineExportSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined"
  );
}

interface SceneTiming {
  plan: ScenePlan;
  startMs: number;
  durationMs: number;
  /** Decoded narration audio for this scene (null → silent/captions only). */
  audio: AudioBuffer | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetches and decodes the AI narration for each scene via /api/tts.
 * Any failure (no key → 503, rate limit, network) yields null for that scene
 * — the export simply proceeds without that audio.
 */
async function fetchSceneAudio(
  narrations: string[],
  audioCtx: AudioContext,
  onProgress: (fraction: number) => void,
): Promise<(AudioBuffer | null)[]> {
  const results: (AudioBuffer | null)[] = new Array(narrations.length).fill(null);
  let done = 0;
  // Sequential keeps us politely under the TTS rate limit's burst behavior.
  for (let i = 0; i < narrations.length; i++) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: narrations[i] }),
      });
      // 503 = not configured: skip the remaining calls entirely.
      if (res.status === 503) break;
      if (res.ok) {
        const bytes = await res.arrayBuffer();
        results[i] = await audioCtx.decodeAudioData(bytes);
      }
    } catch {
      // This scene stays silent; captions carry it.
    }
    done = i + 1;
    onProgress(done / narrations.length);
  }
  return results;
}

/** Picks the first H.264 encoder config this browser supports (or null). */
async function pickVideoConfig(): Promise<VideoEncoderConfig | null> {
  for (const codec of AVC_CODECS) {
    const config: VideoEncoderConfig = {
      codec,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      bitrate: VIDEO_BITRATE,
      framerate: FPS,
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return config;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Whether AAC audio encoding is available. */
async function audioEncodingSupported(): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: AUDIO_BITRATE,
    });
    return Boolean(support.supported);
  } catch {
    return false;
  }
}

/** Mixes an AudioBuffer down to mono Float32 samples. */
function toMono(buffer: AudioBuffer): Float32Array {
  const ch0 = buffer.getChannelData(0);
  if (buffer.numberOfChannels === 1) return ch0;
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) out[i]! += ch[i]! / buffer.numberOfChannels;
  }
  return out;
}

/**
 * Renders the animation to an MP4 blob. Throws on unsupported browsers or
 * encoder failure — the caller falls back to the MediaRecorder path.
 */
export async function exportAnimationToMp4(
  animation: AnimationData,
  icons: IconCache,
  images: ImageCache,
  onProgress: (p: ExportProgress) => void,
): Promise<Blob> {
  if (!isOfflineExportSupported()) {
    throw new Error("WebCodecs not supported");
  }
  const videoConfig = await pickVideoConfig();
  if (!videoConfig) throw new Error("No supported H.264 encoder");

  // ---- 1. Narration audio (best-effort; silent + captions if unavailable).
  const canEncodeAudio = await audioEncodingSupported();
  let sceneAudio: (AudioBuffer | null)[] = animation.scenes.map(() => null);
  if (canEncodeAudio) {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      const audioCtx = new AudioCtx({ sampleRate: AUDIO_SAMPLE_RATE });
      try {
        sceneAudio = await fetchSceneAudio(
          animation.scenes.map((s) => s.narration),
          audioCtx,
          (f) => onProgress({ fraction: f * 0.35, phase: "voice" }),
        );
      } finally {
        void audioCtx.close().catch(() => {});
      }
    }
  }
  const hasAudio = sceneAudio.some((a) => a !== null);

  // ---- 2. Scene timings: drawing span vs. actual narration duration.
  const timings: SceneTiming[] = [];
  let clock = 0;
  animation.scenes.forEach((scene, i) => {
    const plan = planScene(scene.elements, scene.narration);
    const audio = sceneAudio[i] ?? null;
    const audioMs = audio ? audio.duration * 1000 : 0;
    const durationMs = Math.max(plan.drawDuration, audioMs + SCENE_TAIL_MS);
    timings.push({ plan, startMs: clock, durationMs, audio });
    clock += durationMs;
  });
  const totalMs = clock + FINAL_HOLD_MS;

  // ---- 3. Muxer + encoders.
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      frameRate: FPS,
    },
    ...(hasAudio
      ? {
          audio: {
            codec: "aac" as const,
            sampleRate: AUDIO_SAMPLE_RATE,
            numberOfChannels: 1,
          },
        }
      : {}),
    fastStart: "in-memory",
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  videoEncoder.configure(videoConfig);

  // ---- 4. Audio track: one continuous mono stream, scenes at their offsets.
  if (hasAudio) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: AUDIO_BITRATE,
    });

    const totalSamples = Math.ceil((totalMs / 1000) * AUDIO_SAMPLE_RATE);
    const pcm = new Float32Array(totalSamples);
    for (const t of timings) {
      if (!t.audio) continue;
      const mono = toMono(t.audio);
      const offset = Math.floor((t.startMs / 1000) * AUDIO_SAMPLE_RATE);
      const n = Math.min(mono.length, totalSamples - offset);
      pcm.set(mono.subarray(0, n), offset);
    }

    const CHUNK = 1024;
    for (let s = 0; s < totalSamples; s += CHUNK) {
      const frames = Math.min(CHUNK, totalSamples - s);
      const data = new AudioData({
        format: "f32",
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfFrames: frames,
        numberOfChannels: 1,
        timestamp: Math.round((s / AUDIO_SAMPLE_RATE) * 1_000_000),
        data: pcm.subarray(s, s + frames),
      });
      audioEncoder.encode(data);
      data.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  // ---- 5. Render + encode every frame (no real-time waiting).
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const totalFrames = Math.ceil((totalMs / 1000) * FPS);
  const frameUs = 1_000_000 / FPS;
  let sceneIdx = 0;

  for (let f = 0; f < totalFrames; f++) {
    if (encoderError) throw encoderError;
    const tMs = (f * 1000) / FPS;
    while (
      sceneIdx < timings.length - 1 &&
      tMs >= timings[sceneIdx]!.startMs + timings[sceneIdx]!.durationMs
    ) {
      sceneIdx++;
    }
    const timing = timings[sceneIdx]!;
    const scene = animation.scenes[sceneIdx]!;
    const localT = Math.min(tMs - timing.startMs, timing.durationMs);

    // Same drawing schedule as live playback.
    clearCanvas(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (const sched of timing.plan.elements) {
      const element = scene.elements[sched.index];
      if (!element) continue;
      let progress: number;
      if (localT >= sched.end) progress = 1;
      else if (localT <= sched.start) continue;
      else {
        const span = sched.end - sched.start;
        progress = easeInOutQuad(span === 0 ? 1 : (localT - sched.start) / span);
      }
      drawElement(ctx, element, progress, icons, images);
    }
    drawWatermark(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Caption: timed against the real audio when present, else the visual span.
    const captions = timing.plan.captions;
    if (captions.length > 0) {
      const speechMs = timing.audio
        ? timing.audio.duration * 1000
        : timing.durationMs;
      const fraction = Math.min(1, speechMs === 0 ? 1 : localT / speechMs);
      const charIndex = fraction * captions[captions.length - 1]!.end;
      let text = captions[0]!.text;
      for (let i = captions.length - 1; i >= 0; i--) {
        if (charIndex >= captions[i]!.start) {
          text = captions[i]!.text;
          break;
        }
      }
      drawBurnedCaption(ctx, text, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(f * frameUs),
      duration: Math.round(frameUs),
    });
    videoEncoder.encode(frame, { keyFrame: f % (FPS * 3) === 0 });
    frame.close();

    // Backpressure + keep the UI responsive.
    while (videoEncoder.encodeQueueSize > 8) await sleep(4);
    if (f % 15 === 0) {
      onProgress({
        fraction: (hasAudio ? 0.35 : 0) + (f / totalFrames) * (hasAudio ? 0.65 : 1),
        phase: "render",
      });
      await sleep(0);
    }
  }

  await videoEncoder.flush();
  videoEncoder.close();
  if (encoderError) throw encoderError;

  muxer.finalize();
  onProgress({ fraction: 1, phase: "render" });
  return new Blob([target.buffer], { type: "video/mp4" });
}
