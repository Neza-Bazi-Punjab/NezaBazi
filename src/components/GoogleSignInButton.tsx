"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Google's mark, inlined. Their brand terms require the four-colour "G" drawn
   as supplied, and inlining keeps it off the network — riders open this page on
   phone connections where one more request is a visible delay. */
const GoogleMark = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true" className="h-5 w-5 shrink-0">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
    />
    <path
      fill="#FBBC05"
      d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
    />
  </svg>
);

export default function GoogleSignInButton({
  redirectTo,
  label = "Continue with Google",
}: {
  /* Where the rider was heading before they were asked to sign in. Carried
     through Google and back out of /auth/callback. */
  redirectTo: string;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setError(null);
    setLoading(true);

    const supabase = createClient();

    /* The live origin rather than site.url, so this works unchanged on
       localhost and on a preview deployment. Both must be in Supabase's
       redirect allowlist. Email links still use site.url — an absolute
       production URL is the only thing that makes sense in an inbox. */
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", redirectTo);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        /* Riders share phones, and plenty hold more than one Google account.
           Always asking which to use stops someone signing in under a
           relative's address — here that would quietly attach them to the
           wrong entry, because the email is the identity. */
        queryParams: { prompt: "select_account" },
      },
    });

    if (oauthError) {
      setLoading(false);
      setError("Google sign-in is unavailable right now. Use your email and password below.");
      return;
    }

    // On success the browser has already left for Google, so there is no state
    // worth resetting — the button stays disabled until the page unloads.
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-bronze/30 bg-sand px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:border-bronze hover:bg-parchment disabled:opacity-60"
      >
        <GoogleMark />
        {loading ? "Redirecting to Google..." : label}
      </button>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
