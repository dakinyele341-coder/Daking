import { Section } from "@react-email/components";
import * as React from "react";
import { Btn, H, Layout, P, Small } from "./_components";

/**
 * Confirm-email template (subject: "Confirm your Skribbl account").
 *
 * NOTE: by default Supabase sends the confirmation email itself (see the
 * dashboard Auth template). This React Email version exists for when you wire
 * Supabase's "Send Email" auth hook to deliver via Resend instead.
 */
export default function ConfirmEmail({ confirmUrl }: { confirmUrl: string }) {
  return (
    <Layout preview="Confirm your email to start using Skribbl">
      <H>One tap to get started</H>
      <P>
        Click below to confirm your email and start turning questions into
        animations.
      </P>
      <Section style={{ margin: "8px 0 4px" }}>
        <Btn href={confirmUrl}>Confirm my account</Btn>
      </Section>
      <Small>
        Link expires in 24 hours. If you didn&apos;t sign up for Skribbl, ignore
        this email.
      </Small>
    </Layout>
  );
}
