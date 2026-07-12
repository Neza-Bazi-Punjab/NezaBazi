"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SectionHeading from "@/components/SectionHeading";

export type AccountProfile = {
  id: string;
  full_name: string;
  age: number | null;
  location: string;
  phone: string;
  email: string;
};

export type AccountSoloRegistration = {
  id: string;
  full_name: string;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_age: number;
  horse_breed: string;
  created_at: string;
};

export type AccountTeam = {
  id: string;
  team_name: string;
  created_at: string;
};

export type AccountTeamMember = {
  id: string;
  team_id: string;
  full_name: string;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_age: number;
  horse_breed: string;
  is_leader: boolean;
  created_at: string;
};

export type AccountTeamMembership = {
  member: AccountTeamMember;
  team: AccountTeam | null;
  teammates: Array<{ id: string; full_name: string; is_leader: boolean }>;
};

type AccountPageClientProps = {
  profile: AccountProfile;
  soloRegistration: AccountSoloRegistration | null;
  team: AccountTeam | null;
  teamMembers: AccountTeamMember[];
  memberships: AccountTeamMembership[];
};

type ProfileDraft = {
  full_name: string;
  age: string;
  location: string;
  phone: string;
  email: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputClassName =
  "mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none";
const displayClassName =
  "mt-2 w-full rounded-lg border border-bronze/20 bg-parchment px-4 py-3 text-brown/75";

const numberToInputValue = (value?: number | null) => (value == null ? "" : String(value));

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "2-digit",
  month: "numeric",
  day: "numeric",
});

const formatDate = (value: string) => dateFormatter.format(new Date(value));

const Detail = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
      {label}
    </p>
    <p className="mt-1 text-brown/85">{value}</p>
  </div>
);

