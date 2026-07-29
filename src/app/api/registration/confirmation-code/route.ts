// Emails the caller their own solo registration confirmation code.
//
// Solo registrations are inserted straight from the browser under RLS, so
// there is no server step in that flow to hang an email off. The form calls
// this route once the insert succeeds. It only ever reads and sends the
// caller's own code, so it cannot be used to discover anyone else's.
import { NextResponse, after } from "next/server";
import { buildRegistrationCodeEmail } from "@/lib/email/registration-code";
import { sendEmail } from "@/lib/email/resend";
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

  const { data: registration, error } = await supabase
    .from("solo_registrations")
    .select("full_name, email, confirmation_code")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!registration?.confirmation_code) {
    return NextResponse.json(
      { error: "No solo registration was found for this account." },
      { status: 404 }
    );
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
