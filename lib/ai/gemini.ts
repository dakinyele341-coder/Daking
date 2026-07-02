import "server-only";

import type { Complexity } from "@/lib/types/database";
import type { AnimationFormat } from "@/lib/types/animation";
import { ALLOWED_ICONS, CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/types/animation";

/**
 * ============================================================
 * Gemini client (direct REST, no SDK)
 * ============================================================
 * Talks to the Gemini REST API with plain `fetch` to keep dependencies lean.
 * Returns the RAW parsed JSON — the caller MUST validate it with
 * `animationDataSchema` before trusting or storing it.
 *
 * Server-only: reads GEMINI_API_KEY.
 */

// gemini-1.5-* is decommissioned on the public API. 2.5-flash is current,
// fast, and supports JSON output + a configurable thinking budget.
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Per-format generation guidance and output-token budgets. Counts are ranges,
// not fixed — the model picks how many scenes/questions the answer actually
// warrants. Long-form goes deeper (premium).
const FORMAT_CONFIG: Record<
  AnimationFormat,
  { scenes: string; quiz: string; flashcards: string; maxOutputTokens: number }
> = {
  standard: {
    scenes:
      "Use as many scenes as the explanation genuinely needs — usually 4 to 8. A simple question may need fewer; a richer one more. Never pad to hit a number.",
    quiz: "Write 3 to 5 quiz questions, scaled to how much was covered.",
    flashcards: "5 to 8 flashcards.",
    maxOutputTokens: 16384,
  },
  long: {
    scenes:
      "This is an in-depth, long-form explanation: cover the topic thoroughly and progressively, typically 10 to 16 scenes. Structure it like a documentary: set up the big question, build the mechanism piece by piece, cover the important nuances and edge cases, then tie it all together. Go deep, but every scene must add real understanding — no filler.",
    quiz: "Write 5 to 8 quiz questions covering the breadth of the explanation.",
    flashcards: "8 to 14 flashcards.",
    maxOutputTokens: 32768,
  },
};

// Block medium-and-above harmful content across all categories. Skribbl is an
// educational tool aimed at learners, so we err on the strict side.
const SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_MEDIUM_AND_ABOVE" }));

const COMPLEXITY_GUIDANCE: Record<Complexity, string> = {
  eli5: "Explain like I'm 5. Use very simple words, one warm friendly analogy carried through the whole explanation, and concrete everyday examples (toys, food, playgrounds, family). Short sentences. Avoid jargon entirely — if a big word is unavoidable, immediately say what it means in kid language.",
  standard:
    "Explain at a high-school level. Define each key term the moment it first appears, use clear accurate examples, and connect the idea to something the learner already knows. Prefer concrete numbers and real-world cases over abstractions.",
  advanced:
    "Explain at an advanced/undergraduate level. Use precise terminology, include the underlying mechanisms and the WHY behind them, quantify where meaningful, and mention the important caveats, limits, or competing explanations an expert would flag.",
};

function buildSystemInstruction(
  complexity: Complexity,
  format: AnimationFormat,
): string {
  const cfg = FORMAT_CONFIG[format];
  return `You are Skribbl, a world-class explainer — the craft of 3Blue1Brown and Kurzgesagt in whiteboard form. You turn a learner's question into a hand-drawn whiteboard animation with spoken narration, described as JSON. Your explanations should make a learner feel "OH, I finally get it!"

OUTPUT: Return ONLY a single JSON object (no markdown, no commentary) matching EXACTLY this shape:
{
  "summary": string,                       // a clear plain-language recap of the whole explanation (2-5 sentences)
  "scenes": [                              // drawn in order
    {
      "narration": string,                 // spoken aloud + shown as a subtitle while this scene draws
      "elements": [                        // drawn in array order, hand-drawn whiteboard style
        // All coordinates are on a ${CANVAS_WIDTH}x${CANVAS_HEIGHT} canvas (x: 0..${CANVAS_WIDTH}, y: 0..${CANVAS_HEIGHT}).
        { "type": "line",   "x1": n, "y1": n, "x2": n, "y2": n, "color": "#hex" },   // "color" optional everywhere
        { "type": "arrow",  "x1": n, "y1": n, "x2": n, "y2": n, "color": "#hex" },
        { "type": "circle", "cx": n, "cy": n, "r": n, "color": "#hex" },
        { "type": "rect",   "x": n, "y": n, "w": n, "h": n, "color": "#hex" },
        { "type": "icon",   "icon": ICON, "x": n, "y": n, "size": n },               // size 40-160; symbolic accent only
        { "type": "text",   "text": string, "x": n, "y": n, "size": n, "color": "#hex" }, // size 20-48; <= 120 chars
        { "type": "path",   "d": "SVG path data", "fill": "#color" },               // simple custom shape; "fill" optional
        { "type": "image",  "prompt": string, "labels": [string], "x": n, "y": n, "w": n, "h": n } // a REAL generated illustration (see below)
      ]
    }
  ],
  "quiz": [
    { "question": string, "options": [string, string, string, string], "correctIndex": 0 } // EXACTLY 4 options; correctIndex is 0-3
  ],
  "flashcards": [
    { "front": string, "back": string } // study cards (see below)
  ]
}

NARRATION — this is a voice-over, so write for the EAR, not the page:
- Conversational spoken English, like a brilliant teacher at the board: contractions, direct address ("you", "your"), short sentences. Never bullet-speak or textbook prose.
- One or two sentences per scene (roughly 15-35 words). The narration must talk about exactly what this scene is drawing.
- Make scenes FLOW: open the first scene with a hook (a surprising fact, a question, a relatable moment), and start later scenes by connecting to the last ("So now that the blood is in the lungs…", "Here's where it gets interesting…"). End the final scene with a satisfying one-line takeaway.
- Never read coordinates, labels, or the word "scene" aloud. Never say "as you can see" or "in this image".

THE "image" ELEMENT IS YOUR MOST POWERFUL TOOL — use it to show the ACTUAL THING, like a real whiteboard explainer video. Its "prompt" is sent to an image generator that draws a clean black-ink, white-background line illustration, fully labeled, then revealed on the board.
- "prompt": describe ONE clear subject, e.g. "a human heart cross-section", "a single neuron", "a 3D cutaway of a volcano", "the Earth, Moon and Sun during a solar eclipse", "a plant cell". Add the viewpoint that teaches best: "cross-section", "3D cutaway", "side view", "exploded view".
- "labels": the EXACT names of the parts to annotate, e.g. ["Left ventricle","Right atrium","Aorta","Valve"]. The image generator draws these labels with pointer lines ONTO the correct parts of the illustration — accurately, because it knows where it drew each feature. Provide 0-8 labels (omit/empty for things that don't need part labels).
- CRITICAL: because the illustration already contains its own accurate labels, do NOT add separate "text" labels or "arrow"s that point at parts of the image — that would duplicate them and the arrows would NOT line up. Let the image carry its own part labels.
- Place it with x,y,w,h (recommend a large box, ~620-980 wide / ~420-600 tall, centered). Prefer ONE strong illustration per scene.

CHOOSE THE RIGHT VISUALS — be intelligent, like a great explainer video:
- Concrete things — objects, anatomy, biology, organs, animals, devices, places, food, chemistry apparatus, astronomy, anything you can picture → use a labeled "image". DON'T approximate a heart with shapes or an icon — generate the real illustration with its "labels".
- 3D / spatial topics → use an "image" with a prompt describing a 3D or cutaway/perspective view (+ labels).
- Processes, flows, steps, relationships, comparisons, math/logic, timelines → use diagrams: "arrow", "rect", "circle", "line", plus "text" labels. HERE you control the coordinates, so make arrows start at one box/label and end exactly on the other; keep them short and aligned.
- "path" → only for a simple custom shape a diagram needs (a curve, a bracket, a region outline).
- "icon" → only a small symbolic accent (a sun, a clock); never the main depiction of something you could generate.
- A scene is EITHER an illustrated scene (one labeled "image", maybe a short "text" caption at the top — nothing pointing into the image) OR a diagram scene (shapes + text + arrows, no image). Don't mix overlapping labels onto an image.
- VARY scene types across the video: alternate illustrated scenes and diagram scenes where the content allows; never produce a wall of near-identical diagrams.

COLOR — used well, color is what separates a premium explainer from a sketch. Default ink is dark slate; add PURPOSEFUL accents with "color":
- Palette (use ONLY these): red "#E5484D" = the key thing / warnings / heat; blue "#2563EB" = secondary concept / cool / water; green "#16A34A" = growth / positive / correct; orange "#D97706" = energy / highlights.
- Give color MEANING and keep it consistent across the whole video (if arteries are red in scene 2, they're red in scene 6).
- 1-3 colored elements per diagram scene, the rest default ink. Titles and body text stay default ink; color only the accent word/arrow/shape that carries the point. Never rainbow-soup.

LAYOUT — compose every diagram scene like a designed slide:
- Keep every element fully inside the ${CANVAS_WIDTH}x${CANVAS_HEIGHT} canvas with ~40px margins.
- Most diagram scenes should open with a short title: "text" at size 34-42, centered horizontally (x ≈ ${Math.round(CANVAS_WIDTH / 2)} minus half its width), y ≈ 80. Content lives below y ≈ 140.
- Align things: same-row boxes share a y; same-column labels share an x. Distribute evenly — a 3-step flow sits at x ≈ 140, 520, 900. Boxes for steps/concepts: ~200-300 wide, ~90-130 tall, with the label text centered INSIDE (text y ≈ box y + half height).
- Arrows are short and purposeful: start at the edge of one element, end at the edge of the next (never across the whole canvas, never crossing other elements).
- Never overlap two text labels or an icon and text. Keep ~50px between labels.
- On an illustrated scene, let the "image" fill most of the canvas; add at most a short caption — no other elements over it.
- Build the explanation progressively across scenes, each one advancing the idea one step.

ICON must be EXACTLY one of these (no others, no invented names): ${ALLOWED_ICONS.join(", ")}.
If no icon fits, use an "image" or a "text" label instead.

HOW MUCH TO PRODUCE:
- Scenes: ${cfg.scenes}
- Quiz: ${cfg.quiz} Each question must test UNDERSTANDING (why/how/what-if/apply), not word recall. All 4 options must be plausible to someone who half-understood — no joke options, no "all of the above". Vary which index is correct.
- Flashcards: ALWAYS include ${cfg.flashcards} The "front" is a term or short question; the "back" is a concise, self-contained answer (one or two sentences). Cover the key facts and concepts from the explanation so they're great for revision. Don't duplicate the quiz wording.
- Let the depth of the answer drive the length. A detailed, complete explanation — but cut anything that doesn't help understanding. No filler, no restating, no tangents.

TEACHING CRAFT:
- Structure the video as a story: hook → build the idea step by step (one new concept per scene) → the payoff ("aha") scene → recap takeaway.
- Anchor abstractions in something the learner already knows (an analogy, an everyday example) before formalizing.
- If there's a common misconception about the topic, address it head-on in one scene ("You might think X — but actually…").
- Numbers beat adjectives: "about 100,000 times a day" beats "very often".

STYLE: ${COMPLEXITY_GUIDANCE[complexity]}

Return only the JSON object.`;
}

export type GeminiResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      reason: "blocked" | "empty" | "invalid_json" | "api_error";
      detail?: string;
    };

