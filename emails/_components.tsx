import {
  Body,
  Button,
  Container,
  Font,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import * as React from "react";

export const colors = {
  bg: "#FAFAFA",
  card: "#FFFFFF",
  ink: "#2C3E50",
  inkMuted: "#5C6F7E",
  marker: "#E8745C",
  border: "#E6E2D8",
};

const fontStack = "Inter, -apple-system, Segoe UI, Arial, sans-serif";

/** Shared shell: brand wordmark, white card, footer with unsubscribe. */
export function Layout({
  preview,
  unsubscribeUrl,
  children,
}: {
  preview: string;
  unsubscribeUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.bg,
          fontFamily: fontStack,
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: colors.card,
            borderRadius: 12,
            border: `1px solid ${colors.border}`,
            maxWidth: 480,
            margin: "0 auto",
            padding: 32,
          }}
        >
          <Text
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: colors.ink,
              margin: "0 0 24px",
            }}
          >
            Skribbl
          </Text>
          {children}
        </Container>

        <Container style={{ maxWidth: 480, margin: "0 auto", padding: "16px 32px" }}>
          <Text style={{ fontSize: 12, color: colors.inkMuted, lineHeight: "18px", margin: 0 }}>
            You&apos;re receiving this because you signed up for Skribbl.
            {unsubscribeUrl ? (
              <>
                {" "}
                <Link
                  href={unsubscribeUrl}
                  style={{ color: colors.inkMuted, textDecoration: "underline" }}
                >
                  Unsubscribe
                </Link>
                .
              </>
            ) : null}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function H({ children }: { children: React.ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{ fontSize: 24, fontWeight: 700, color: colors.ink, margin: "0 0 12px" }}
    >
      {children}
    </Heading>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 15, lineHeight: "24px", color: colors.ink, margin: "0 0 20px" }}>
      {children}
    </Text>
  );
}

export function Small({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 13, lineHeight: "20px", color: colors.inkMuted, margin: "16px 0 0" }}>
      {children}
    </Text>
  );
}

/** Primary CTA — marker background, white text, full width. */
export function Btn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: colors.marker,
        color: "#FFFFFF",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        textDecoration: "none",
        textAlign: "center",
        display: "block",
        padding: "13px 20px",
      }}
    >
      {children}
    </Button>
  );
}

/** Big tap-friendly option card (for day3/day7 choices). */
export function OptionCard({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: "#FFFFFF",
        color: colors.ink,
        border: `1.5px solid ${colors.border}`,
        borderRadius: 10,
        fontSize: 15,
        fontWeight: 600,
        textDecoration: "none",
        textAlign: "center",
        display: "block",
        padding: "14px 18px",
        marginBottom: 10,
      }}
    >
      {children}
    </Button>
  );
}

/** A clickable example-question chip. */
export function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: "#F1EEE6",
        color: colors.ink,
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: "none",
        textAlign: "center",
        display: "block",
        padding: "10px 16px",
        marginBottom: 8,
      }}
    >
      {children}
    </Button>
  );
}
