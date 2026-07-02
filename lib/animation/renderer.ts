/**
 * ============================================================
 * Hand-drawn canvas renderer
 * ============================================================
 * Pure drawing functions for the 1280x720 animation canvas. Everything here
 * is stateless: the controller decides WHAT to draw and at WHAT progress, and
 * calls these to actually paint a frame.
 *
 * Hand-drawn look:
 *   - Lines/arrows wobble ±1.5px perpendicular to their direction, sampled at
 *     ~10px intervals.
 *   - Circles get a ±2px sinusoidal radius variation.
 *   - Rectangles are decomposed into four sequentially-drawn lines.
 *   - Icons "draw themselves": their SVG sub-paths are stroked progressively
 *     using line-dash, so they look hand-drawn rather than fading in.
 *
 * The wobble/variation is sampled from a SEEDED random generator keyed by the
 * element's own coordinates. That determinism is essential: it means a static
 * element looks identical on every redraw, so finished strokes don't vibrate
 * while later elements are still being drawn.
 *
 * NOTE: browser-only (uses CanvasRenderingContext2D / DOM / Path2D).
 * Import only from client components.
 */

import type { AnimationElement } from "@/lib/types/animation";

export const INK_COLOR = "#2C3E50"; // `ink` brand token
export const HANDWRITTEN_FONT = '"Kalam", "Caveat", cursive';

/** Yellow marker highlight swept under important text. */
const HIGHLIGHT_FILL = "rgba(255, 214, 0, 0.4)";
/** Opacity of the felt-tip color wash inside colored shapes. */
const FILL_WASH_ALPHA = 0.16;
/**
 * Shapes split their progress: the outline strokes in first, then the color
 * washes in. Same split for text + its highlight sweep.
 */
const OUTLINE_PHASE = 0.78;

const DEFAULT_STROKE_WIDTH = 3;
const WOBBLE_AMPLITUDE = 1.5; // px, perpendicular
const WOBBLE_STEP = 10; // px between samples
const CIRCLE_RADIUS_VARIATION = 2; // px
const ICON_STROKE_WIDTH = 2; // in the icon's own viewBox units (lucide default)

interface Point {
  x: number;
  y: number;
}

// ---- Parsed-icon model ------------------------------------------------------

interface IconSubPath {
  path: Path2D;
  length: number;
}

/** A parsed SVG icon: stroke-able sub-paths plus its viewBox dimensions. */
export interface LoadedIcon {
  subPaths: IconSubPath[];
  totalLength: number;
  viewWidth: number;
  viewHeight: number;
}

/** name → parsed icon. Built by the player and passed down to the renderer. */
export type IconCache = Map<string, LoadedIcon>;

/** url → preloaded illustration image. Built by the player. */
export type ImageCache = Map<string, HTMLImageElement>;

// ---- Deterministic seeded randomness ----------------------------------------

/** FNV-1a-ish hash of a list of numbers → uint32 seed. */
function hashCoords(...nums: number[]): number {
  let h = 2166136261;
  for (const n of nums) {
    const v = Math.round(n * 100) | 0;
    h ^= v & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >> 8) & 0xff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Park–Miller LCG. Deterministic for a given seed; returns 0..1. */
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = Math.imul(s, 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---- Polyline helpers -------------------------------------------------------

/** Strokes the first `fraction` (0..1) of a polyline's total length. */
function strokePartialPolyline(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  fraction: number,
): void {
  if (pts.length < 2) return;
  const f = clamp01(fraction);

  const segs: { a: Point; b: Point; len: number }[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len });
    total += len;
  }

  const target = total * f;
  const first = segs[0]!;
  ctx.beginPath();
  ctx.moveTo(first.a.x, first.a.y);

  let acc = 0;
  for (const seg of segs) {
    if (acc + seg.len <= target) {
      ctx.lineTo(seg.b.x, seg.b.y);
      acc += seg.len;
    } else {
      const remain = target - acc;
      const t = seg.len === 0 ? 0 : remain / seg.len;
      ctx.lineTo(seg.a.x + (seg.b.x - seg.a.x) * t, seg.a.y + (seg.b.y - seg.a.y) * t);
      break;
    }
  }
  ctx.stroke();
}

