// Solo registration form: prefilled from the account (locked for regular
// players), autosaved to registration_drafts while typing, submitted straight
// to solo_registrations under RLS.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeadshotUpload from "@/components/HeadshotUpload";
import LocationPicker from "@/components/LocationPicker";
import {
  deleteRegistrationDraft,
  useRegistrationDraft,
  type SoloDraftData,
} from "@/lib/registration-drafts";
import { isValidEmail } from "@/lib/email-address";
import { createClient } from "@/lib/supabase/client";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";

type InitialValues = {
  full_name?: string | null;
  age?: number | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  years_experience?: number | null;
  horse_name?: string | null;
  horse_age?: number | null;
  horse_breed?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
};

const numberToInputValue = (value?: number | null) => (value == null ? "" : String(value));

const parseBoundedInt = (
  value: string,
  { min, max }: { min: number; max: number }
) => {
  const trimmed = (value ?? "").trim();

  if (trimmed === "" || !/^-?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
};

const inputClassName =
  "mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none";
const lockedInputClassName =
  "mt-2 w-full cursor-not-allowed rounded-lg border border-bronze/20 bg-parchment px-4 py-3 text-brown/70 focus:outline-none";
const labelClassName =
  "font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink";

const stepLabels = ["Rider Details", "Horse Details", "Emergency Contact", "Review"];
const REVIEW_STEP = 3;

const clampStep = (value: number | undefined) => {
  if (value == null || !Number.isInteger(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), REVIEW_STEP);
};

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
  initialHeadshotPath = null,
}: {
  initialValues?: InitialValues;
  lockProfileFields?: boolean;
  initialDraft?: SoloDraftData | null;
  /* The headshot lives on the account rather than the registration, so it is
     not part of the autosaved draft — it is already uploaded and recorded in
     Auth metadata by the time the form is submitted. */
  initialHeadshotPath?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(() => clampStep(initialDraft?.step));

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
  const [horseName, setHorseName] = useState(
    () => initialDraft?.horseName ?? (initialValues?.horse_name ?? "")
  );
  const [horseAge, setHorseAge] = useState(
    () => initialDraft?.horseAge ?? numberToInputValue(initialValues?.horse_age)
  );
  const [horseBreed, setHorseBreed] = useState(
    () => initialDraft?.horseBreed ?? (initialValues?.horse_breed ?? "")
  );
  const [emergencyContactName, setEmergencyContactName] = useState(
    () =>
      initialDraft?.emergencyContactName ??
      (initialValues?.emergency_contact_name ?? "")
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    () =>
      initialDraft?.emergencyContactPhone ??
      (initialValues?.emergency_contact_phone ?? "")
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const draftData = useMemo<SoloDraftData>(
    () => ({
      step,
      fullName,
      age,
      location,
      phone,
      email,
      yearsExperience,
      horseName,
      horseAge,
      horseBreed,
      emergencyContactName,
      emergencyContactPhone,
    }),
    [
      step,
      fullName,
      age,
      location,
      phone,
      email,
      yearsExperience,
      horseName,
      horseAge,
      horseBreed,
      emergencyContactName,
      emergencyContactPhone,
    ]
  );
  const { status: draftStatus, flush: saveDraftNow } = useRegistrationDraft(
    "solo",
    draftData
  );

  useEffect(() => {
    saveDraftNow();
  }, [step, saveDraftNow]);

  const getRiderDetailsError = () => {
    if (fullName.trim() === "") {
      return "Full name is required.";
    }

    if (parseBoundedInt(age, { min: 1, max: 120 }) === null) {
      return "Please enter a valid age.";
    }

    if (location.trim() === "") {
      return "Please select your location (or use manual entry).";
    }

    if (phone.trim() === "") {
      return "Phone number is required.";
    }

    if (!isValidEmail(email)) {
      return "Please enter a valid email address.";
    }

    if (parseBoundedInt(yearsExperience, { min: 0, max: 100 }) === null) {
      return "Please enter valid years of experience.";
    }

    return null;
  };

  const getHorseDetailsError = () => {
    if (horseName.trim() === "") {
      return "Horse name is required.";
    }

    if (parseBoundedInt(horseAge, { min: 0, max: 60 }) === null) {
      return "Please enter a valid horse age.";
    }

    if (horseBreed.trim() === "") {
      return "Horse breed is required.";
    }

    return null;
  };

  const getEmergencyContactError = () => {
    if (emergencyContactName.trim() === "") {
      return "Emergency contact name is required.";
    }

    if (emergencyContactPhone.trim() === "") {
      return "Emergency contact phone is required.";
    }

    return null;
  };

  const stepErrors = [
    getRiderDetailsError(),
    getHorseDetailsError(),
    getEmergencyContactError(),
  ];
  const allStepsValid = stepErrors.every((stepError) => stepError === null);
  const progressPercent = (step / REVIEW_STEP) * 100;

  const goToStep = (target: number) => {
    setError(null);
    setStep(clampStep(target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    const currentStepError = stepErrors[step];

    if (currentStepError) {
      setError(currentStepError);
      return;
    }

    goToStep(step + 1);
  };

  const handleSubmit = async () => {
    setError(null);

    const firstStepErrorIndex = stepErrors.findIndex((stepError) => stepError !== null);

    if (firstStepErrorIndex !== -1) {
      setStep(firstStepErrorIndex);
      setError(stepErrors[firstStepErrorIndex]);
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
      horse_name: horseName,
      horse_age: Number(horseAge),
      horse_breed: horseBreed,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
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

    // Best-effort: the success page and /account both show the code, so a
    // failed email must not block the rider from reaching their confirmation.
    try {
      await fetch("/api/registration/confirmation-code", { method: "POST" });
    } catch {
      // Ignored on purpose — the registration itself already succeeded.
    }

    setLoading(false);
    router.push("/register/solo/success");
  };

  const reviewRow = (label: string, value: string) => (
    <div>
      <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
        {label}
      </p>
      <p className="mt-1 text-brown/85">{value || "—"}</p>
    </div>
  );

  const renderRiderDetails = () => (
    <div className="space-y-6">
      <div>
        <label className={labelClassName}>Full Name</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Age</label>
        <input
          type="number"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          min={1}
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Location</label>
        {lockProfileFields ? (
          <input
            type="text"
            value={location}
            readOnly
            className={lockedInputClassName}
          />
        ) : (
          <div className="mt-2">
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        )}
      </div>

      <div>
        <label className={labelClassName}>Phone Number</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={lockProfileFields}
          className={lockProfileFields ? lockedInputClassName : inputClassName}
        />
      </div>

      <div className="rounded-lg border border-bronze/25 bg-sand p-5">
        <HeadshotUpload
          initialPath={initialHeadshotPath}
          label="Headshot (optional)"
        />
      </div>

      <div>
        <label className={labelClassName}>Years of Neza Bazi Experience</label>
        <input
          type="number"
          value={yearsExperience}
          onChange={(e) => setYearsExperience(e.target.value)}
          min={0}
          className={inputClassName}
        />
      </div>
    </div>
  );

  const renderHorseDetails = () => (
    <div className="space-y-6">
      <div>
        <label className={labelClassName}>Horse Name</label>
        <input
          type="text"
          value={horseName}
          onChange={(e) => setHorseName(e.target.value)}
          className={inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Horse Age</label>
        <input
          type="number"
          value={horseAge}
          onChange={(e) => setHorseAge(e.target.value)}
          min={0}
          className={inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Horse Breed</label>
        <input
          type="text"
          value={horseBreed}
          onChange={(e) => setHorseBreed(e.target.value)}
          className={inputClassName}
        />
      </div>
    </div>
  );

  const renderEmergencyContact = () => (
    <div className="space-y-6">
      <div>
        <label className={labelClassName}>Emergency Contact Name</label>
        <input
          type="text"
          value={emergencyContactName}
          onChange={(e) => setEmergencyContactName(e.target.value)}
          className={inputClassName}
        />
      </div>

      <div>
        <label className={labelClassName}>Emergency Contact Phone</label>
        <input
          type="tel"
          value={emergencyContactPhone}
          onChange={(e) => setEmergencyContactPhone(e.target.value)}
          className={inputClassName}
        />
      </div>
    </div>
  );

  return (
    <div className="mt-10">
      <div>
        <div className="flex items-center justify-between gap-1">
          {stepLabels.map((label, index) => {
            const isDone = index < step;
            const isCurrent = index === step;
            const canJump = index < step;

            return (
              <button
                key={label}
                type="button"
                onClick={() => canJump && goToStep(index)}
                disabled={!canJump}
                className={`flex flex-1 flex-col items-center gap-1.5 ${
                  canJump ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full font-display text-xs font-bold ${
                    isDone || isCurrent
                      ? "bg-bronze-deep text-cream"
                      : "border border-bronze/30 bg-cream text-brown/60"
                  }`}
                >
                  {isDone ? "✓" : index + 1}
                </span>
                <span
                  className={`hidden font-display text-[10px] font-semibold uppercase tracking-[0.08em] sm:block ${
                    isCurrent ? "text-bronze-dark" : "text-brown/60"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bronze/15">
          <div
            className="h-full rounded-full bg-bronze-deep transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-10">
        {step < REVIEW_STEP && (
          <div>
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
              {stepLabels[step]}
            </h3>
            <div className="mt-6">
              {step === 0 && renderRiderDetails()}
              {step === 1 && renderHorseDetails()}
              {step === 2 && renderEmergencyContact()}
            </div>
          </div>
        )}

        {step === REVIEW_STEP && (
          <div className="space-y-6">
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
              Review &amp; Submit
            </h3>

            <div className="rounded-lg border border-bronze/20 bg-sand p-5">
              <div className="flex items-center justify-between gap-4">
                <h4 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-bronze-dark">
                  Rider Details
                </h4>
                <button
                  type="button"
                  onClick={() => goToStep(0)}
                  className="rounded-lg border border-bronze/20 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                >
                  Edit
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {reviewRow("Full Name", fullName)}
                {reviewRow("Age", age)}
                {reviewRow("Location", location)}
                {reviewRow("Phone", phone)}
                {reviewRow("Email", email)}
                {reviewRow("Experience", yearsExperience)}
              </div>
              {stepErrors[0] && <p className="mt-3 text-sm text-red-700">{stepErrors[0]}</p>}
            </div>

            <div className="rounded-lg border border-bronze/20 bg-sand p-5">
              <div className="flex items-center justify-between gap-4">
                <h4 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-bronze-dark">
                  Horse Details
                </h4>
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="rounded-lg border border-bronze/20 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                >
                  Edit
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {reviewRow("Horse Name", horseName)}
                {reviewRow("Horse Age", horseAge)}
                {reviewRow("Horse Breed", horseBreed)}
              </div>
              {stepErrors[1] && <p className="mt-3 text-sm text-red-700">{stepErrors[1]}</p>}
            </div>

            <div className="rounded-lg border border-bronze/20 bg-sand p-5">
              <div className="flex items-center justify-between gap-4">
                <h4 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-bronze-dark">
                  Emergency Contact
                </h4>
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="rounded-lg border border-bronze/20 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                >
                  Edit
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {reviewRow("Emergency Contact Name", emergencyContactName)}
                {reviewRow("Emergency Contact Phone", emergencyContactPhone)}
              </div>
              {stepErrors[2] && <p className="mt-3 text-sm text-red-700">{stepErrors[2]}</p>}
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !allStepsValid}
              className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
            >
              {loading ? "Submitting..." : "Submit Registration"}
            </button>

            {!allStepsValid && (
              <p className="text-center text-sm text-brown/70">
                Complete every section above to submit.
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-red-700">{error}</p>}

      <div className="mt-10 space-y-4">
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

        <div className="flex gap-4">
          {step > 0 && (
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              className="flex-1 rounded-lg border border-bronze/20 px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-bronze-dark transition-colors hover:border-bronze/40"
            >
              Back
            </button>
          )}
          {step < REVIEW_STEP && (
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
            >
              {step === REVIEW_STEP - 1 ? "Review" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
