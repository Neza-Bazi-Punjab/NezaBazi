"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    // The recovery email link lands on /auth/confirm, which verifies the token
    // and forwards to /reset-password where the new password is set.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Always show the same confirmation, whether or not the email exists, so
    // the page can't be used to probe which addresses have accounts.
    setSent(true);
  };

  return (
    <>
      <PageHeader
        title="Reset Password"
        intro="Enter your email and we'll send you a link to set a new password."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          {sent ? (
            <>
              <SectionHeading>Check Your Inbox</SectionHeading>
              <div className="mt-10 space-y-6">
                <p className="leading-7 text-brown/85">
                  If an account exists for <span className="font-semibold">{email}</span>,
                  a password reset link is on its way. Click it to choose a new
                  password.
                </p>
                <a
                  href="/login"
                  className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
                >
                  Back to Login
                </a>
              </div>
            </>
          ) : (
            <>
              <SectionHeading>Forgot Password</SectionHeading>
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

                {error && <p className="text-sm text-red-700">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>

                <p className="text-center text-sm text-brown/80">
                  Remembered it?{" "}
                  <a href="/login" className="font-semibold text-bronze-deep underline">
                    Back to login
                  </a>
                </p>
              </form>
            </>
          )}
        </div>
      </section>
    </>
  );
}