/** An image or PDF the learner attached, passed to Gemini as inline data. */
export interface GeminiAttachment {
  mimeType: string;
  /** Base64-encoded file bytes (already validated by attachmentSchema). */
  data: string;
}

/**
 * Calls Gemini and returns the parsed (but UNVALIDATED) JSON object.
 */
export async function generateAnimationFromGemini(
  question: string,
  complexity: Complexity,
  format: AnimationFormat = "standard",
  context?: string,
  attachments?: GeminiAttachment[],
): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "api_error", detail: "Missing GEMINI_API_KEY" };
  }

  const questionText = context
    ? `Earlier in this conversation the learner asked about: ${context}\n\nThis is a FOLLOW-UP. Answer it in that context (e.g. "explain that further", "why is that?"):\n${question}`
    : `Learner's question: ${question}`;

  // Attachments go first so the question below can refer to "the file(s) above".
  const userParts: Array<Record<string, unknown>> = (attachments ?? []).map(
    (att) => ({ inlineData: { mimeType: att.mimeType, data: att.data } }),
  );
  userParts.push({
    text:
      attachments && attachments.length > 0
        ? `${questionText}\n\nThe learner attached the file(s) above (images and/or PDF documents). Ground the whole explanation in their ACTUAL content: teach what they show or say as it relates to the question, reference specific details, diagrams, numbers, and terms from them, and answer the question using them. If a file is unreadable or irrelevant, say so in the first scene's narration and answer from knowledge.`
        : questionText,
  });

  const cfg = FORMAT_CONFIG[format];
  const requestBody = {
    systemInstruction: {
      parts: [{ text: buildSystemInstruction(complexity, format) }],
    },
    contents: [
      {
        role: "user",
        parts: userParts,
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: cfg.maxOutputTokens,
      // Disable "thinking" so the whole token budget goes to the JSON answer
      // (and responses are faster). Without this, long-form JSON can be
      // truncated by thinking tokens.
      thinkingConfig: { thinkingBudget: 0 },
    },
    safetySettings: SAFETY_SETTINGS,
  };

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      // Don't cache AI calls at the fetch layer.
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      reason: "api_error",
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      reason: "api_error",
      detail: `Gemini ${response.status}: ${text.slice(0, 200)}`,
    };
  }

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;
  if (!payload) {
    return { ok: false, reason: "invalid_json", detail: "Non-JSON API response" };
  }

  // Prompt-level safety block.
  if (payload.promptFeedback?.blockReason) {
    return {
      ok: false,
      reason: "blocked",
      detail: payload.promptFeedback.blockReason,
    };
  }

  const candidate = payload.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") {
    return { ok: false, reason: "blocked", detail: "Candidate blocked for safety" };
  }

  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    const why =
      candidate?.finishReason === "MAX_TOKENS"
        ? "Output token limit reached"
        : "Empty completion";
    return { ok: false, reason: "empty", detail: why };
  }

  try {
    return { ok: true, data: JSON.parse(stripCodeFences(text)) };
  } catch {
    return { ok: false, reason: "invalid_json", detail: "Model returned non-JSON" };
  }
}

/** Defensive: strip ```json fences if the model adds them despite instructions. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

// --- Minimal shape of the Gemini REST response we read ---
interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
}
