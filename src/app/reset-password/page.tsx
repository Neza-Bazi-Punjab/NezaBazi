"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
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
    <>
      <PageHeader
        title="Set a New Password"
        intro="Choose a new password for your account."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          {sessionState === "missing" ? (
            <>
              <SectionHeading>Link Expired</SectionHeading>
              <div className="mt-10 space-y-6">
                <p className="leading-7 text-brown/85">
                  This reset link is invalid or has expired. Please request a new one.
                </p>
                <a
                  href="/forgot-password"
                  className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
                >
                  Request a New Link
                </a>
              </div>
            </>
          ) : done ? (
            <>
              <SectionHeading>Password Updated</SectionHeading>
              <p className="mt-10 leading-7 text-brown/85">
                Your password has been changed. Taking you to your account…
              </p>
            </>
          ) : (
            <>
              <SectionHeading>New Password</SectionHeading>
              <form onSubmit={handleSubmit} className="mt-10 space-y-6">
                <div>
                  <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={sessionState === "checking"}
                    className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={sessionState === "checking"}
                    className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
                  />
                </div>

                {error && <p className="text-sm text-red-700">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || sessionState !== "ready"}
                  className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                >
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </>
  );
}