/** Builds a wobbly point list between two endpoints. */
function buildWobblyLine(x1: number, y1: number, x2: number, y2: number): Point[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [{ x: x1, y: y1 }];

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy; // perpendicular unit
  const py = ux;

  const rand = seededRandom(hashCoords(x1, y1, x2, y2));
  const n = Math.max(1, Math.round(len / WOBBLE_STEP));
  const pts: Point[] = [];

  for (let i = 0; i <= n; i++) {
    const tEdge = i / n;
    const d = tEdge * len;
    // Taper wobble to zero at both ends so segments join cleanly.
    const taper = Math.sin(tEdge * Math.PI);
    const wob = (rand() - 0.5) * 2 * WOBBLE_AMPLITUDE * taper;
    pts.push({ x: x1 + ux * d + px * wob, y: y1 + uy * d + py * wob });
  }
  return pts;
}

/** Builds a wobbly circle (closed loop) point list. */
function buildWobblyCircle(cx: number, cy: number, r: number): Point[] {
  const circumference = 2 * Math.PI * r;
  const n = Math.max(24, Math.round(circumference / WOBBLE_STEP));
  const rand = seededRandom(hashCoords(cx, cy, r));
  const phase = rand() * Math.PI * 2;
  const freq = 3 + Math.floor(rand() * 3); // 3..5 lobes
  // Start slightly past 12 o'clock for a natural pen-down look.
  const start = -Math.PI / 2 + (rand() - 0.5) * 0.3;

  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    const rr = r + Math.sin(a * freq + phase) * CIRCLE_RADIUS_VARIATION;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}

// ---- Style helpers ----------------------------------------------------------

function applyStroke(
  ctx: CanvasRenderingContext2D,
  color: string | undefined,
  width: number | undefined,
): void {
  ctx.strokeStyle = color ?? INK_COLOR;
  ctx.lineWidth = width ?? DEFAULT_STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/**
 * Splits an element's 0..1 progress into an outline phase and a color-wash
 * phase. Elements without an explicit color skip the wash (outline spans the
 * whole progress), so color stays a deliberate emphasis, not noise.
 */
function splitPhases(progress: number, hasWash: boolean): {
  outline: number;
  wash: number;
} {
  if (!hasWash) return { outline: clamp01(progress), wash: 0 };
  return {
    outline: clamp01(progress / OUTLINE_PHASE),
    wash: clamp01((progress - OUTLINE_PHASE) / (1 - OUTLINE_PHASE)),
  };
}

/**
 * Washes a felt-tip color fill into a closed path with a left-to-right wipe —
 * the "coloring in" moment after an outline finishes drawing.
 */
function washFill(
  ctx: CanvasRenderingContext2D,
  buildPath: () => void,
  color: string,
  bounds: { x: number; y: number; w: number; h: number },
  wash: number,
): void {
  if (wash <= 0) return;
  ctx.save();
  ctx.beginPath();
  // Clip rect grows left → right; padded so wobbly strokes stay inside.
  ctx.rect(bounds.x - 8, bounds.y - 8, (bounds.w + 16) * wash, bounds.h + 16);
  ctx.clip();
  ctx.globalAlpha = FILL_WASH_ALPHA;
  ctx.fillStyle = color;
  ctx.beginPath();
  buildPath();
  ctx.fill();
  ctx.restore();
}

// ---- Element drawers --------------------------------------------------------

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  progress: number,
  color?: string,
  width?: number,
): void {
  applyStroke(ctx, color, width);
  ctx.setLineDash([]);
  strokePartialPolyline(ctx, buildWobblyLine(x1, y1, x2, y2), progress);
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  progress: number,
  color?: string,
  width?: number,
): void {
  // Shaft draws over the first 80% of progress, head over the last 20%.
  const shaftProgress = clamp01(progress / 0.8);
  drawLine(ctx, x1, y1, x2, y2, shaftProgress, color, width);

  if (progress <= 0.8) return;
  const headProgress = clamp01((progress - 0.8) / 0.2);

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.min(22, Math.hypot(x2 - x1, y2 - y1) * 0.3);
  const spread = Math.PI / 7;

  const leftX = x2 - Math.cos(angle - spread) * headLen;
  const leftY = y2 - Math.sin(angle - spread) * headLen;
  const rightX = x2 - Math.cos(angle + spread) * headLen;
  const rightY = y2 - Math.sin(angle + spread) * headLen;

  drawLine(ctx, x2, y2, leftX, leftY, headProgress, color, width);
  drawLine(ctx, x2, y2, rightX, rightY, headProgress, color, width);
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  progress: number,
  color?: string,
  width?: number,
): void {
  const { outline, wash } = splitPhases(progress, Boolean(color));
  const pts = buildWobblyCircle(cx, cy, r);

  // Color wash first so the outline strokes sit crisply on top.
  if (color) {
    washFill(
      ctx,
      () => {
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.closePath();
      },
      color,
      { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
      wash,
    );
  }

  applyStroke(ctx, color, width);
  ctx.setLineDash([]);
  strokePartialPolyline(ctx, pts, outline);
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  progress: number,
  color?: string,
  width?: number,
): void {
  const { outline, wash } = splitPhases(progress, Boolean(color));

  // Color wash first so the outline strokes sit crisply on top.
  if (color) {
    washFill(
      ctx,
      () => ctx.rect(x, y, w, h),
      color,
      { x, y, w, h },
      wash,
    );
  }

  // Four edges drawn one after another (top → right → bottom → left).
  const corners: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ];

  const edges = 4;
  for (let i = 0; i < edges; i++) {
    const edgeStart = i / edges;
    const local = clamp01((outline - edgeStart) * edges);
    if (local <= 0) break;
    const a = corners[i]!;
    const b = corners[i + 1]!;
    drawLine(ctx, a.x, a.y, b.x, b.y, local, color, width);
  }
}

