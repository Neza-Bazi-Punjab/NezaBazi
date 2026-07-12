"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export default function RegisterForm({
  initialValues,
  lockProfileFields = false,
}: {
  initialValues?: InitialValues;
  lockProfileFields?: boolean;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialValues?.full_name ?? "");
  const [age, setAge] = useState(numberToInputValue(initialValues?.age));
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    numberToInputValue(initialValues?.years_experience)
  );
  const [horseAge, setHorseAge] = useState(numberToInputValue(initialValues?.horse_age));
  const [horseBreed, setHorseBreed] = useState(initialValues?.horse_breed ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to register.");
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

    setLoading(false);

    if (error) {
      if (error.code === "23505") {
        setError("You've already registered, or this email/phone is already in use.");
      } else {
        setError(error.message);
      }

      return;
    }

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
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
        />
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
