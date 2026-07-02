import { Section } from "@react-email/components";
import * as React from "react";
import { Btn, Chip, H, Layout, P, Small } from "./_components";

const EXAMPLES = [
  "How does the human immune system work?",
  "Explain Newton's laws of motion",
];

/** Welcome email — sent right after email confirmation. */
export default function Welcome({
  appUrl,
  unsubscribeUrl,
}: {
  appUrl: string;
  unsubscribeUrl: string;
}) {
  return (
    <Layout
      preview="Your Skribbl account is ready — ask your first question"
      unsubscribeUrl={unsubscribeUrl}
    >
      <H>You&apos;re in. Ask your first question.</H>
      <P>
        Type anything you&apos;re curious about and watch it become a whiteboard
        animation in seconds.
      </P>
      <Section style={{ margin: "8px 0 20px" }}>
        <Btn href={`${appUrl}/create`}>Try Skribbl now</Btn>
      </Section>

      <Small>Or start with one of these:</Small>
      <Section style={{ marginTop: 8 }}>
        {EXAMPLES.map((q) => (
          <Chip key={q} href={`${appUrl}/create?q=${encodeURIComponent(q)}`}>
            {q}
          </Chip>
        ))}
      </Section>
    </Layout>
  );
}
