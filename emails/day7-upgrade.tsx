import { Section } from "@react-email/components";
import * as React from "react";
import { H, Layout, OptionCard, P, Small } from "./_components";

/** Day-7 willingness-to-pay survey (only sent to engaged users). */
export default function Day7Upgrade({
  baseUrl,
  token,
  animationCount,
}: {
  baseUrl: string;
  token: string;
  animationCount: number;
}) {
  const respond = (r: string) =>
    `${baseUrl}/api/email/respond?type=day7_upgrade&r=${r}&token=${token}`;
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${token}`;

  return (
    <Layout
      preview="Would you pay for more Skribbl?"
      unsubscribeUrl={unsubscribeUrl}
    >
      <H>Honest question</H>
      <P>
        You&apos;ve created {animationCount} animations this week. We&apos;re
        deciding what to build next, and we&apos;d love your input.
      </P>
      <P>
        If Skribbl had a premium plan with unlimited animations, saved history
        across devices, and quiz progress tracking — would you pay for it?
      </P>
      <Section style={{ marginTop: 8 }}>
        <OptionCard href={respond("yes_5")}>
          Yes, if it was under $5/month
        </OptionCard>
        <OptionCard href={respond("yes_10")}>
          Yes, if it was under $10/month
        </OptionCard>
        <OptionCard href={respond("no")}>No, free is enough</OptionCard>
      </Section>
      <Small>
        Either way, thanks for trying Skribbl. Your answer genuinely helps us
        decide what to build.
      </Small>
    </Layout>
  );
}
