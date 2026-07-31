"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ResendConfirmation from "@/components/ResendConfirmation";
import SectionHeading from "@/components/SectionHeading";
import { getSafeRedirect } from "@/lib/safe-redirect";
import PasswordField from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";
import { syncAccountRegistrations } from "@/lib/sync-account-registrations";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirect(searchParams.get("redirect"));
  const signupHref = `/signup?redirect=${encodeURIComponent(redirectTo)}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      // Supabase blocks sign-in until the email is confirmed; point the user
      // back to their inbox instead of showing the raw error, and offer a
      // resend — the original may have gone to spam or never been sent at all
      // if they signed up twice.
      const unconfirmed = error.message.toLowerCase().includes("not confirmed");
      setNeedsConfirmation(unconfirmed);
      setError(
        unconfirmed
          ? "Please confirm your email first — check your inbox for the confirmation link."
          : error.message
      );
      return;
    }

    if (!hasConfirmedEmail(data.user)) {
      await supabase.auth.signOut();
      setLoading(false);
      setNeedsConfirmation(true);
      setError("Please confirm your email first - check your inbox for the confirmation link.");
      return;
    }

    await syncAccountRegistrations();
    setLoading(false);

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <>
      <PageHeader
        title="Player Login"
        intro="Sign in to manage your profile, horses, and event entries."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <SectionHeading>Sign In</SectionHeading>

          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
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

            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="text-right">
              <a
                href="/forgot-password"
                className="text-sm font-semibold text-bronze-deep underline"
              >
                Forgot password?
              </a>
            </div>

            {error && <p className="text-sm text-red-700">{error}</p>}

            {needsConfirmation && (
              <div className="rounded-lg border border-bronze/25 bg-sand p-5">
                <ResendConfirmation />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Log In"}
            </button>

            <p className="text-center text-sm text-brown/80">
              New here?{" "}
              <a href={signupHref} className="font-semibold text-bronze-deep underline">
                Create an account
              </a>
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
