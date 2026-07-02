/**
 * Copies the SVG files for every icon in `ALLOWED_ICONS` from the installed
 * `lucide-static` package into `public/icons/`, so the app serves icons from
 * its own origin (no third-party CDN, friendly to the strict CSP).
 *
 * Run with:  npx tsx scripts/copy-icons.ts
 * (or)        node --import tsx scripts/copy-icons.ts
 */

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_ICONS } from "../lib/types/animation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const SRC_DIR = join(projectRoot, "node_modules", "lucide-static", "icons");
const DEST_DIR = join(projectRoot, "public", "icons");

function main(): void {
  if (!existsSync(SRC_DIR)) {
    console.error(
      `[copy-icons] Source directory not found: ${SRC_DIR}\n` +
        `Is 'lucide-static' installed? Run: npm install lucide-static`,
    );
    process.exit(1);
  }

  if (!existsSync(DEST_DIR)) {
    mkdirSync(DEST_DIR, { recursive: true });
  }

  let copied = 0;
  const missing: string[] = [];

  for (const icon of ALLOWED_ICONS) {
    const src = join(SRC_DIR, `${icon}.svg`);
    const dest = join(DEST_DIR, `${icon}.svg`);

    if (!existsSync(src)) {
      missing.push(icon);
      continue;
    }

    copyFileSync(src, dest);
    copied++;
  }

  console.log(`[copy-icons] Copied ${copied}/${ALLOWED_ICONS.length} icons to public/icons/`);

  if (missing.length > 0) {
    console.error(
      `[copy-icons] These icons were not found in lucide-static: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
}

main();
