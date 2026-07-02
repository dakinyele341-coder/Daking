import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

/**
 * ============================================================
 * Email sending via Gmail SMTP (no custom domain required)
 * ============================================================
 * Sends from a Gmail address using an App Password — works for free with no
 * domain, and works fine when the app is deployed on a *.vercel.app URL (the
 * sending happens over SMTP to Gmail; the app's own domain is irrelevant).
 *
 * Requires (server-only):
 *   GMAIL_USER          the full Gmail address, e.g. skribbl.app@gmail.com
 *   GMAIL_APP_PASSWORD  a 16-char App Password (Google account → Security →
 *                       2-Step Verification → App passwords). NOT your login pw.
 *   EMAIL_FROM          optional display, e.g. "Skribbl <skribbl.app@gmail.com>"
 *
 * Gmail free tier sends ~500 recipients/day — plenty for transactional + a
 * small lifecycle program.
 */

const USER = process.env.GMAIL_USER;
const PASS = process.env.GMAIL_APP_PASSWORD;
const FROM = process.env.EMAIL_FROM || (USER ? `Skribbl <${USER}>` : "");

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!USER || !PASS) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: USER, pass: PASS },
  });
  return transporter;
}

/**
 * Renders a React Email to HTML and sends it via Gmail. Never throws — a failed
 * email must never crash a request or the cron run.
 */
export async function sendEmail({
  to,
  subject,
  template,
}: {
  to: string;
  subject: string;
  template: ReactElement;
}): Promise<{ success: boolean; error?: string }> {
  const tx = getTransporter();
  if (!tx) {
    console.warn("[email] GMAIL_USER/GMAIL_APP_PASSWORD not set — skipping send");
    return { success: false, error: "not_configured" };
  }

  try {
    const html = await render(template);
    await tx.sendMail({ from: FROM, to, subject, html });
    return { success: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { success: false, error: String(err) };
  }
}
