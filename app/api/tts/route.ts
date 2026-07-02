import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ttsLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { validateOrError } from "@/lib/security/validation";

export const runtime = "nodejs";

/**
 * POST /api/tts — renders one narration line to speech via ElevenLabs and
 * streams the MP3 back. The API key stays server-side; the client only ever
 * talks to this route.
 *
 * Guardrails (this API is billed per character):
 * - 503 when ELEVENLABS_API_KEY isn't configured (client falls back to
 *   browser TTS — the feature is invisible unless enabled).
 * - Requires a session (every visitor has one) and rate limits per user.
 * - Text is length-bounded to a single scene's narration.
 */

// "Sarah" — clear, neutral, educational tone; included in the free tier.
const ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const ELEVENLABS_ENDPOINT = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

const ttsSchema = z.object({
  // Matches the narration bound in the animation schema (max 400 chars).
  text: z.string().trim().min(1).max(400),
});

export async function POST(request: NextRequest) {
  try {
    return await handleTts(request);
  } catch (err) {
    console.error("[Skribbl] tts handler error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

async function handleTts(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TTS not configured." }, { status: 503 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const validation = validateOrError(ttsSchema, body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed.", fields: validation.errors },
      { status: 400 },
    );
  }

  const { success, reset } = await checkRateLimit(ttsLimiter, user.id, {
    route: "tts",
  });
  if (!success) {
    const retryAfter = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const upstream = await fetch(ELEVENLABS_ENDPOINT, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: validation.data.text,
      model_id: "eleven_turbo_v2", // fastest + cheapest ElevenLabs model
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    console.error("[Skribbl] ElevenLabs error:", upstream.status);
    return NextResponse.json({ error: "TTS service error." }, { status: 502 });
  }

  // Stream the audio straight through to the client.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
