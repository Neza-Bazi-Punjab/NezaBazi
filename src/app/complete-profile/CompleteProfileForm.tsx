"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/LocationPicker";
import { syncAccountRegistrations } from "@/lib/sync-account-registrations";

const inputClassName =
  "mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none";
const lockedInputClassName =
  "mt-2 w-full cursor-not-allowed rounded-lg border border-bronze/20 bg-parchment px-4 py-3 text-brown/70 focus:outline-none";
const labelClassName =
  "font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink";

export default function CompleteProfileForm({
  next,
  email,
  initialFullName,
  initialAge,
  initialLocation,
  initialPhone,
}: {
  next: string;
  email: string;
  initialFullName: string;
  initialAge: string;
  initialLocation: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [age, setAge] = useState(initialAge);
  const [location, setLocation] = useState(initialLocation);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* Mirrors the bounds the PATCH route and the registration forms enforce, so
     a rider is told what is wrong here rather than by a rejected save. */
  const validate = () => {
    if (fullName.trim() === "") {
      return "Full name is required.";
    }

    const ageNumber = Number(age.trim());

    if (!/^\d+$/.test(age.trim()) || !Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
      return "Please enter a valid age.";
    }

    if (location.trim() === "") {
      return "Please select your location (or use manual entry).";
    }

    if (phone.trim() === "") {
      return "Phone number is required.";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSaving(true);

    /* The same endpoint the account page saves through, so there is one place
       that writes a profile and syncs registrations to match. The email sent is
       the account's own, unchanged, so no address-confirmation email fires. */
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: fullName.trim(),
        age: age.trim(),
        location: location.trim(),
        phone: phone.trim(),
        email,
      }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setSaving(false);
      setError(result.error ?? "Unable to save your details. Please try again.");
      return;
    }

    /* The account is complete for the first time, so this is the first moment a
       sync can succeed. It attaches any team entry a leader already made under
       this address to the details just supplied. */
    await syncAccountRegistrations();

    router.push(next);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-6">
      <div>
        <label className={labelClassName}>Full Name</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className={inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Age</label>
        <input
          type="number"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          required
          min={1}
          className={inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Location</label>
        <div className="mt-2">
          <LocationPicker value={location} onChange={setLocation} />
        </div>
      </div>

      <div>
        <label className={labelClassName}>Phone Number</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className={inputClassName}
        />
      </div>

      {/* Shown, not editable. This address is the identity every entry is
          matched on, and it came verified from Google — changing it belongs on
          the account page, where the confirmation flow that protects it runs. */}
      <div>
        <label className={labelClassName}>Email</label>
        <input type="email" value={email} readOnly className={lockedInputClassName} />
        <p className="mt-2 text-sm text-brown/70">
          From your Google account. You can change it later on your account page.
        </p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save and Continue"}
      </button>
    </form>
  );
}
