// Emails the caller their own solo registration confirmation code.
//
// Solo registrations are inserted straight from the browser under RLS, so
// there is no server step in that flow to hang an email off. The form calls
// this route once the insert succeeds. It only ever reads and sends the
// caller's own code, so it cannot be used to discover anyone else's.
//
// An account may enter several riders, with any names and addresses it
// likes, so the email goes only for the account holder's OWN registration
// (src/lib/registration-identity.ts, checked against the verified user).
// Otherwise this route would send a branded email to any address typed into
// the form. A rider entered for someone else gets a 200 with
// `{ sent: false, reason: "shown_on_account" }`: their code is on the
// account page instead.
import { NextResponse, after } from "next/server";
import { buildRegistrationCodeEmail } from "@/lib/email/registration-code";
import { sendEmail } from "@/lib/email/resend";
import { isOwnRegistration } from "@/lib/registration-identity";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in to request your confirmation code." },
      { status: 401 }
    );
  }

  const { data: rows, error } = await supabase
    .from("solo_registrations")
    .select("full_name, email, confirmation_code")
    .eq("profile_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const accountRows = rows ?? [];

  if (accountRows.length === 0) {
    return NextResponse.json(
      { error: "No solo registration was found for this account." },
      { status: 404 }
    );
  }

  const registration = accountRows.find((row) =>
    isOwnRegistration(
      row,
      { email: user.email, full_name: user.user_metadata?.full_name },
      { onlyRegistration: accountRows.length === 1 }
    )
  );

  if (!registration?.confirmation_code) {
    return NextResponse.json({ sent: false, reason: "shown_on_account" });
  }

  after(async () => {
    const { subject, html, text } = buildRegistrationCodeEmail({
      fullName: registration.full_name,
      confirmationCode: registration.confirmation_code,
      registrationType: "solo",
    });

    await sendEmail({ to: registration.email, subject, html, text });
  });

  return NextResponse.json({ ok: true });
}