export default function AccountPageClient({
  profile,
  soloRegistration,
  team,
  teamMembers,
  memberships,
}: AccountPageClientProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>({
    full_name: profile.full_name,
    age: numberToInputValue(profile.age),
    location: profile.location,
    phone: profile.phone,
    email: profile.email,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetDraft = () => {
    setDraft({
      full_name: profile.full_name,
      age: numberToInputValue(profile.age),
      location: profile.location,
      phone: profile.phone,
      email: profile.email,
    });
  };

  const updateDraft = (field: keyof ProfileDraft, value: string) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const validateDraft = () => {
    if (draft.full_name.trim() === "") {
      return "Full name is required.";
    }

    if (draft.age.trim() === "") {
      return "Age is required.";
    }

    const ageNumber = Number(draft.age.trim());

    if (!Number.isInteger(ageNumber) || ageNumber < 1 || ageNumber > 120) {
      return "Please enter a valid age.";
    }

    if (draft.location.trim() === "") {
      return "Location is required.";
    }

    if (draft.phone.trim() === "") {
      return "Phone number is required.";
    }

    if (draft.email.trim() === "") {
      return "Email is required.";
    }

    if (!emailPattern.test(draft.email.trim())) {
      return "Please enter a valid email address.";
    }

    return null;
  };

  const saveProfile = async () => {
    const validationError = validateDraft();

    setError(null);
    setSuccess(null);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: draft.full_name.trim(),
        age: draft.age.trim(),
        location: draft.location.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
      }),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      emailRequiresConfirmation?: boolean;
      syncedCount?: number;
      warnings?: string[];
    };

    setSaving(false);

    if (!response.ok) {
      setError(result.error ?? "Unable to update profile.");
      return;
    }

    setEditing(false);

    if (result.warnings && result.warnings.length > 0) {
      setError(`Your account was updated, but: ${result.warnings.join(" ")}`);
    } else {
      const baseMessage = result.emailRequiresConfirmation
        ? "Profile updated. Check your new email inbox to confirm the email change."
        : "Profile updated.";

      setSuccess(
        (result.syncedCount ?? 0) > 0
          ? `${baseMessage} Your registration details were updated to match.`
          : baseMessage
      );
    }

    router.refresh();
  };

  const cancelEditing = () => {
    resetDraft();
    setEditing(false);
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeading>Account Info</SectionHeading>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setError(null);
                setSuccess(null);
              }}
              className="w-fit rounded-lg border border-bronze/20 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveProfile}
                disabled={saving}
                className="rounded-lg bg-bronze-deep px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="rounded-lg border border-bronze/20 px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="mt-10 space-y-6 rounded-lg border border-bronze/20 bg-sand p-6">
          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Full Name
            </label>
            {editing ? (
              <input
                value={draft.full_name}
                onChange={(event) => updateDraft("full_name", event.target.value)}
                className={inputClassName}
              />
            ) : (
              <p className={displayClassName}>{profile.full_name || "Not set"}</p>
            )}
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Age
            </label>
            {editing ? (
              <input
                type="number"
                value={draft.age}
                onChange={(event) => updateDraft("age", event.target.value)}
                min={1}
                className={inputClassName}
              />
            ) : (
              <p className={displayClassName}>{profile.age ?? "Not set"}</p>
            )}
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Location
            </label>
            {editing ? (
              <input
                value={draft.location}
                onChange={(event) => updateDraft("location", event.target.value)}
                className={inputClassName}
              />
            ) : (
              <p className={displayClassName}>{profile.location || "Not set"}</p>
            )}
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Phone Number
            </label>
            {editing ? (
              <input
                type="tel"
                value={draft.phone}
                onChange={(event) => updateDraft("phone", event.target.value)}
                className={inputClassName}
              />
            ) : (
              <p className={displayClassName}>{profile.phone || "Not set"}</p>
            )}
          </div>

          <div>
            <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
              Email
            </label>
            {editing ? (
              <input
                type="email"
                value={draft.email}
                onChange={(event) => updateDraft("email", event.target.value)}
                className={inputClassName}
              />
            ) : (
              <p className={displayClassName}>{profile.email || "Not set"}</p>
            )}
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}
          {success && <p className="text-sm text-brown/80">{success}</p>}
        </div>
      </section>

      <section>
        <SectionHeading>Active Registrations</SectionHeading>

        <div className="mt-10 space-y-6">
          {!soloRegistration && !team && memberships.length === 0 ? (
            <div className="space-y-6 rounded-lg border border-bronze/20 bg-sand p-6">
              <p className="leading-7 text-brown/85">
                You haven&apos;t registered yet.
              </p>
              <Link
                href="/register"
                className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze sm:w-fit"
              >
                Register
              </Link>
            </div>
          ) : (
            <>
              {soloRegistration && (
                <article className="space-y-6 rounded-lg border border-bronze/20 bg-sand p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
                      Solo Registration
                    </h3>
                    <p className="text-sm text-brown/80">
                      Registered {formatDate(soloRegistration.created_at)}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Detail label="Full Name" value={soloRegistration.full_name} />
                    <Detail label="Age" value={soloRegistration.age} />
                    <Detail label="Location" value={soloRegistration.location} />
                    <Detail label="Phone" value={soloRegistration.phone} />
                    <Detail label="Email" value={soloRegistration.email} />
                    <Detail
                      label="Experience"
                      value={soloRegistration.years_experience}
                    />
                    <Detail label="Horse Age" value={soloRegistration.horse_age} />
                    <Detail label="Horse Breed" value={soloRegistration.horse_breed} />
                  </div>
                </article>
              )}

              {memberships.map(({ member, team: membershipTeam, teammates }) => (
                <article
                  key={member.id}
                  className="space-y-6 rounded-lg border border-bronze/20 bg-sand p-6"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
                      {membershipTeam?.team_name ?? "Team"}
                    </h3>
                    <p className="text-sm text-brown/80">
                      Registered {formatDate(member.created_at)}
                    </p>
                  </div>

                  <p className="leading-7 text-brown/85">
                    You are registered as a rider on this team by its team leader.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Detail label="Full Name" value={member.full_name} />
                    <Detail label="Age" value={member.age} />
                    <Detail label="Location" value={member.location} />
                    <Detail label="Phone" value={member.phone} />
                    <Detail label="Email" value={member.email} />
                    <Detail label="Experience" value={member.years_experience} />
                    <Detail label="Horse Age" value={member.horse_age} />
                    <Detail label="Horse Breed" value={member.horse_breed} />
                  </div>

                  {teammates.length > 0 && (
                    <div>
                      <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                        Teammates
                      </p>
                      <p className="mt-1 text-brown/85">
                        {teammates
                          .map(
                            (teammate) =>
                              `${teammate.full_name}${teammate.is_leader ? " (Team Leader)" : ""}`
                          )
                          .join(", ")}
                      </p>
                    </div>
                  )}
                </article>
              ))}

              {team && (
                <article className="space-y-6 rounded-lg border border-bronze/20 bg-sand p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
                      {team.team_name}
                    </h3>
                    <p className="text-sm text-brown/80">
                      Registered {formatDate(team.created_at)}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {teamMembers.map((member) => (
                      <div
                        key={member.id}
                        className="space-y-4 rounded-lg border border-bronze/20 bg-cream p-4"
                      >
                        <h4 className="font-display text-sm font-bold uppercase tracking-[0.12em] text-bronze-dark">
                          {member.is_leader ? "Team Leader" : "Team Member"}:{" "}
                          {member.full_name}
                        </h4>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <Detail label="Age" value={member.age} />
                          <Detail label="Location" value={member.location} />
                          <Detail label="Phone" value={member.phone} />
                          <Detail label="Email" value={member.email} />
                          <Detail label="Experience" value={member.years_experience} />
                          <Detail label="Horse Age" value={member.horse_age} />
                          <Detail label="Horse Breed" value={member.horse_breed} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
