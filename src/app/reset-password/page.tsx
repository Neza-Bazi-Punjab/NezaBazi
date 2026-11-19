"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PasswordField from "@/components/PasswordField";
import PageTop from "@/components/redesign/PageTop";
import f from "@/components/redesign/forms.module.css";
import s from "@/components/redesign/shared.module.css";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // The user reaches this page via the recovery link, which /auth/confirm has
  // already exchanged for a session. Without one, there is nothing to reset.
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "missing">(
    "checking"
  );

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setSessionState(data.user ? "ready" : "missing");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/account");
      router.refresh();
    }, 1500);
  };

  return (
    <div className={`${s.page} ${f.forms}`}>
      <PageTop
        small
        title="Set a New Password"
        lead="Choose a new password for your account."
      />

      <section className={f.band}>
        <div className={s.wrap}>
          <div className={`${f.col} ${f.box}`}>
            {sessionState === "missing" ? (
              <div className={f.stack}>
                <h2 className={f.boxTitle}>Link Expired</h2>
                <div className={f.text}>
                  <p>This reset link is invalid or has expired. Please request a new one.</p>
                </div>
                <Link
                  href="/forgot-password"
                  className={`${s.btn} ${s.primary} ${f.block} ${f.primaryHover}`}
                >
                  Request a New Link
                </Link>
              </div>
            ) : done ? (
              <div className={f.stack}>
                <h2 className={f.boxTitle}>Password Updated</h2>
                <div className={f.text}>
                  <p>Your password has been changed. Taking you to your account…</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={f.form}>
                <div>
                  <PasswordField
                    label="New Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    disabled={sessionState === "checking"}
                  />
                  <p className={f.hint}>At least 8 characters.</p>
                </div>

                <PasswordField
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={sessionState === "checking"}
                />

                {error && <p className={f.err}>{error}</p>}

                <button
                  type="submit"
                  disabled={loading || sessionState !== "ready"}
                  className={`${s.btn} ${s.primary} ${f.block} ${f.primaryHover}`}
                >
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
