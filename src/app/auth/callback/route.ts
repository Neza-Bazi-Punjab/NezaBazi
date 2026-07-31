// Where Google returns a rider after they approve the sign-in.
//
// Deliberately separate from /auth/confirm. That route also exchanges a `code`,
// but it carries the signup flow's rule: when a code arrives on an account that
// still holds a signup_redirect, it treats the visit as a first confirmation and
// signs the user straight back out to /login. That is right for a confirmation
// link and wrong for OAuth, where the session that just opened is the whole
// point. Keeping the two apart means neither has to know about the other.
//
// On account collision: Supabase links an OAuth identity onto the existing user
// whenever the email matches, so signing in with Google at an address that
// already has a password account resolves to that same user id rather than a
// second account. Registrations key off that id (solo) or the email (team), so
// both keep pointing at the rider they always did.
import { type NextRequest, NextResponse } from "next/server";
import { isAccountProfileComplete } from "@/lib/account-profile";
import { getSafeRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { syncRegistrationProfileFromUser } from "@/lib/supabase/sync-registration-profile";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeRedirect(searchParams.get("next"));

  // A rider who backs out of Google's consent screen comes back with an error
  // rather than without a code, so both have to be treated as a failed sign-in.
  if (searchParams.get("error") || !code) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", request.url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A brand-new Google account has no age, location or phone: the provider has
  // none to give. Every registration needs all three, so the rider is sent to
  // fill them in before going anywhere else. Returning Google users pass
  // straight through, as do all password accounts, which collected the same
  // fields at signup.
  if (user && !isAccountProfileComplete(user.user_metadata)) {
    const completeProfileUrl = new URL("/complete-profile", request.url);
    completeProfileUrl.searchParams.set("next", next);
    return NextResponse.redirect(completeProfileUrl);
  }

  if (user) {
    try {
      await syncRegistrationProfileFromUser(user);
    } catch {
      // Sign-in has already succeeded. A registration-sync outage must not turn
      // a valid Google session into an auth error.
      console.error("Registration sync after Google sign-in failed.");
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
