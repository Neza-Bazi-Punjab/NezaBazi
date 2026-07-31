"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import LocationPicker from "@/components/LocationPicker";
import PasswordField from "@/components/PasswordField";
import PageHeader from "@/components/PageHeader";
import ResendConfirmation, {
  PENDING_EMAIL_KEY,
} from "@/components/ResendConfirmation";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/client";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";
import { syncAccountRegistrations } from "@/lib/sync-account-registrations";
import { getPostSignupRedirect } from "@/lib/safe-redirect";
import { site } from "@/lib/site";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getPostSignupRedirect(searchParams.get("redirect"));
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExistingAccount(false);

    // The picker only emits a value once a suggestion is chosen (or manual
    // entry is used), so an empty string means the location isn't confirmed.
    if (location.trim() === "") {
      setError("Please select your location (or use manual entry).");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    const confirmationUrl = new URL("/auth/confirm", site.url);
    confirmationUrl.searchParams.set("flow", "signup");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Where the confirmation email link lands. The email template appends
        // token_hash/type; this base must be in Supabase's redirect allowlist.
        emailRedirectTo: confirmationUrl.toString(),
        data: {
          full_name: fullName,
          age: Number(age),
          location,
          phone,
          signup_redirect: redirectTo,
        },
      },
    });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    /* Supabase does not report "this email is taken". To stop an attacker
       harvesting which addresses have accounts, it returns a success carrying
       a decoy user — one with an empty `identities` array. Riders read that
       as "my account is made" and then wait for a link, so this site says
       plainly that the address is taken. The trade is deliberate: someone can
       now test whether an address is registered here.

       What it still cannot tell us is whether that account was ever
       confirmed, which is the same obfuscation. So the panel below covers
       both: log in if confirmed, request a fresh link if not. It must never
       claim no email was sent — a repeat signup on an *unconfirmed* account
       can itself re-issue the confirmation. */
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setLoading(false);

      // Seed the resend box below before it mounts, so it prefills with the
      // address just typed rather than asking for it a second time.
      try {
        sessionStorage.setItem(PENDING_EMAIL_KEY, email.trim());
      } catch {
        // Private browsing can block sessionStorage; the field starts empty.
      }

      setExistingAccount(true);
      return;
    }

    // With email confirmation enabled there is no session yet — the user must
    // click the emailed link first. Even if a session is returned, sync only
    // when Supabase reports that the email has been confirmed. Normally the
    // confirmation callback performs this sync after verification.
    if (data.session && hasConfirmedEmail(data.user)) {
      await syncAccountRegistrations();
    }

    setLoading(false);

    // Hand the address to the success page's resend box without putting it in
    // the URL, so someone whose confirmation email does not arrive can ask for
    // another without retyping it.
    try {
      sessionStorage.setItem(PENDING_EMAIL_KEY, email.trim());
    } catch {
      // Private browsing can block sessionStorage; resend still works by hand.
    }

    router.push(`/signup/success?redirect=${encodeURIComponent(redirectTo)}`);
  };

  return (
    <>
      <PageHeader
        title="Create Your Account"
        intro="Sign up to manage your profile and register for the Neza Bazi Punjab Championship 2026."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <SectionHeading>Sign Up</SectionHeading>

          {/* Google skips the form and the confirmation email entirely: the
              address arrives already verified. It cannot supply age, location
              or phone, so the registration form asks for those instead. */}
          <div className="mt-10">
            <GoogleSignInButton redirectTo={redirectTo} label="Sign up with Google" />
          </div>

          <div className="mt-8 flex items-center gap-4">
            <span className="h-px flex-1 bg-bronze/25" />
            <span className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-brown/70">
              or
            </span>
            <span className="h-px flex-1 bg-bronze/25" />
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                Full Name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
              />
            </div>

            <div>
              <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
              />
            </div>

            <div>
              <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                Age
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
                min={1}
                className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
              />
            </div>

            <div>
              <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                Location
              </label>
              <div className="mt-2">
                <LocationPicker value={location} onChange={setLocation} />
              </div>
            </div>

            <div>
              <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
              />
            </div>

            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />

            {existingAccount && (
              <div className="rounded-lg border border-bronze/30 bg-parchment px-4 py-3 text-sm text-brown">
                <p className="font-semibold text-ink">
                  An account already exists with this email.
                </p>
                <p className="mt-1 leading-6">
                  Log in with this address instead — or reset your password if
                  you have forgotten it.
                </p>
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  <a
                    href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
                    className="font-semibold text-bronze-deep underline"
                  >
                    Log in
                  </a>
                  <a
                    href="/forgot-password"
                    className="font-semibold text-bronze-deep underline"
                  >
                    Reset password
                  </a>
                </p>

                {/* The other half of the same ambiguity: if that account was
                    never confirmed, logging in will be refused and a fresh
                    link is what they actually need. Offered here so this
                    panel is not a dead end for them. */}
                <div className="mt-4 border-t border-bronze/20 pt-4">
                  <p className="mb-3 leading-6">
                    Never received the confirmation email for it?
                  </p>
                  <ResendConfirmation />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>

            <p className="text-center text-sm text-brown/80">
              Already have an account?{" "}
              <a href="/login" className="font-semibold text-bronze-deep underline">
                Log in
              </a>
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
