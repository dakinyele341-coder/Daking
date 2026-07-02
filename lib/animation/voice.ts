/**
 * ============================================================
 * Speech synthesis voice helpers (browser-only)
 * ============================================================
 * Voices load asynchronously in most browsers — `getVoices()` is often empty
 * on first call and only populates after the `voiceschanged` event. These
 * helpers wait for that and pick the nicest available English voice.
 */

/**
 * Resolves with the available voices once they're populated, or an empty array
 * if speech synthesis is unavailable / voices never arrive within `timeoutMs`.
 */
export function waitForVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;

    const existing = synth.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };

    synth.addEventListener("voiceschanged", finish);
    // Fallback: some browsers never fire the event; don't hang forever.
    window.setTimeout(finish, timeoutMs);
  });
}

// Higher-quality voices, most-preferred first. These are typically cloud /
// "natural" voices that sound far better than the default robotic ones.
const PREFERRED_PATTERNS: RegExp[] = [
  /Google US English/i,
  /Microsoft.*(Natural|Online)/i,
  /Natural/i,
  /Google.*English/i,
  /Samantha/i,
  /Daniel/i,
];

/**
 * Picks the best available English voice: a known high-quality voice if
 * present, otherwise a non-local (usually cloud) voice, otherwise the default.
 */
export function pickBestVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;

  for (const pattern of PREFERRED_PATTERNS) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  const cloud = pool.find((v) => !v.localService);
  if (cloud) return cloud;

  const fallbackDefault = pool.find((v) => v.default);
  return fallbackDefault ?? pool[0] ?? null;
}
