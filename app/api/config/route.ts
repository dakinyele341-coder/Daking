import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/config — public feature flags derived from server env. Exposes
 * only WHETHER an optional integration is configured, never any secret.
 * The create page uses this to decide whether to show the voice toggle.
 */
export function GET() {
  return NextResponse.json({
    enhancedVoice: Boolean(process.env.ELEVENLABS_API_KEY),
  });
}
