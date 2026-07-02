import { ImageResponse } from "next/og";

/**
 * Dynamic Open Graph image for shared animations (/a/[id]) — what X,
 * WhatsApp, and Discord show when a share link unfurls. Renders the question
 * on a whiteboard-style card. Edge runtime; reads the animation via the
 * public Supabase REST API (animations are publicly readable).
 */

export const runtime = "edge";
export const alt = "Skribbl whiteboard animation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function fetchQuestion(id: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const res = await fetch(
      `${base}/rest/v1/animations?id=eq.${id}&select=question_text`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ question_text?: string }>;
    return rows[0]?.question_text ?? null;
  } catch {
    return null;
  }
}

export default async function OgImage({
  params,
}: {
  params: { id: string };
}) {
  const question = (await fetchQuestion(params.id)) ?? "Learn anything, drawn out";
  const display = question.length > 120 ? `${question.slice(0, 117)}…` : question;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#FAF7F0",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        {/* Whiteboard card */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "#ffffff",
            border: "4px solid #2C3E50",
            borderRadius: 24,
            padding: 56,
            boxShadow: "12px 12px 0 rgba(44, 62, 80, 0.15)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 40,
              fontWeight: 700,
              color: "#2C3E50",
            }}
          >
            <div
              style={{
                width: 48,
                height: 34,
                border: "5px solid #2C3E50",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                color: "#E8745C",
              }}
            >
              ~
            </div>
            Skribbl
          </div>

          <div
            style={{
              fontSize: display.length > 70 ? 52 : 64,
              fontWeight: 700,
              color: "#2C3E50",
              lineHeight: 1.2,
            }}
          >
            {display}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 28,
              color: "#5C6F7E",
            }}
          >
            <div style={{ display: "flex" }}>
              ▶ Watch it drawn &amp; narrated
            </div>
            <div style={{ display: "flex", color: "#E8745C", fontWeight: 700 }}>
              getskribbl.vercel.app
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
