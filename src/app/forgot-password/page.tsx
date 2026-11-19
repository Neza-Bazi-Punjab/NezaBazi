"use client";

import { useState } from "react";
import Link from "next/link";
import PageTop from "@/components/redesign/PageTop";
import f from "@/components/redesign/forms.module.css";
import s from "@/components/redesign/shared.module.css";
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
    <div className={`${s.page} ${f.forms}`}>
      <PageTop
        small
        title="Reset Password"
        lead="Enter your email and we'll send you a link to set a new password."
      />

      <section className={f.band}>
        <div className={s.wrap}>
          <div className={`${f.col} ${f.box}`}>
            {sent ? (
              <div className={f.stack}>
                <h2 className={f.boxTitle}>Check Your Inbox</h2>
                <div className={f.text}>
                  <p>
                    If an account exists for <b>{email}</b>, a password reset link
                    is on its way. Click it to choose a new password.
                  </p>
                </div>
                <Link href="/login" className={`${s.btn} ${s.primary} ${f.block} ${f.primaryHover}`}>
                  Back to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={f.form}>
                <div>
                  <label htmlFor="forgot-email">Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className={f.input}
                  />
                </div>

                {error && <p className={f.err}>{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className={`${s.btn} ${s.primary} ${f.block} ${f.primaryHover}`}
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>

                <p className={f.small}>
                  Remembered it?{" "}
                  <Link href="/login" className={f.link}>
                    Back to login
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
