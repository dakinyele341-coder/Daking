/**
 * Plan / trial constants shared by server routes and client UI.
 * No secrets here — safe to import from client components.
 */

/**
 * Free long-form trial: every user (anonymous or signed up) may generate this
 * many long-form videos for free. Once used up, the long-form option shows as
 * "Coming soon" until they're premium. Enforced server-side in
 * app/api/generate-animation/route.ts against the `long_form_usage` table.
 */
export const FREE_LONG_FORM_LIMIT = 6;
