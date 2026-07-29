"use client";

/* Resend the signup confirmation email.
   Supabase deliberately treats a repeat signup as a success without sending
   anything, so someone who signs up twice — or whose first email went to spam
   — is left waiting for a message that will never arrive. This is the way
   out of that state.

   The result message is intentionally the same whether or not an account
   exists: saying "no account with that email" would turn this box into a way
   to test which addresses are registered. */
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";

/* Written by the signup form so this box can prefill. Kept in sessionStorage
   rather than the URL — an email address in a query string ends up in browser
   history, server logs and anything the link is pasted into. */
export const PENDING_EMAIL_KEY = "nbp:pending-confirmation-email";

const COOLDOWN_SECONDS = 60;

export default function ResendConfirmation() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const emailInput = useRef<HTMLInputElement | null>(null);

  /* The field is uncontrolled and prefilled by writing to the DOM node rather
     than through state: sessionStorage does not exist during the server
     render, so seeding React state from it would either trip the
     set-state-in-effect rule or produce a hydration mismatch on `value`. */
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PENDING_EMAIL_KEY);
      if (stored && emailInput.current && emailInput.current.value === "") {
        emailInput.current.value = stored;
      }
    } catch {
      // Private browsing can block sessionStorage; the field just starts empty.
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    timer.current = setInterval(() => {
      setCooldown((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);

    return () => {
      if (timer.current) {
        clearInterval(timer.current);
      }
    };
  }, [cooldown]);

  const resend = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = (emailInput.current?.value ?? "").trim();

    if (trimmed === "") {
      setStatus("error");
      setMessage("Enter the email address you signed up with.");
      return;
    }

    setStatus("sending");
    setMessage(null);

    const supabase = createClient();
    const confirmationUrl = new URL("/auth/confirm", site.url);
    confirmationUrl.searchParams.set("flow", "signup");

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: trimmed,
      options: { emailRedirectTo: confirmationUrl.toString() },
    });

    // Supabase rate-limits confirmation email, so surface that plainly instead
    // of leaving someone pressing a button that quietly does nothing.
    if (error && /rate|limit|seconds/i.test(error.message)) {
      setStatus("error");
      setMessage(
        "That was requested very recently. Wait a minute and try again."
      );
      setCooldown(COOLDOWN_SECONDS);
      return;
    }

    if (error && !/already confirmed|not found/i.test(error.message)) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage(
      `If an account is waiting to be confirmed for ${trimmed}, a new link is on its way. It can take a couple of minutes — check your spam folder too.`
    );
    setCooldown(COOLDOWN_SECONDS);
  };

  const disabled = status === "sending" || cooldown > 0;

  return (
    <form onSubmit={resend} className="space-y-3">
      <label
        htmlFor="resend-email"
        className="block font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink"
      >
        Didn&apos;t get the email?
      </label>

      <input
        id="resend-email"
        ref={emailInput}
        type="email"
        defaultValue=""
        placeholder="you@example.com"
        autoComplete="email"
        className="w-full rounded-lg border border-bronze/40 bg-cream px-4 py-3 text-ink outline-none focus:border-bronze"
      />

      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-lg border border-bronze/40 px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown transition-colors hover:border-bronze hover:text-bronze disabled:opacity-50"
      >
        {status === "sending"
          ? "Sending…"
          : cooldown > 0
            ? `Resend in ${cooldown}s`
            : "Resend Confirmation Email"}
      </button>

      {message && (
        <p
          className={`rounded-lg border-l-4 px-4 py-3 text-sm leading-6 ${
            status === "error"
              ? "border-red-700 bg-red-50 text-red-900"
              : "border-green-700 bg-green-50 text-green-900"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
