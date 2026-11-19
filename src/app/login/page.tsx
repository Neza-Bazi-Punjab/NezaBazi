"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import ResendConfirmation from "@/components/ResendConfirmation";
import PageTop from "@/components/redesign/PageTop";
import f from "@/components/redesign/forms.module.css";
import s from "@/components/redesign/shared.module.css";
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
    <div className={`${s.page} ${f.forms}`}>
      <PageTop
        small
        title="Player Login"
        lead="Sign in to manage your profile, horses, and event entries."
      />

      <section className={f.band}>
        <div className={s.wrap}>
          <div className={`${f.col} ${f.box}`}>
            {/* Google first: a rider who signed up that way has no password to
                reach for, and one they signed up with an email still recognises
                the form directly below. */}
            <div className={f.google}>
              <GoogleSignInButton redirectTo={redirectTo} />
            </div>

            <div className={f.or}>or</div>

            <form onSubmit={handleSubmit} className={f.form}>
              <div>
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={f.input}
                />
              </div>

              <PasswordField
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

              <div className={f.right}>
                <Link href="/forgot-password" className={f.link}>
                  Forgot password?
                </Link>
              </div>

              {error && <p className={f.err}>{error}</p>}

              {needsConfirmation && (
                <div className={f.panel}>
                  <ResendConfirmation />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`${s.btn} ${s.primary} ${f.block} ${f.primaryHover}`}
              >
                {loading ? "Logging in..." : "Log In"}
              </button>

              <p className={f.small}>
                New here?{" "}
                <Link href={signupHref} className={f.link}>
                  Create an account
                </Link>
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
