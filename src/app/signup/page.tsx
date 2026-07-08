"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/login?registered=true");
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

          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
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
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
              />
            </div>

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