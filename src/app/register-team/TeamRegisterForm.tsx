"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

const riderLabels = ["Rider 1 (Team Leader)", "Rider 2", "Rider 3", "Rider 4"];

export default function TeamRegisterForm({
  existingTeamId,
  initialTeamName = "",
  leaderProfile,
  lockTeamName = false,
}: {
  existingTeamId?: string;
  initialTeamName?: string;
  leaderProfile?: LeaderProfile;
  lockTeamName?: boolean;
}) {
  const router = useRouter();
  const [teamName, setTeamName] = useState(initialTeamName);
  const [riders, setRiders] = useState<RiderInput[]>(() =>
    Array.from({ length: 4 }, (_, index) =>
      index === 0 ? leaderProfileToRider(leaderProfile) : { ...emptyRider }
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateRider = (index: number, field: RiderField, value: string) => {
    setRiders((currentRiders) =>
      currentRiders.map((rider, riderIndex) =>
        riderIndex === index ? { ...rider, [field]: value } : rider
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/register-team/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teamName,
        existingTeamId,
        riders,
      }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Unable to submit team registration.");

      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/register-team/success");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-6">
      <div>
        <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          Team Name
        </label>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          required
          disabled={lockTeamName}
          className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none disabled:opacity-70"
        />
      </div>

      {riders.map((rider, index) => (
        <div key={riderLabels[index]} className="space-y-6 rounded-lg border border-bronze/20 bg-sand p-6">
          <h3 className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
            {riderLabels[index]}
          </h3>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Full Name
            </label>
            <input
              type="text"
              value={rider.fullName}
              onChange={(e) => updateRider(index, "fullName", e.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
            />
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Age
            </label>
            <input
              type="number"
              value={rider.age}
              onChange={(e) => updateRider(index, "age", e.target.value)}
              required
              min={1}
              className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
            />
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Location
            </label>
            <input
              type="text"
              value={rider.location}
              onChange={(e) => updateRider(index, "location", e.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
            />
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Phone Number
            </label>
            <input
              type="tel"
              value={rider.phone}
              onChange={(e) => updateRider(index, "phone", e.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
            />
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Email
            </label>
            <input
              type="email"
              value={rider.email}
              onChange={(e) => updateRider(index, "email", e.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
            />
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Years of Neza Bazi Experience
            </label>
            <input
              type="number"
              value={rider.yearsExperience}
              onChange={(e) => updateRider(index, "yearsExperience", e.target.value)}
              required
              min={0}
              className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
            />
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Horse Age
            </label>
            <input
              type="number"
              value={rider.horseAge}
              onChange={(e) => updateRider(index, "horseAge", e.target.value)}
              required
              min={0}
              className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
            />
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Horse Breed
            </label>
            <input
              type="text"
              value={rider.horseBreed}
              onChange={(e) => updateRider(index, "horseBreed", e.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
            />
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-bronze-deep px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
      >
        {loading ? "Submitting..." : "Submit Team Registration"}
      </button>
    </form>
  );
}
