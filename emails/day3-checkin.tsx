import { Section } from "@react-email/components";
import * as React from "react";
import { H, Layout, OptionCard, P, Small } from "./_components";

/** Day-3 sentiment check. */
export default function Day3Checkin({
  baseUrl,
  token,
}: {
  baseUrl: string;
  token: string;
}) {
  const respond = (r: string) =>
    `${baseUrl}/api/email/respond?type=day3_checkin&r=${r}&token=${token}`;
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${token}`;

  return (
    <Layout
      preview="How's Skribbl working for you?"
      unsubscribeUrl={unsubscribeUrl}
    >
      <H>Quick question</H>
      <P>
        You&apos;ve been using Skribbl for a few days — we&apos;d love to know
        what you think.
      </P>
      <Section style={{ marginTop: 8 }}>
        <OptionCard href={respond("loving")}>🔥 Loving it</OptionCard>
        <OptionCard href={respond("okay")}>😐 It&apos;s okay</OptionCard>
        <OptionCard href={respond("notforme")}>😕 Not for me</OptionCard>
      </Section>
      <Small>Or just hit reply — we read every email.</Small>
    </Layout>
  );
}
