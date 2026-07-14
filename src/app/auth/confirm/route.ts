// Handles the links Supabase emails for signup confirmation, email change,
// password recovery, and magic links. Supports both auth link styles so it
// works regardless of how the email templates are configured:
//   • token_hash + type  → verifyOtp (works cross-device; recommended)
//   • code               → exchangeCodeForSession (default templates, same browser)
// Either way a session is established via the SSR cookie helper, then we
// redirect to `next` (sanitized to an internal path).
import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getSafeRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { syncRegistrationProfileFromUser } from "@/lib/supabase/sync-registration-profile";

const allowedTypes: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = getSafeRedirect(searchParams.get("next"));

  const supabase = await createClient();
  let authenticated = false;

  if (tokenHash && type && allowedTypes.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    authenticated = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authenticated = !error;
  }

  if (authenticated) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        const syncResult = await syncRegistrationProfileFromUser(user);

        if ("error" in syncResult || syncResult.warnings.length > 0) {
          console.error("Registration sync after authentication completed with warnings.");
        }
      } catch {
        // Authentication has already succeeded, so a registration-sync outage
        // must not turn a valid confirmation or recovery link into an auth error.
        console.error("Registration sync after authentication failed.");
      }
    }

    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/auth/auth-code-error", request.url));
}
