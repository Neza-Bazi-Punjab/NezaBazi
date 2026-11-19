"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import HeadshotUpload from "@/components/HeadshotUpload";
import LocationPicker from "@/components/LocationPicker";
import f from "@/components/redesign/forms.module.css";
import sh from "@/components/redesign/shared.module.css";
import { isValidEmail } from "@/lib/email-address";
import { site } from "@/lib/site";
import { displayEmail } from "@/lib/paper-registration";
import a from "./account.module.css";

export type AccountProfile = {
  id: string;
  full_name: string;
  age: number | null;
  location: string;
  phone: string;
  email: string;
  /* Storage path in the private rider-headshots bucket, or null. Managed by
     HeadshotUpload directly against Auth metadata rather than through the
     profile save, so a photo change takes effect on its own. */
  headshot_path: string | null;
};

export type AccountSoloRegistration = {
  id: string;
  full_name: string;
  /* Optional at registration; hidden on the card while null. */
  father_name: string | null;
  mother_name: string | null;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_age: number;
  horse_breed: string;
  created_at: string;
  confirmation_code: string;
  checked_in_at: string | null;
};

/* A rider this account entered for someone else: shown by name and code
   only, and edited by an administrator, not from this account. */
export type AccountEnteredRegistration = {
  id: string;
  full_name: string;
  confirmation_code: string;
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
  father_name: string | null;
  mother_name: string | null;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_name: string | null;
  horse_age: number;
  horse_breed: string;
  is_leader: boolean;
  created_at: string;
  confirmation_code: string;
  checked_in_at: string | null;
};

export type AccountTeamMembership = {
  member: AccountTeamMember;
  team: AccountTeam | null;
  teammates: Array<{ id: string; full_name: string; is_leader: boolean }>;
};

type AccountPageClientProps = {
  profile: AccountProfile;
  soloRegistration: AccountSoloRegistration | null;
  enteredRegistrations: AccountEnteredRegistration[];
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

const numberToInputValue = (value?: number | null) => (value == null ? "" : String(value));

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "2-digit",
  month: "numeric",
  day: "numeric",
});

const formatDate = (value: string) => dateFormatter.format(new Date(value));

const Detail = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className={a.dlabel}>{label}</p>
    <p className={a.dvalue}>{value}</p>
  </div>
);

/* Father's and mother's names are optional, so a card shows only the ones the
   rider gave rather than two empty rows. */
const ParentNames = ({
  fatherName,
  motherName,
}: {
  fatherName: string | null | undefined;
  motherName: string | null | undefined;
}) => (
  <>
    {fatherName ? <Detail label="Father's Name" value={fatherName} /> : null}
    {motherName ? <Detail label="Mother's Name" value={motherName} /> : null}
  </>
);

/* The rider's check-in code, plus whether they have already been checked in.
   Shown on every registration a rider can see so the code survives a lost
   email. */
const CheckInStatus = ({
  code,
  checkedInAt,
}: {
  code: string;
  checkedInAt: string | null;
}) => (
  <div className={a.code}>
    <div>
      <p className={a.codeLabel}>Check-in Code</p>
      <p className={a.codeValue}>{code}</p>
    </div>
    {checkedInAt ? (
      <p className={a.codeNote}>Checked in {formatDate(checkedInAt)}</p>
    ) : (
      <p className={a.codeNote}>
        {`Bring this to check-in on ${site.checkInDate}. Riders who do not check in are not entered into the brackets.`}
      </p>
    )}
  </div>
);

