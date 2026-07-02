import "server-only";

/**
 * ============================================================
 * Whiteboard illustration generation (Gemini image model)
 * ============================================================
 * Generates a single black-ink, line-art illustration in the style of a
 * hand-drawn whiteboard explainer video. Returns raw PNG bytes; the caller
 * uploads them to storage and references the public URL from the animation.
 *
 * Server-only: reads GEMINI_API_KEY.
 */

const IMAGE_MODEL = "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;

function buildImagePrompt(subject: string, labels?: string[]): string {
  const base = `Black ink line drawing in the style of a premium hand-drawn whiteboard explainer animation (like RSA Animate or a top science textbook figure). Clean, confident black marker strokes with slightly varied line weight — bolder outlines, finer interior detail — on a plain SOLID WHITE background. Anatomically/technically ACCURATE and instantly recognizable, drawn by someone who understands the subject. No color, no gray shading, no gradients, no cross-hatching fills, no photo realism. A single clear, well-composed educational illustration of: ${subject}. Centered, filling most of the frame, with generous white space around it.`;

  const clean = (labels ?? [])
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 10);

  if (clean.length === 0) {
    return `${base} IMPORTANT: do NOT include any words, letters, numbers, or captions anywhere in the image.`;
  }

  // Let the IMAGE model place the labels — it knows where each feature is, so
  // the pointer lines land accurately (which a coordinate-blind text model
  // never could). Give the exact spellings to avoid garbled text.
  return `${base} Add neat, clearly PRINTED text labels with thin straight pointer lines (leader lines) connecting each label to the exact correct part of the drawing. Label ONLY these parts, spelled EXACTLY as written, each label used once: ${clean
    .map((l) => `"${l}"`)
    .join(", ")}. Keep labels in the white space around the drawing, evenly spaced, never overlapping each other or the drawing. Use a clean simple sans-serif. Do not add any other text, title, watermark, or numbers.`;
}

interface ImageResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string } }> };
  }>;
}

/**
 * Generates one whiteboard-style illustration for `subject`. Returns PNG bytes,
 * or null on any failure (the caller falls back to drawing/diagrams).
 */
export async function generateWhiteboardImage(
  subject: string,
  labels?: string[],
): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildImagePrompt(subject, labels) }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const payload = (await res.json()) as ImageResponse;
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const b64 = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!b64) return null;

    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

/** Runs `fn` over `items` with a max concurrency, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
