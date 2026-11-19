"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/LocationPicker";
import f from "@/components/redesign/forms.module.css";
import s from "@/components/redesign/shared.module.css";
import { syncAccountRegistrations } from "@/lib/sync-account-registrations";

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
    <form onSubmit={handleSubmit} className={f.form}>
      <div>
        <label htmlFor="profile-name">Full Name</label>
        <input
          id="profile-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
          className={f.input}
        />
      </div>

      <div className={f.row2}>
        <div>
          <label htmlFor="profile-age">Age</label>
          <input
            id="profile-age"
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            required
            min={1}
            className={f.input}
          />
        </div>

        <div>
          <label htmlFor="profile-phone">Phone Number</label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoComplete="tel"
            className={f.input}
          />
        </div>
      </div>

      <div>
        <span className={f.label}>Location</span>
        <div className={f.picker}>
          <LocationPicker value={location} onChange={setLocation} />
        </div>
      </div>

      {/* Shown, not editable. This address is the identity every entry is
          matched on, and it came verified from Google — changing it belongs on
          the account page, where the confirmation flow that protects it runs. */}
      <div>
        <label htmlFor="profile-email">Email</label>
        <input id="profile-email" type="email" value={email} readOnly className={`${f.input} ${f.locked}`} />
        <p className={f.hint}>
          From your Google account. You can change it later on your account page.
        </p>
      </div>

      {error && <p className={f.err}>{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className={`${s.btn} ${s.primary} ${f.block} ${f.primaryHover}`}
      >
        {saving ? "Saving..." : "Save and Continue"}
      </button>
    </form>
  );
}
