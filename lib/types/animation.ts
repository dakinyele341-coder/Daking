/**
 * ============================================================
 * Animation data model
 * ============================================================
 * These types describe the JSON an animation is made of. They are the single
 * source of truth shared by:
 *   - the Gemini output validator (`animationDataSchema` in validation.ts),
 *   - the canvas renderer (`lib/animation/renderer.ts`),
 *   - the playback controller and React components.
 *
 * The renderer draws onto a fixed 1280x720 canvas, so every coordinate below
 * is in that space (CSS scales the canvas down responsively).
 */

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

/**
 * The closed set of icons the AI may reference. Each name maps 1:1 to a file
 * in `/public/icons/<name>.svg`, copied from `lucide-static` by
 * `scripts/copy-icons.ts`. Keeping this list closed means the model can never
 * request an icon we don't actually serve.
 */
export const ALLOWED_ICONS = [
  // Science & learning
  "brain", "atom", "beaker", "flask-conical", "lightbulb", "book", "book-open",
  "graduation-cap", "pencil", "pen-tool", "ruler", "calculator", "microscope",
  "dna", "magnet", "telescope", "test-tube", "test-tubes", "sigma", "infinity",
  "binary",
  // Time
  "calendar", "clock", "hourglass", "timer", "scale",
  // Nature & weather
  "flame", "droplet", "droplets", "leaf", "sprout", "tree-pine",
  "tree-deciduous", "flower", "sun", "moon", "star", "cloud", "cloud-rain",
  "cloud-lightning", "snowflake", "wind", "waves", "mountain", "globe", "earth",
  "sunrise", "rainbow", "thermometer",
  // Technology
  "zap", "battery", "plug", "cpu", "server", "database", "wifi", "monitor",
  "smartphone", "laptop", "code", "terminal", "bug", "network", "link",
  "satellite", "radio",
  // People & body
  "heart", "eye", "ear", "hand", "footprints", "user", "users",
  "person-standing", "smile",
  // Travel & objects
  "rocket", "plane", "car", "ship", "anchor", "bike", "compass", "map",
  "map-pin", "flag", "target", "trophy", "award", "medal", "gift", "key",
  "lock", "unlock", "shield", "bell", "search", "filter", "settings", "wrench",
  "hammer", "scissors", "clipboard", "folder", "file", "file-text", "image",
  "camera", "video", "music", "mic", "headphones",
  // Arrows & shapes
  "arrow-right", "arrow-left", "arrow-up", "arrow-down", "arrow-up-right",
  "move", "refresh-cw", "rotate-cw", "repeat", "shuffle", "plus", "minus",
  "check", "equal", "percent", "divide", "circle", "square", "triangle",
  "hexagon", "diamond",
  // Business & money
  "dollar-sign", "coins", "banknote", "credit-card", "wallet", "piggy-bank",
  "trending-up", "trending-down", "bar-chart", "line-chart", "pie-chart",
  "activity", "briefcase", "building", "building-2", "factory", "store",
  "shopping-cart", "package", "truck", "box",
  // Food & health
  "apple", "carrot", "egg", "coffee", "pizza", "utensils", "pill",
  "stethoscope", "syringe", "bandage", "cross", "dumbbell", "heart-pulse",
  // Communication
  "message-circle", "message-square", "mail", "send", "phone", "megaphone",
  "quote",
] as const;

export type IconName = (typeof ALLOWED_ICONS)[number];

/** Stroke styling shared by the geometric primitives. */
interface StrokeStyle {
  /** Any CSS color string. Defaults to the renderer's ink color. */
  color?: string;
  /** Stroke width in canvas px. */
  strokeWidth?: number;
}

export interface LineElement extends StrokeStyle {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ArrowElement extends StrokeStyle {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CircleElement extends StrokeStyle {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}

export interface RectElement extends StrokeStyle {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IconElement {
  type: "icon";
  icon: IconName;
  x: number;
  y: number;
  /** Rendered width & height (icons are square). */
  size: number;
}

export interface TextElement {
  type: "text";
  text: string;
  x: number;
  y: number;
  /** Font size in canvas px. */
  size?: number;
  color?: string;
}

/**
 * A freeform hand-drawn stroke described as SVG path data (`d`), on the same
 * 1280x720 canvas. This is how detailed custom illustrations and 3D-style
 * figures are drawn — anything the geometric primitives and icons can't express.
 */
export interface PathElement extends StrokeStyle {
  type: "path";
  /** SVG path data, absolute coordinates in canvas space. */
  d: string;
  /** Optional subtle fill color (for shading / depth). Stroke-only if omitted. */
  fill?: string;
}

/**
 * A generated whiteboard-style illustration (line art on white), revealed on
 * the board like it's being drawn. `url` points at a stored PNG. This is how
 * real, detailed subjects are shown (vs. approximating them with shapes).
 */
export interface ImageElement {
  type: "image";
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Short description of the illustration (accessibility). */
  alt?: string;
}

export type AnimationElement =
  | LineElement
  | ArrowElement
  | CircleElement
  | RectElement
  | IconElement
  | TextElement
  | PathElement
  | ImageElement;

export type AnimationElementType = AnimationElement["type"];

export interface AnimationScene {
  /** Spoken aloud (TTS) and shown as a caption while the scene draws. */
  narration: string;
  /** Drawn in array order, one after another. */
  elements: AnimationElement[];
}

/** Exactly four answer options; `correctIndex` points at the right one. */
export interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  /** 0-3, indexing into `options`. */
  correctIndex: number;
}

/** A study flashcard: a prompt/term on the front, the answer on the back. */
export interface FlashCard {
  front: string;
  back: string;
}

export interface AnimationData {
  summary: string;
  /** As many scenes as the explanation genuinely needs (see validation bounds). */
  scenes: AnimationScene[];
  /** A handful of questions, scaled to how much was covered. */
  quiz: QuizQuestion[];
  /**
   * Study flashcards for the topic. Optional so older cached animations (made
   * before flashcards existed) still validate; new generations always include
   * them.
   */
  flashcards?: FlashCard[];
}

/** Generation length. Long-form is a premium feature. */
export type AnimationFormat = "standard" | "long";
