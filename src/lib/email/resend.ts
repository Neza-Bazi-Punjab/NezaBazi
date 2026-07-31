// Minimal server-only Resend client.
//
// Supabase's SMTP setting only covers Auth emails (confirmation, recovery,
// email change) rendered from Supabase's own templates. A registration
// confirmation code is an application email, so it goes through the Resend API
// directly with a server-only key.
//
// Sending is best-effort by design: the confirmation code is always shown
// on-screen and on /account, so a missing key or a Resend outage must never
// fail a registration that already succeeded.
import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailResult =
  | { status: "sent"; id: string | null }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

// The verified sending domain in Resend is the `mail.` subdomain, not the apex
// — the apex carries the site itself and has no sending DNS. Resend rejects any
// send from an unverified domain with a 403, so this must stay on `mail.`.
// Matches the sender the Supabase Auth templates already send from, so every
// email in the sequence arrives from one address.
const getFromAddress = () =>
  process.env.RESEND_FROM_EMAIL?.trim() ||
  "NezaBazi Punjab <no-reply@mail.nezabazipunjab.com>";

export const sendEmail = async ({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<SendEmailResult> => {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    // Local development and any environment where the key has not been added
    // yet. Logged once per send so it is obvious why no email arrived.
    console.warn(
      `RESEND_API_KEY is not set — skipped the "${subject}" email to ${to}.`
    );
    return { status: "skipped", reason: "RESEND_API_KEY is not set." };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: getFromAddress(), to, subject, html, text }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(
        `Resend rejected the "${subject}" email to ${to}: ${response.status} ${detail}`
      );
      return { status: "failed", reason: `Resend responded ${response.status}.` };
    }

    const payload = (await response.json()) as { id?: string };
    return { status: "sent", id: payload.id ?? null };
  } catch (error) {
    console.error(`Failed to send the "${subject}" email to ${to}`, error);
    return { status: "failed", reason: "The email request failed." };
  }
};
