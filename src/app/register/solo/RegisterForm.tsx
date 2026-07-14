// Solo registration form: prefilled from the account (locked for regular
// players), autosaved to registration_drafts while typing, submitted straight
// to solo_registrations under RLS.
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/LocationPicker";
import {
  deleteRegistrationDraft,
  useRegistrationDraft,
  type SoloDraftData,
} from "@/lib/registration-drafts";
import { createClient } from "@/lib/supabase/client";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";

type InitialValues = {
  full_name?: string | null;
  age?: number | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  years_experience?: number | null;
  horse_age?: number | null;
  horse_breed?: string | null;
};

const numberToInputValue = (value?: number | null) => (value == null ? "" : String(value));

const inputClassName =
  "mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none";
const lockedInputClassName =
  "mt-2 w-full cursor-not-allowed rounded-lg border border-bronze/20 bg-parchment px-4 py-3 text-brown/70 focus:outline-none";

const draftStatusText = {
  idle: "",
  saving: "Saving draft…",
  saved: "Draft saved ✓",
  error: "Draft could not be saved — check your connection.",
} as const;

export default function RegisterForm({
  initialValues,
  lockProfileFields = false,
  initialDraft,
}: {
  initialValues?: InitialValues;
  lockProfileFields?: boolean;
  initialDraft?: SoloDraftData | null;
}) {
  const router = useRouter();

  /* Locked profile fields always follow the account; unlocked fields prefer
     the saved draft so returning users resume where they stopped. */
  const restore = (
    locked: boolean,
    accountValue: string,
    draftValue: string | undefined
  ) => (locked ? accountValue : draftValue ?? accountValue);

  const [fullName, setFullName] = useState(() =>
    restore(lockProfileFields, initialValues?.full_name ?? "", initialDraft?.fullName)
  );
  const [age, setAge] = useState(() =>
    restore(lockProfileFields, numberToInputValue(initialValues?.age), initialDraft?.age)
  );
  const [location, setLocation] = useState(() =>
    restore(lockProfileFields, initialValues?.location ?? "", initialDraft?.location)
  );
  const [phone, setPhone] = useState(() =>
    restore(lockProfileFields, initialValues?.phone ?? "", initialDraft?.phone)
  );
  const [email, setEmail] = useState(() =>
    restore(lockProfileFields, initialValues?.email ?? "", initialDraft?.email)
  );
  const [yearsExperience, setYearsExperience] = useState(
    () =>
      initialDraft?.yearsExperience ??
      numberToInputValue(initialValues?.years_experience)
  );
  const [horseAge, setHorseAge] = useState(
    () => initialDraft?.horseAge ?? numberToInputValue(initialValues?.horse_age)
  );
  const [horseBreed, setHorseBreed] = useState(
    () => initialDraft?.horseBreed ?? (initialValues?.horse_breed ?? "")
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const draftData = useMemo<SoloDraftData>(
    () => ({
      fullName,
      age,
      location,
      phone,
      email,
      yearsExperience,
      horseAge,
      horseBreed,
    }),
    [fullName, age, location, phone, email, yearsExperience, horseAge, horseBreed]
  );
  const { status: draftStatus, flush: saveDraftNow } = useRegistrationDraft(
    "solo",
    draftData
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (location.trim() === "") {
      setError("Please select your location (or use manual entry).");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to register.");
      setLoading(false);
      return;
    }

    if (!hasConfirmedEmail(user)) {
      setError("Confirm your email address before registering.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("solo_registrations").insert({
      profile_id: user.id,
      full_name: fullName,
      age: Number(age),
      location: location,
      phone: phone,
      email: email,
      years_experience: Number(yearsExperience),
      horse_age: Number(horseAge),
      horse_breed: horseBreed,
    });

    if (error) {
      setLoading(false);

      if (error.code === "23505") {
        setError("You've already registered, or this email/phone is already in use.");
      } else {
        setError(error.message);
      }

      return;
    }

    await deleteRegistrationDraft("solo");
    setLoading(false);
    router.push("/register/solo/success");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-6">
      <div>
        <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          Full Name
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
        />
      </div>

      <div>
        <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          Age
        </label>
        <input
          type="number"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          required
          min={1}
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
        />
      </div>

      <div>
        <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          Location
        </label>
        {lockProfileFields ? (
          <input
            type="text"
            value={location}
            readOnly
            required
            className={lockedInputClassName}
          />
        ) : (
          <div className="mt-2">
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        )}
      </div>

      <div>
        <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          Phone Number
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
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
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
        />
      </div>

      <div>
        <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          Years of Neza Bazi Experience
        </label>
        <input
          type="number"
          value={yearsExperience}
          onChange={(e) => setYearsExperience(e.target.value)}
          required
          min={0}
          className={inputClassName}
        />
      </div>

      <div>
        <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          Horse Age
        </label>
        <input
          type="number"
          value={horseAge}
          onChange={(e) => setHorseAge(e.target.value)}
          required
          min={0}
          className={inputClassName}
        />
      </div>

      <div>
        <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          Horse Breed
        </label>
        <input
          type="text"
          value={horseBreed}
          onChange={(e) => setHorseBreed(e.target.value)}
          required
          className={inputClassName}
        />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={saveDraftNow}
          className="rounded-lg border border-bronze/20 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
        >
          Save Draft
        </button>
        <p className="text-xs text-brown/70" role="status">
          {draftStatusText[draftStatus]}
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
      >
        {loading ? "Submitting..." : "Submit Registration"}
      </button>
    </form>
  );
}