export default function AccountPageClient({
  profile,
  soloRegistration,
  enteredRegistrations,
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

    if (!isValidEmail(draft.email)) {
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

  const smallOutline = `${sh.btn} ${sh.outline} ${f.smallBtn} ${f.outlineSmall} ${f.outlineHover}`;
  const smallPrimary = `${sh.btn} ${sh.primary} ${f.smallBtn} ${f.primaryHover}`;

  const shown = (value: string | number | null) =>
    value === null || value === "" ? (
      <p className={`${a.dvalue} ${a.notSet}`}>Not set</p>
    ) : (
      <p className={a.dvalue}>{value}</p>
    );

  return (
    <div className={a.acct}>
      <section>
        <div className={a.head}>
          <h2 className={a.h2}>Account Info</h2>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setError(null);
                setSuccess(null);
              }}
              className={smallOutline}
            >
              Edit
            </button>
          ) : (
            <div className={a.actions}>
              <button
                type="button"
                onClick={saveProfile}
                disabled={saving}
                className={smallPrimary}
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className={smallOutline}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className={f.box}>
          {/* Managed on its own rather than through Save/Cancel: the photo is
              uploaded the moment it is chosen, so tying it to the form's edit
              mode would leave a stored file that the account has not recorded
              if the rider cancelled. */}
          <div className={a.who}>
            <HeadshotUpload initialPath={profile.headshot_path} hint={null} />
          </div>

          <div className={a.details}>
            <div>
              <label htmlFor="account-name" className={a.dlabel}>
                Full Name
              </label>
              {editing ? (
                <input
                  id="account-name"
                  value={draft.full_name}
                  onChange={(event) => updateDraft("full_name", event.target.value)}
                  className={f.input}
                />
              ) : (
                shown(profile.full_name)
              )}
            </div>

            <div>
              <label htmlFor="account-age" className={a.dlabel}>
                Age
              </label>
              {editing ? (
                <input
                  id="account-age"
                  type="number"
                  value={draft.age}
                  onChange={(event) => updateDraft("age", event.target.value)}
                  min={1}
                  className={f.input}
                />
              ) : (
                shown(profile.age)
              )}
            </div>

            <div className={editing ? a.span2 : undefined}>
              <span className={a.dlabel}>Location</span>
              {editing ? (
                <div className={f.picker}>
                  <LocationPicker
                    value={draft.location}
                    onChange={(nextLocation) => updateDraft("location", nextLocation)}
                  />
                </div>
              ) : (
                shown(profile.location)
              )}
            </div>

            <div>
              <label htmlFor="account-phone" className={a.dlabel}>
                Phone Number
              </label>
              {editing ? (
                <input
                  id="account-phone"
                  type="tel"
                  value={draft.phone}
                  onChange={(event) => updateDraft("phone", event.target.value)}
                  className={f.input}
                />
              ) : (
                shown(profile.phone)
              )}
            </div>

            <div>
              <label htmlFor="account-email" className={a.dlabel}>
                Email
              </label>
              {editing ? (
                <input
                  id="account-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) => updateDraft("email", event.target.value)}
                  className={f.input}
                />
              ) : (
                shown(profile.email)
              )}
            </div>
          </div>

          {(error || success) && (
            <div className={a.messages}>
              {error && <p className={f.err}>{error}</p>}
              {success && <p className={f.ok}>{success}</p>}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className={a.head}>
          <h2 className={a.h2}>Active Registrations</h2>
        </div>

        <div className={a.regs}>
          {!soloRegistration &&
          enteredRegistrations.length === 0 &&
          !team &&
          memberships.length === 0 ? (
            /* Online registration is closed (the register pages are admin-only
               since the 2026 championship), so there is nothing to link to. */
            <div className={`${f.box} ${f.text}`}>
              <p>
                You haven&apos;t registered yet. Registration for the next championship
                isn&apos;t open yet.
              </p>
            </div>
          ) : (
            <>
              {soloRegistration && (
                <article className={f.box}>
                  <div className={a.regHead}>
                    <h3>Solo Registration</h3>
                    <p className={a.meta}>Registered {formatDate(soloRegistration.created_at)}</p>
                  </div>

                  <CheckInStatus
                    code={soloRegistration.confirmation_code}
                    checkedInAt={soloRegistration.checked_in_at}
                  />

                  <div className={a.details}>
                    <Detail label="Full Name" value={soloRegistration.full_name} />
                    <ParentNames
                      fatherName={soloRegistration.father_name}
                      motherName={soloRegistration.mother_name}
                    />
                    <Detail label="Age" value={soloRegistration.age} />
                    <Detail label="Location" value={soloRegistration.location} />
                    <Detail label="Phone" value={soloRegistration.phone} />
                    <Detail label="Email" value={displayEmail(soloRegistration.email)} />
                    <Detail label="Experience" value={soloRegistration.years_experience} />
                    <Detail label="Horse Age" value={soloRegistration.horse_age} />
                    <Detail label="Horse Breed" value={soloRegistration.horse_breed} />
                  </div>
                </article>
              )}

              {enteredRegistrations.length > 0 && (
                <article className={f.box}>
                  <div className={a.regHead}>
                    <h3>Registrations You Entered</h3>
                  </div>
                  <p className={a.note}>
                    Riders you registered from this account. Their details are edited by an
                    administrator, not here.
                  </p>

                  <ul className={a.list}>
                    {enteredRegistrations.map((entry) => (
                      <li key={entry.id}>
                        <span className={a.entryName}>{entry.full_name}</span>
                        <span className={a.meta}>
                          <span className={a.entryCode}>{entry.confirmation_code}</span>
                          {" · "}Registered {formatDate(entry.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              )}

              {memberships.map(({ member, team: membershipTeam, teammates }) => (
                <article key={member.id} className={f.box}>
                  <div className={a.regHead}>
                    <div>
                      <h3>Team Registration</h3>
                      <p className={a.teamName}>Team: {membershipTeam?.team_name ?? "Unknown"}</p>
                    </div>
                    <p className={a.meta}>Registered {formatDate(member.created_at)}</p>
                  </div>

                  <p className={a.note}>
                    You are registered as a rider on this team by its team leader.
                  </p>

                  <CheckInStatus
                    code={member.confirmation_code}
                    checkedInAt={member.checked_in_at}
                  />

                  <div className={a.details}>
                    <Detail label="Full Name" value={member.full_name} />
                    <ParentNames
                      fatherName={member.father_name}
                      motherName={member.mother_name}
                    />
                    <Detail label="Age" value={member.age} />
                    <Detail label="Location" value={member.location} />
                    <Detail label="Phone" value={member.phone} />
                    <Detail label="Email" value={displayEmail(member.email)} />
                    <Detail label="Experience" value={member.years_experience} />
                    <Detail label="Horse Age" value={member.horse_age} />
                    <Detail label="Horse Breed" value={member.horse_breed} />
                  </div>

                  {teammates.length > 0 && (
                    <div className={a.teammates}>
                      <p className={a.dlabel}>Teammates</p>
                      <p className={a.dvalue}>
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
                <article className={f.box}>
                  <div className={a.regHead}>
                    <div>
                      <h3>Team Registration</h3>
                      <p className={a.teamName}>Team: {team.team_name}</p>
                    </div>
                    <p className={a.meta}>Registered {formatDate(team.created_at)}</p>
                  </div>

                  {teamMembers.map((member) => (
                    <div key={member.id} className={a.member}>
                      <h4>
                        {member.is_leader ? "Team Leader" : "Team Member"}: {member.full_name}
                      </h4>

                      <div className={a.details}>
                        <ParentNames
                          fatherName={member.father_name}
                          motherName={member.mother_name}
                        />
                        <Detail label="Age" value={member.age} />
                        <Detail label="Location" value={member.location} />
                        <Detail label="Phone" value={member.phone} />
                        <Detail label="Email" value={displayEmail(member.email)} />
                        <Detail label="Experience" value={member.years_experience} />
                        <Detail label="Horse Name" value={member.horse_name ?? "—"} />
                        <Detail label="Horse Age" value={member.horse_age} />
                        <Detail label="Horse Breed" value={member.horse_breed} />
                      </div>

                      <CheckInStatus
                        code={member.confirmation_code}
                        checkedInAt={member.checked_in_at}
                      />
                    </div>
                  ))}
                </article>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
