import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, Kalam } from "next/font/google";
import "./globals.css";
import { assertServerEnv } from "@/lib/security/validation";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { FeedbackButton } from "@/components/FeedbackButton";
import { WelcomeOnLoad } from "@/components/WelcomeOnLoad";
import { cn } from "@/lib/utils";

// Display: headlines, section titles, wordmark.
const fontDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-display",
  display: "swap",
});

// Sans: body text, UI labels, buttons, nav — everything else.
const fontSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-sans",
  display: "swap",
});

// Hand: canvas text and small annotation callouts only.
const fontHand = Kalam({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-hand",
  display: "swap",
});

// Fail loudly at boot if required env vars are missing, rather than deep
// inside a request handler. Runs once on the server at module init.
assertServerEnv();

export const metadata: Metadata = {
  title: "Skribbl",
  description: "AI-powered educational whiteboard animations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Note: anonymous sign-in happens in middleware.ts (the only place that can
  // persist auth cookies to the browser), so every visitor already has a
  // session by the time any page renders.
  return (
    <html
      lang="en"
      className={cn(
        fontDisplay.variable,
        fontSans.variable,
        fontHand.variable,
      )}
    >
      <body className="font-sans">
        <AnalyticsProvider />
        <WelcomeOnLoad />
        {children}
        <FeedbackButton />
      </body>
    </html>
  );
}
