import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";

/**
 * Builds the Content-Security-Policy. Each non-`'self'` source is justified
 * inline so future edits stay deliberate.
 */
function buildCsp(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  // Supabase needs both REST/Realtime (https + wss) connections.
  const supabaseWs = supabaseUrl.replace(/^https:/, "wss:");

  // Gemini API endpoint the server *and* (eventually) client may call.
  const geminiApi = "https://generativelanguage.googleapis.com";

  // PostHog analytics: capture/recorder calls go to the api host; static JS
  // assets (recorder.js, surveys, etc.) load from the *-assets host. Only
  // takes effect if NEXT_PUBLIC_POSTHOG_KEY is configured; the directives are
  // harmless when analytics is disabled. Derived from the configured host so
  // EU/self-hosted instances work too.
  const posthogHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  const posthogAssets = posthogHost.replace("//us.", "//us-assets.");
  const posthog = `${posthogHost} ${posthogAssets}`;

  const directives = [
    // Lock everything down to our own origin by default.
    `default-src 'self'`,
    // Next.js injects inline/runtime scripts, so 'unsafe-inline' is required
    // for its bootstrap. 'unsafe-eval' is needed by the Next.js DEV server
    // (React Refresh / HMR compiles with eval); a production build does not
    // need it, but we keep one CSP here for both environments.
    // HARDENING (post-launch): move to a nonce-based script-src and drop BOTH
    // 'unsafe-inline' and 'unsafe-eval'. Until then this is a known, accepted
    // relaxation — see the security audit.
    // PostHog loads its recorder/array JS from its assets host.
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${posthogAssets}`,
    // Tailwind/shadcn inject inline styles at runtime.
    `style-src 'self' 'unsafe-inline'`,
    // Images: own origin, data URIs (inline SVG/canvas), Supabase Storage.
    `img-src 'self' data: blob: ${supabaseUrl}`,
    `font-src 'self' data:`,
    // XHR/fetch/websocket targets: Supabase (REST+Realtime), Gemini, PostHog.
    `connect-src 'self' ${supabaseUrl} ${supabaseWs} ${geminiApi} ${posthog}`,
    // PostHog session replay spins up a web worker.
    `worker-src 'self' blob:`,
    // No plugins, no <base> hijacking, no being framed.
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ];

  return directives.join("; ");
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("Content-Security-Policy", buildCsp());
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return res;
}

export async function middleware(request: NextRequest) {
  // Start from a passthrough response we can attach refreshed cookies to.
  let response = NextResponse.next({ request });

  // Refresh the Supabase session so Server Components see a valid token.
  // This pass does NOT gate any routes — auth gating comes later.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Ensure every visitor has a session. Anonymous sign-in MUST happen here (not
  // in a Server Component) because only middleware/route handlers can persist
  // the auth cookies to the browser. Without this, the anon session is created
  // server-side but never reaches the client, so API calls 401.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    try {
      await supabase.auth.signInAnonymously();
    } catch {
      // Anonymous sign-in is best-effort (e.g. provider disabled). Never let it
      // break the request pipeline.
    }
  }

  return applySecurityHeaders(response);
}

export const config = {
  // Run on everything except static assets and image optimization, so the
  // security headers cover all real pages and API routes.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