/**
 * Progressively strokes a parsed icon's sub-paths. `progress` (0..1) reveals
 * the icon's total path length in document order, so it appears to draw itself.
 */
function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: LoadedIcon,
  x: number,
  y: number,
  size: number,
  progress: number,
): void {
  if (icon.subPaths.length === 0 || icon.viewWidth === 0) return;

  const scale = size / icon.viewWidth;
  const drawLen = clamp01(progress) * icon.totalLength;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = INK_COLOR;
  ctx.lineWidth = ICON_STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let acc = 0;
  for (const sub of icon.subPaths) {
    if (acc >= drawLen) break;
    const available = drawLen - acc;

    if (available >= sub.length) {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.stroke(sub.path);
    } else {
      // Reveal only the first `available` units of this sub-path.
      const len = sub.length;
      ctx.setLineDash([len, len]);
      ctx.lineDashOffset = len - available;
      ctx.stroke(sub.path);
    }
    acc += sub.length;
  }

  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.restore();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  progress: number,
  size?: number,
  color?: string,
  highlight?: boolean,
): void {
  const fontSize = size ?? 28;
  // Highlighted text writes in first, then the marker sweeps under it.
  const { outline: writeP, wash: sweepP } = splitPhases(
    progress,
    Boolean(highlight),
  );
  const count = Math.floor(clamp01(writeP) * text.length);
  if (count <= 0) return;

  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `${fontSize}px ${HANDWRITTEN_FONT}`;
  ctx.textBaseline = "alphabetic";

  // Yellow marker sweep — drawn first (under the letters), left to right,
  // slightly wobbly like a real highlighter stroke.
  if (highlight && sweepP > 0) {
    const width = ctx.measureText(text).width;
    const rand = seededRandom(hashCoords(x, y, width));
    const h = Math.max(10, fontSize * 0.42);
    const yTop = y - h * 0.55; // overlaps the lower half of the letters
    const sw = width * sweepP;
    ctx.fillStyle = HIGHLIGHT_FILL;
    ctx.beginPath();
    ctx.moveTo(x - 3, yTop + (rand() - 0.5) * 3);
    ctx.lineTo(x + sw + 3, yTop + (rand() - 0.5) * 3);
    ctx.lineTo(x + sw + 3, yTop + h + (rand() - 0.5) * 3);
    ctx.lineTo(x - 3, yTop + h + (rand() - 0.5) * 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = color ?? INK_COLOR;
  ctx.fillText(text.slice(0, count), x, y);
  ctx.restore();
}

// ---- SVG icon parsing -------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

function numAttr(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name);
  if (raw === null) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Converts a single SVG shape element to a path `d` string (or null). */
function shapeToPathData(el: Element): string | null {
  switch (el.tagName.toLowerCase()) {
    case "path":
      return el.getAttribute("d");
    case "line": {
      const x1 = numAttr(el, "x1");
      const y1 = numAttr(el, "y1");
      const x2 = numAttr(el, "x2");
      const y2 = numAttr(el, "y2");
      return `M${x1},${y1} L${x2},${y2}`;
    }
    case "circle": {
      const cx = numAttr(el, "cx");
      const cy = numAttr(el, "cy");
      const r = numAttr(el, "r");
      if (r <= 0) return null;
      return `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`;
    }
    case "ellipse": {
      const cx = numAttr(el, "cx");
      const cy = numAttr(el, "cy");
      const rx = numAttr(el, "rx");
      const ry = numAttr(el, "ry");
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0`;
    }
    case "rect": {
      const x = numAttr(el, "x");
      const y = numAttr(el, "y");
      const w = numAttr(el, "width");
      const h = numAttr(el, "height");
      if (w <= 0 || h <= 0) return null;
      return `M${x},${y} h${w} v${h} h${-w} Z`;
    }
    case "polyline":
    case "polygon": {
      const raw = el.getAttribute("points");
      if (!raw) return null;
      const nums = raw.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (nums.length < 4) return null;
      let d = `M${nums[0]},${nums[1]}`;
      for (let i = 2; i + 1 < nums.length; i += 2) {
        d += ` L${nums[i]},${nums[i + 1]}`;
      }
      if (el.tagName.toLowerCase() === "polygon") d += " Z";
      return d;
    }
    default:
      return null;
  }
}

/**
 * Fetches and parses an icon SVG from `/icons/<name>.svg` into stroke-able
 * `Path2D` sub-paths, measuring each one's length so the renderer can draw
 * them progressively. Returns null if it can't be loaded/parsed.
 */
export async function loadIcon(name: string): Promise<LoadedIcon | null> {
  try {
    const res = await fetch(`/icons/${encodeURIComponent(name)}.svg`, {
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const text = await res.text();

    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg || doc.querySelector("parsererror")) return null;

    // Determine the viewBox (lucide is "0 0 24 24").
    let viewWidth = 24;
    let viewHeight = 24;
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2]! > 0 && parts[3]! > 0) {
        viewWidth = parts[2]!;
        viewHeight = parts[3]!;
      }
    }

    // A detached <path> we reuse to measure each sub-path's length.
    const measurer = document.createElementNS(SVG_NS, "path") as SVGPathElement;

    const subPaths: IconSubPath[] = [];
    let totalLength = 0;

    const shapes = svg.querySelectorAll("path, line, circle, ellipse, rect, polyline, polygon");
    shapes.forEach((shape) => {
      const d = shapeToPathData(shape);
      if (!d) return;
      measurer.setAttribute("d", d);
      let length = 0;
      try {
        length = measurer.getTotalLength();
      } catch {
        length = 0;
      }
      if (length <= 0) return;
      subPaths.push({ path: new Path2D(d), length });
      totalLength += length;
    });

    if (subPaths.length === 0 || totalLength === 0) return null;

    return { subPaths, totalLength, viewWidth, viewHeight };
  } catch {
    return null;
  }
}

// ---- Freeform path drawing --------------------------------------------------

// Path2D + measured length are expensive to build, so cache per `d` string.
// `d` strings are stable across redraws, and an animation has only a handful.
const pathCache = new Map<string, { path: Path2D; length: number }>();

function getPath(d: string): { path: Path2D; length: number } {
  const cached = pathCache.get(d);
  if (cached) return cached;

  let length = 0;
  try {
    const measurer = document.createElementNS(SVG_NS, "path") as SVGPathElement;
    measurer.setAttribute("d", d);
    length = measurer.getTotalLength();
  } catch {
    length = 0;
  }

  let path: Path2D;
  try {
    path = new Path2D(d);
  } catch {
    path = new Path2D();
    length = 0;
  }

  const entry = { path, length };
  pathCache.set(d, entry);
  return entry;
}

/**
 * Progressively strokes a freeform SVG path (a detailed/3D hand-drawn figure),
 * with an optional subtle fill that fades in.
 */
function drawPath(
  ctx: CanvasRenderingContext2D,
  d: string,
  progress: number,
  color?: string,
  width?: number,
  fill?: string,
): void {
  const { path, length } = getPath(d);
  if (length <= 0) return;
  const p = clamp01(progress);

  if (fill) {
    ctx.save();
    ctx.globalAlpha = p * 0.45; // subtle shading, fades in with the stroke
    ctx.fillStyle = fill;
    ctx.fill(path);
    ctx.restore();
  }

  applyStroke(ctx, color, width);
  const drawLen = p * length;
  ctx.setLineDash([length, length]);
  ctx.lineDashOffset = length - drawLen;
  ctx.stroke(path);
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

/**
 * Reveals a preloaded illustration with a left-to-right "being drawn" wipe.
 * The image is fit (contain) into its box so it isn't distorted.
 */
function drawImageElement(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  progress: number,
): void {
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const p = clamp01(progress);

  // Fit (contain) the image within the box, centered.
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;

  ctx.save();
  // Clip to the revealed portion (grows left→right as it "draws").
  ctx.beginPath();
  ctx.rect(dx, dy, dw * p, dh);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

// ---- Public API -------------------------------------------------------------

/**
 * Draws a single element at the given `progress` (0 = nothing, 1 = complete).
 * `icons` maps icon name → parsed icon data; `images` maps url → preloaded
 * illustration (both provided by the player).
 */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  element: AnimationElement,
  progress: number,
  icons: IconCache,
  images: ImageCache,
): void {
  switch (element.type) {
    case "line":
      drawLine(ctx, element.x1, element.y1, element.x2, element.y2, progress, element.color, element.strokeWidth);
      break;
    case "arrow":
      drawArrow(ctx, element.x1, element.y1, element.x2, element.y2, progress, element.color, element.strokeWidth);
      break;
    case "circle":
      drawCircle(ctx, element.cx, element.cy, element.r, progress, element.color, element.strokeWidth);
      break;
    case "rect":
      drawRect(ctx, element.x, element.y, element.w, element.h, progress, element.color, element.strokeWidth);
      break;
    case "icon": {
      const icon = icons.get(element.icon);
      if (icon) drawIcon(ctx, icon, element.x, element.y, element.size, progress);
      break;
    }
    case "text":
      drawText(ctx, element.text, element.x, element.y, progress, element.size, element.color, element.highlight);
      break;
    case "path":
      drawPath(ctx, element.d, progress, element.color, element.strokeWidth, element.fill);
      break;
    case "image":
      drawImageElement(ctx, images.get(element.url), element.x, element.y, element.w, element.h, progress);
      break;
  }
}

/**
 * Relative "ink cost" of an element, used by the controller to apportion
 * drawing time. Roughly proportional to how much there is to draw. (Icons get
 * a fixed duration in the controller, so their cost here is unused.)
 */
export function elementDrawCost(element: AnimationElement): number {
  switch (element.type) {
    case "line":
    case "arrow":
      return Math.hypot(element.x2 - element.x1, element.y2 - element.y1);
    case "circle":
      return 2 * Math.PI * element.r;
    case "rect":
      return 2 * (element.w + element.h);
    case "icon":
      return element.size * 2;
    case "text":
      return element.text.length * 14;
    case "path":
      // Proportional to path length, capped so one ornate figure can't dominate
      // the scene's timing.
      return Math.min(getPath(element.d).length, 1400);
    case "image":
      // A roomy reveal so the illustration "draws on" over a comfortable beat.
      return 1100;
  }
}

/**
 * "Made with Skribbl" mark, bottom-right of every frame. Drawn last so it
 * sits on top; subtle enough not to distract, present in every screen
 * recording and exported video.
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = `16px ${HANDWRITTEN_FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = INK_COLOR;
  ctx.fillText("Made with Skribbl", width - 16, height - 12);
  ctx.restore();
}

/**
 * Burned-in caption line at the bottom of the canvas — used during video
 * export so downloaded/recorded videos keep their subtitles (DOM captions
 * aren't part of the canvas).
 */
export function drawBurnedCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
): void {
  if (!text) return;
  ctx.save();
  ctx.setLineDash([]);
  const fontSize = 26;
  ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const padX = 18;
  const padY = 10;
  const metrics = ctx.measureText(text);
  const boxW = Math.min(width - 48, metrics.width + padX * 2);
  const boxH = fontSize + padY * 2;
  const cx = width / 2;
  const cy = height - 34 - boxH / 2;

  // Dark pill behind light text (matches the on-page caption styling).
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = INK_COLOR;
  const r = 8;
  const bx = cx - boxW / 2;
  const by = cy - boxH / 2;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r);
  ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r);
  ctx.arcTo(bx, by + boxH, bx, by, r);
  ctx.arcTo(bx, by, bx + boxW, by, r);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#FAF7F0";
  ctx.fillText(text, cx, cy + 1, boxW - padX * 2);
  ctx.restore();
}

/** Paints the whiteboard background and clears the previous frame. */
export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background = "#ffffff",
): void {
  ctx.setLineDash([]);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
}
