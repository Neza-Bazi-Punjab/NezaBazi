// Team registration wizard: Team Name → Rider 1 (leader) → Riders 2–4 →
// Review & Submit, with a progress bar and draft autosave after every change
// so a leader can fill the roster across multiple visits. Final submission
// still goes through /register-team/submit, which owns all real validation.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LocationPicker from "@/components/LocationPicker";
import {
  deleteRegistrationDraft,
  useRegistrationDraft,
  type TeamDraftData,
  type TeamRiderDraft,
} from "@/lib/registration-drafts";

type RiderInput = {
  fullName: string;
  age: string;
  location: string;
  phone: string;
  email: string;
  yearsExperience: string;
  horseAge: string;
  horseBreed: string;
};

type RiderField = keyof RiderInput;

type LeaderProfile = {
  full_name?: string | null;
  age?: number | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  years_experience?: number | null;
  horse_age?: number | null;
  horse_breed?: string | null;
};

const emptyRider: RiderInput = {
  fullName: "",
  age: "",
  location: "",
  phone: "",
  email: "",
  yearsExperience: "",
  horseAge: "",
  horseBreed: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const numberToInputValue = (value?: number | null) => (value == null ? "" : String(value));

const leaderProfileToRider = (leaderProfile?: LeaderProfile): RiderInput => ({
  fullName: leaderProfile?.full_name ?? "",
  age: numberToInputValue(leaderProfile?.age),
  location: leaderProfile?.location ?? "",
  phone: leaderProfile?.phone ?? "",
  email: leaderProfile?.email ?? "",
  yearsExperience: numberToInputValue(leaderProfile?.years_experience),
  horseAge: numberToInputValue(leaderProfile?.horse_age),
  horseBreed: leaderProfile?.horse_breed ?? "",
});

const draftToRider = (draft?: TeamRiderDraft): RiderInput => ({
  fullName: draft?.fullName ?? "",
  age: draft?.age ?? "",
  location: draft?.location ?? "",
  phone: draft?.phone ?? "",
  email: draft?.email ?? "",
  yearsExperience: draft?.yearsExperience ?? "",
  horseAge: draft?.horseAge ?? "",
  horseBreed: draft?.horseBreed ?? "",
});

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

/* Client-side mirror of the server's per-rider checks so the wizard can gate
   "Next" and mark review-step completeness; the submit route re-validates. */
const getRiderError = (rider: RiderInput) => {
  const requiredText: Array<[RiderField, string]> = [
    ["fullName", "Full name"],
    ["location", "Location"],
    ["phone", "Phone number"],
    ["email", "Email"],
    ["horseBreed", "Horse breed"],
  ];

  for (const [field, fieldLabel] of requiredText) {
    if (!rider[field] || rider[field].trim() === "") {
      return `${fieldLabel} is required.`;
    }
  }

  if (!emailPattern.test(rider.email.trim())) {
    return "Please enter a valid email address.";
  }

  if (parseBoundedInt(rider.age, { min: 1, max: 120 }) === null) {
    return "Please enter a valid age.";
  }

  if (parseBoundedInt(rider.yearsExperience, { min: 0, max: 100 }) === null) {
    return "Please enter valid years of experience.";
  }

  if (parseBoundedInt(rider.horseAge, { min: 0, max: 60 }) === null) {
    return "Please enter a valid horse age.";
  }

  return null;
};

const riderLabels = ["Rider 1 (Team Leader)", "Rider 2", "Rider 3", "Rider 4"];
const stepLabels = ["Team Name", "Rider 1", "Rider 2", "Rider 3", "Rider 4", "Review"];
const REVIEW_STEP = 5;

const inputClassName =
  "mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none";
const lockedInputClassName =
  "mt-2 w-full cursor-not-allowed rounded-lg border border-bronze/20 bg-parchment px-4 py-3 text-brown/70 focus:outline-none";
const labelClassName =
  "font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink";

const draftStatusText = {
  idle: "",
  saving: "Saving draft…",
  saved: "Draft saved ✓",
  error: "Draft could not be saved — check your connection.",
} as const;

const clampStep = (value: number | undefined) => {
  if (value == null || !Number.isInteger(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), REVIEW_STEP);
};

export default function TeamRegisterForm({
  existingTeamId,
  initialTeamName = "",
  leaderProfile,
  lockTeamName = false,
  lockLeaderProfileFields = false,
  initialDraft,
}: {
  existingTeamId?: string;
  initialTeamName?: string;
  leaderProfile?: LeaderProfile;
  lockTeamName?: boolean;
  lockLeaderProfileFields?: boolean;
  initialDraft?: TeamDraftData | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(() => clampStep(initialDraft?.step));
  const [teamName, setTeamName] = useState(() =>
    lockTeamName ? initialTeamName : initialDraft?.teamName ?? initialTeamName
  );
  const [riders, setRiders] = useState<RiderInput[]>(() =>
    Array.from({ length: 4 }, (_, index) => {
      // The leader row always mirrors the account when locked; other rows
      // (and the leader row for admins) resume from the saved draft.
      if (index === 0 && lockLeaderProfileFields) {
        return leaderProfileToRider(leaderProfile);
      }

      const draftRider = initialDraft?.riders?.[index];

      if (draftRider) {
        return draftToRider(draftRider);
      }

      return index === 0 ? leaderProfileToRider(leaderProfile) : { ...emptyRider };
    })
  );
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const draftData = useMemo<TeamDraftData>(
    () => ({ step, teamName, riders }),
    [step, teamName, riders]
  );
  const { status: draftStatus, flush: saveDraftNow } = useRegistrationDraft(
    "team",
    draftData
  );

  // Persist immediately when the wizard moves, not 800ms later. Declared
  // after the hook so the hook's effect has already staged the fresh data.
  useEffect(() => {
    saveDraftNow();
  }, [step, saveDraftNow]);

  const updateRider = (index: number, field: RiderField, value: string) => {
    setRiders((currentRiders) =>
      currentRiders.map((rider, riderIndex) =>
        riderIndex === index ? { ...rider, [field]: value } : rider
      )
    );
  };

  const riderErrors = riders.map((rider) => getRiderError(rider));
  const teamNameError = teamName.trim() === "" ? "Please enter a team name." : null;

  const validateStep = (target: number): string | null => {
    if (target === 0) {
      return teamNameError;
    }

    if (target >= 1 && target <= 4) {
      const riderError = riderErrors[target - 1];
      return riderError ? `${riderLabels[target - 1]}: ${riderError}` : null;
    }

    return null;
  };

  const goToStep = (target: number) => {
    setStepError(null);
    setSubmitError(null);
    setStep(clampStep(target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    const error = validateStep(step);

    if (error) {
      setStepError(error);
      return;
    }

    goToStep(step + 1);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setLoading(true);

    const response = await fetch("/register-team/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName, existingTeamId, riders }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };

    if (!response.ok) {
      setLoading(false);
      setSubmitError(result.error ?? "Unable to register the team.");
      return;
    }

    await deleteRegistrationDraft("team");
    setLoading(false);
    router.push("/register-team/success");
  };

  const allStepsValid = teamNameError === null && riderErrors.every((e) => e === null);
  const progressPercent = (step / REVIEW_STEP) * 100;

  const renderRiderFields = (index: number) => {
    const rider = riders[index];
    const locked = index === 0 && lockLeaderProfileFields;

    return (
      <div className="space-y-6">
        <div>
          <label className={labelClassName}>Full Name</label>
          <input
            type="text"
            value={rider.fullName}
            onChange={(e) => updateRider(index, "fullName", e.target.value)}
            readOnly={locked}
            className={locked ? lockedInputClassName : inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Age</label>
          <input
            type="number"
            value={rider.age}
            onChange={(e) => updateRider(index, "age", e.target.value)}
            min={1}
            readOnly={locked}
            className={locked ? lockedInputClassName : inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Location</label>
          {locked ? (
            <input type="text" value={rider.location} readOnly className={lockedInputClassName} />
          ) : (
            <div className="mt-2">
              <LocationPicker
                key={`rider-location-${index}`}
                value={rider.location}
                onChange={(nextLocation) => updateRider(index, "location", nextLocation)}
                tone="cream"
              />
            </div>
          )}
        </div>

        <div>
          <label className={labelClassName}>Phone Number</label>
          <input
            type="tel"
            value={rider.phone}
            onChange={(e) => updateRider(index, "phone", e.target.value)}
            readOnly={locked}
            className={locked ? lockedInputClassName : inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Email</label>
          <input
            type="email"
            value={rider.email}
            onChange={(e) => updateRider(index, "email", e.target.value)}
            readOnly={locked}
            className={locked ? lockedInputClassName : inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Years of Neza Bazi Experience</label>
          <input
            type="number"
            value={rider.yearsExperience}
            onChange={(e) => updateRider(index, "yearsExperience", e.target.value)}
            min={0}
            className={inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Horse Age</label>
          <input
            type="number"
            value={rider.horseAge}
            onChange={(e) => updateRider(index, "horseAge", e.target.value)}
            min={0}
            className={inputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Horse Breed</label>
          <input
            type="text"
            value={rider.horseBreed}
            onChange={(e) => updateRider(index, "horseBreed", e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>
    );
  };

  const reviewRow = (label: string, value: string) => (
    <div>
      <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
        {label}
      </p>
      <p className="mt-1 text-brown/85">{value || "—"}</p>
    </div>
  );

  return (
    <div className="mt-10">
      {/* Progress bar */}
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

      {/* Step content */}
      <div className="mt-10">
        {step === 0 && (
          <div>
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
              Team Name
            </h3>
            <div className="mt-6">
              <label className={labelClassName}>Team Name</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                readOnly={lockTeamName}
                maxLength={200}
                className={lockTeamName ? lockedInputClassName : inputClassName}
              />
              {lockTeamName && (
                <p className="mt-2 text-sm text-brown/70">
                  Your team name is already saved — continue with the rider details.
                </p>
              )}
            </div>
          </div>
        )}

        {step >= 1 && step <= 4 && (
          <div>
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
              {riderLabels[step - 1]}
            </h3>
            {step === 1 && lockLeaderProfileFields && (
              <p className="mt-2 text-sm text-brown/70">
                Your details are filled from your account. Update them on the{" "}
                <a href="/account" className="font-semibold text-bronze-deep underline">
                  account page
                </a>{" "}
                if something is wrong.
              </p>
            )}
            <div className="mt-6">{renderRiderFields(step - 1)}</div>
          </div>
        )}

        {step === REVIEW_STEP && (
          <div className="space-y-6">
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
              Review &amp; Submit
            </h3>

            <div className="rounded-lg border border-bronze/20 bg-sand p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                    Team Name
                  </p>
                  <p className="mt-1 text-lg font-semibold text-brown">
                    {teamName || "—"}
                  </p>
                </div>
                {!lockTeamName && (
                  <button
                    type="button"
                    onClick={() => goToStep(0)}
                    className="rounded-lg border border-bronze/20 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                  >
                    Edit
                  </button>
                )}
              </div>
              {teamNameError && (
                <p className="mt-2 text-sm text-red-700">{teamNameError}</p>
              )}
            </div>

            {riders.map((rider, index) => (
              <div key={riderLabels[index]} className="rounded-lg border border-bronze/20 bg-sand p-5">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-bronze-dark">
                    {riderLabels[index]}
                  </h4>
                  <div className="flex items-center gap-3">
                    {riderErrors[index] ? (
                      <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-red-700">
                        Incomplete
                      </span>
                    ) : (
                      <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-bronze">
                        Complete ✓
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => goToStep(index + 1)}
                      className="rounded-lg border border-bronze/20 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {reviewRow("Full Name", rider.fullName)}
                  {reviewRow("Age", rider.age)}
                  {reviewRow("Location", rider.location)}
                  {reviewRow("Phone", rider.phone)}
                  {reviewRow("Email", rider.email)}
                  {reviewRow("Experience", rider.yearsExperience)}
                  {reviewRow("Horse Age", rider.horseAge)}
                  {reviewRow("Horse Breed", rider.horseBreed)}
                </div>

                {riderErrors[index] && (
                  <p className="mt-3 text-sm text-red-700">{riderErrors[index]}</p>
                )}
              </div>
            ))}

            {submitError && <p className="text-sm text-red-700">{submitError}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !allStepsValid}
              className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
            >
              {loading ? "Submitting..." : "Submit Team Registration"}
            </button>

            {!allStepsValid && (
              <p className="text-center text-sm text-brown/70">
                Complete every rider above to submit.
              </p>
            )}
          </div>
        )}
      </div>

      {stepError && <p className="mt-6 text-sm text-red-700">{stepError}</p>}

      {/* Wizard footer: navigation + draft status */}
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
              {step === 4 ? "Review" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
