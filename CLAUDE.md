# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Skribbl (package name `skribbl`) is a Next.js 14 App Router app that turns a learner's question into an AI-generated, hand-drawn whiteboard animation with narration and a quiz. Gemini produces a JSON scene description; a canvas renderer plays it back while the Web Speech API narrates.

## Commands

```bash
npm run dev          # local dev server (http://localhost:3000)
npm run build        # production build
npm run start        # serve a production build
npm run lint         # next lint (eslint)
npm run typecheck    # tsc --noEmit — run this after non-trivial changes
npm run setup:icons  # copy ALLOWED_ICONS svgs from lucide-static into public/icons/
```

There is no test runner configured. Verification = `npm run typecheck` + `npm run lint` + manual testing via `npm run dev`.

Path alias: `@/` maps to the repo root (e.g. `@/lib/...`, `@/components/...`).

## The core flow: question → animation

`POST /api/generate-animation` (`app/api/generate-animation/route.ts`) is the heart of the app. The pipeline:

1. **Session** — `createClient()` reads the user (every visitor has one; see auth below). 401 if none.
2. **Validate** body with `generateAnimationSchema` (Zod) from `lib/security/validation.ts`.
3. **Premium gate** — `format: "long"` requires a premium plan (admins are always premium).
4. **Rate limit** — Upstash Redis, keyed by `user_id`. Anonymous users get a tighter quota than authed.
5. **Cache lookup** — animations are content-addressed by `questionHash(question, complexity, format, context)` (sha256). A cache hit returns the stored `animation_data` immediately.
6. **Generate** — `generateAnimationFromGemini()` returns RAW, UNTRUSTED JSON.
7. **Validate model output twice** — `modelAnimationSchema` after `sanitizeAnimationData()`, then `animationDataSchema` again after illustrations are added. Never trust model output.
8. **Generate illustrations** — `image` elements carry a `prompt`; `buildIllustratedAnimation()` generates whiteboard PNGs in parallel (bounded concurrency), uploads them to the `illustrations` Storage bucket, and swaps each `prompt` for a public `url`.
9. **Persist** to the shared `animations` cache (admin client) and record `user_history` (user-scoped client).

A hard wall-clock budget (`REQUEST_BUDGET_MS = 50s`) keeps the request under Vercel's 60s cap: image generation stops *starting* new jobs past the deadline and the video ships with whatever finished.

## Architecture boundaries that matter

**Two Supabase clients — never mix them up:**
- `lib/supabase/server.ts` (`createClient`) — user-scoped, respects RLS, acts as the signed-in/anonymous user. Use for all user-scoped reads/writes.
- `lib/supabase/admin.ts` (`createAdminClient`) — service role, **bypasses all RLS**. `import "server-only"` makes the build fail if it leaks into a client bundle. Only use in route handlers for writes to shared tables (`animations`, `security_events`). Always validate input with Zod first.

**Auth is anonymous-first.** `middleware.ts` calls `supabase.auth.signInAnonymously()` for any visitor without a session. This MUST happen in middleware (not a Server Component) because only middleware/route handlers can persist auth cookies to the browser — otherwise API calls 401. Every visitor therefore has a `user.id`, which is what rate limiting and history key on.

**Security headers / CSP** are built in `middleware.ts` (`buildCsp`). When adding a new external origin (analytics, API, asset host), you must add it to the relevant CSP directive there or the browser will block it. The CSP currently allows `'unsafe-inline'`/`'unsafe-eval'` (Next.js bootstrap + dev HMR) — a known, documented relaxation.

**The animation data model is a shared contract** defined in `lib/types/animation.ts`. It is the single source of truth for: the Gemini prompt shape (`lib/ai/gemini.ts`), the Zod validators (`lib/security/validation.ts`), and the canvas renderer/controller (`lib/animation/`). All coordinates are on a fixed 1280×720 canvas. Changing an element type means touching all four places.

**Icons are a closed set.** `ALLOWED_ICONS` in `lib/types/animation.ts` lists every icon the model may reference; each maps to `public/icons/<name>.svg`. After editing that list, run `npm run setup:icons` to sync the SVGs from `lucide-static`. The closed set means the model can't request an icon the app doesn't serve.

**Gemini uses no SDK** — direct REST via `fetch` in `lib/ai/gemini.ts` (model `gemini-2.5-flash`, JSON output, `thinkingBudget: 0` so the full token budget goes to the answer). The system prompt is generated per complexity + format.

## Rate limiting fails CLOSED

`checkRateLimit` in `lib/security/rateLimit.ts`: if Upstash/Redis is unreachable, it returns `success: false` so the request is DENIED. A Redis outage must never silently disable rate limiting (that would expose unbounded, billable Gemini calls). Limiters are keyed by `user_id`, never raw IP.

## Animation playback (client)

`lib/animation/controller.ts` drives an `AnimationData` onto a canvas scene by scene. Pacing is **event-driven**: a scene advances only once BOTH its drawing has finished AND its narration (`speechSynthesis`) has ended, with a per-scene safety ceiling so a stuck/absent voice can't hang playback. `renderer.ts` draws individual elements; `voice.ts` picks the best TTS voice. Browser-only — construct from a client component after the canvas mounts.

## Email lifecycle (cron)

`vercel.json` schedules `GET /api/email/lifecycle` hourly. It is **Vercel Cron only** — authorized via `Authorization: Bearer <CRON_SECRET>`. It sends welcome / day-3 / day-7 emails and is **idempotent**: each send is recorded in the `email_lifecycle` table so a user is never emailed twice. Emails are React Email templates in `emails/`, rendered to HTML and sent via Gmail SMTP (`lib/email/sender.ts`) — no custom domain needed. Email sending never throws (a failed email must not crash a request or cron run). Unsubscribe/respond links are signed tokens (`lib/email/token.ts`).

## Database

Postgres on Supabase; migrations in `supabase/migrations/` (numbered `000N_*.sql`). Key tables: `profiles` (1:1 with `auth.users`, auto-created by the `handle_new_user` trigger, holds `plan`), `animations` (shared content-addressed cache, publicly readable, 90-day `expires_at`), `user_history`, `security_events`, `feedback`, `email_lifecycle`. RLS is enabled on user tables; the admin client is the only way to write shared tables. TypeScript types for the schema live in `lib/types/database.ts`.

## Environment

Copy `.env.local.example` to `.env.local`. Required: Supabase URL + anon + service-role keys, `GEMINI_API_KEY`, Upstash Redis URL + token. Optional (feature degrades gracefully if unset): PostHog analytics, Gmail SMTP + `CRON_SECRET`. `assertServerEnv()` (called in `app/layout.tsx`) fails the boot loudly if required vars are missing. Never put a server-only secret behind a `NEXT_PUBLIC_` prefix.

## Conventions

- Server-only modules start with `import "server-only";` — a compile-time guardrail against leaking secrets/admin access into client bundles.
- Route handlers validate input with `validateOrError(schema, body)` before any side effect, and never leak stack traces — unexpected throws map to a generic 500.
- Best-effort side effects (history writes, hit-count bumps, security-event logging) swallow their own errors so they never fail the main request.
