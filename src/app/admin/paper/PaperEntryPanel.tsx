"use client";

/* Paper entry desk. An administrator types a printed registration form into
   the system on the rider's behalf. The fields come from the same list the
   printed sheet is built from, in the same order, so the eye goes down the
   paper while the hands go down the page. Possible duplicates are looked up
   while typing; the database refuses a true duplicate regardless. The success
   screen shows the confirmation code(s) large enough to copy onto the form's
   "Office use only" box from across a table. */
import { useEffect, useMemo, useRef, useState } from "react";
import { isValidEmail } from "@/lib/email-address";
import {
  PAPER_EMAIL_DOMAIN,
  PAPER_EMERGENCY_FIELDS,
  PAPER_RIDER_FIELDS,
  PAPER_TEAM_EMERGENCY_FIELDS,
  PAPER_TEAM_NAME_FIELD,
  TEAM_SIZE,
  emptySoloInput,
  emptyTeamInput,
  isPaperPlaceholderEmail,
  riderLabel,
  validatePaperSolo,
  validatePaperTeam,
  type PaperContactKey,
  type PaperFieldDefinition,
  type PaperRiderInput,
  type PaperRiderKey,
  type PaperSoloInput,
  type PaperTeamInput,
} from "@/lib/paper-registration";

type Mode = "solo" | "team";

type CreatedRider = {
  id: string;
  full_name: string;
  confirmation_code: string;
  is_leader: boolean;
  email: string;
  has_email: boolean;
};

type Created = {
  type: Mode;
  team_name: string | null;
  riders: CreatedRider[];
};

type DuplicateMatch = {
  id: string;
  source: "solo" | "team";
  full_name: string;
  phone: string;
  email: string;
  team_name: string | null;
  is_leader: boolean;
  registration_source: string | null;
  confirmation_code: string | null;
  matched_on: string[];
};

// ---------------------------------------------------------------------------
// Response guards: the browser checks what the server sent rather than
// trusting its shape.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readError = (body: unknown) =>
  isRecord(body) && typeof body.error === "string" ? body.error : null;

const readCreated = (body: unknown): Created | null => {
  if (!isRecord(body) || !isRecord(body.registration)) {
    return null;
  }

  const { type, team_name, riders } = body.registration;

  if ((type !== "solo" && type !== "team") || !Array.isArray(riders)) {
    return null;
  }

  const parsed: CreatedRider[] = [];

  for (const rider of riders) {
    if (
      !isRecord(rider) ||
      typeof rider.id !== "string" ||
      typeof rider.full_name !== "string" ||
      typeof rider.confirmation_code !== "string" ||
      typeof rider.email !== "string"
    ) {
      return null;
    }

    parsed.push({
      id: rider.id,
      full_name: rider.full_name,
      confirmation_code: rider.confirmation_code,
      is_leader: rider.is_leader === true,
      email: rider.email,
      has_email: rider.has_email === true,
    });
  }

  return { type, team_name: typeof team_name === "string" ? team_name : null, riders: parsed };
};

const readMatches = (body: unknown): DuplicateMatch[] => {
  if (!isRecord(body) || !Array.isArray(body.matches)) {
    return [];
  }

  const matches: DuplicateMatch[] = [];

  for (const match of body.matches) {
    if (
      !isRecord(match) ||
      typeof match.id !== "string" ||
      (match.source !== "solo" && match.source !== "team") ||
      typeof match.full_name !== "string"
    ) {
      continue;
    }

    matches.push({
      id: match.id,
      source: match.source,
      full_name: match.full_name,
      phone: typeof match.phone === "string" ? match.phone : "",
      email: typeof match.email === "string" ? match.email : "",
      team_name: typeof match.team_name === "string" ? match.team_name : null,
      is_leader: match.is_leader === true,
      registration_source:
        typeof match.registration_source === "string" ? match.registration_source : null,
      confirmation_code:
        typeof match.confirmation_code === "string" ? match.confirmation_code : null,
      matched_on: Array.isArray(match.matched_on)
        ? match.matched_on.filter((reason): reason is string => typeof reason === "string")
        : [],
    });
  }

  return matches;
};

// ---------------------------------------------------------------------------
// Live duplicate check, debounced. State is keyed by the query it answers, so
// a stale answer is never shown against newer input and nothing is set
// synchronously inside the effect.

const DUPLICATE_DEBOUNCE_MS = 450;

const useDuplicateMatches = (name: string, phone: string, email: string) => {
  const query = useMemo(() => {
    const params = new URLSearchParams();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length >= 3) {
      params.set("name", trimmedName);
    }

    if (phone.replace(/\D/g, "").length >= 6) {
      params.set("phone", phone.trim());
    }

    if (isValidEmail(trimmedEmail) && !isPaperPlaceholderEmail(trimmedEmail)) {
      params.set("email", trimmedEmail);
    }

    return params.toString();
  }, [name, phone, email]);

  const [answer, setAnswer] = useState<{
    query: string;
    status: "done" | "error";
    matches: DuplicateMatch[];
  } | null>(null);

  useEffect(() => {
    if (query === "") {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/paper-registration/matches?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);

        setAnswer({
          query,
          status: response.ok ? "done" : "error",
          matches: response.ok ? readMatches(body) : [],
        });
      } catch {
        if (!controller.signal.aborted) {
          setAnswer({ query, status: "error", matches: [] });
        }
      }
    }, DUPLICATE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (query === "") {
    return { status: "idle" as const, matches: [] };
  }

  if (!answer || answer.query !== query) {
    return { status: "checking" as const, matches: [] };
  }

  return { status: answer.status, matches: answer.matches };
};

const reasonLabel: Record<string, string> = {
  phone: "same phone",
  email: "same email",
  name: "similar name",
};

function DuplicateNotice({ name, phone, email }: { name: string; phone: string; email: string }) {
  const { status, matches } = useDuplicateMatches(name, phone, email);

  if (status === "idle") {
    return null;
  }

  if (status === "checking") {
    return (
      <p className="text-sm text-brown/70" role="status">
        Checking existing registrations…
      </p>
    );
  }

  if (status === "error") {
    return (
      <p className="text-sm text-brown/70" role="status">
        Could not check existing registrations. Saving still refuses a rider who is already
        registered.
      </p>
    );
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm text-green-800" role="status">
        No existing registration matches this rider.
      </p>
    );
  }

  return (
    <div
      className="rounded-lg border-l-4 border-bronze bg-cream px-4 py-3 text-brown"
      role="status"
    >
      <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark">
        {matches.length === 1 ? "Possible duplicate" : `${matches.length} possible duplicates`} —
        check before saving
      </p>
      <ul className="mt-2 space-y-2 text-sm">
        {matches.map((match) => (
          <li key={`${match.source}:${match.id}`} className="leading-6">
            <span className="font-semibold text-ink">{match.full_name}</span>
            {" · "}
            {match.source === "solo"
              ? "Solo entry"
              : `${match.team_name ?? "Team"}${match.is_leader ? " (team leader)" : ""}`}
            {match.registration_source === "paper" ? " · paper" : " · online"}
            {match.phone && ` · ${match.phone}`}
            {match.email && ` · ${match.email}`}
            {match.confirmation_code && (
              <span className="font-mono tracking-[0.08em] text-bronze-deep">
                {` · ${match.confirmation_code}`}
              </span>
            )}
            <span className="text-brown/70">
              {` (${match.matched_on.map((reason) => reasonLabel[reason] ?? reason).join(", ")})`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fields.

const inputClassName =
  "mt-2 w-full rounded-lg border bg-cream px-4 py-3 text-ink outline-none focus:border-bronze";

/* The sheet's rows, as grid spans. Mobile stacks every field. */
const SOLO_SPANS: Record<PaperRiderKey, string> = {
  full_name: "sm:col-span-12",
  father_name: "sm:col-span-6",
  mother_name: "sm:col-span-6",
  age: "sm:col-span-2",
  phone: "sm:col-span-4",
  email: "sm:col-span-6",
  village_city: "sm:col-span-3",
  district: "sm:col-span-3",
  state: "sm:col-span-3",
  country: "sm:col-span-3",
  years_experience: "sm:col-span-5",
  horse_name: "sm:col-span-5",
  horse_age: "sm:col-span-2",
  horse_breed: "sm:col-span-5",
};

const TEAM_SPANS: Record<PaperRiderKey, string> = {
  full_name: "sm:col-span-4",
  father_name: "sm:col-span-4",
  mother_name: "sm:col-span-4",
  age: "sm:col-span-2",
  phone: "sm:col-span-4",
  email: "sm:col-span-6",
  village_city: "sm:col-span-3",
  district: "sm:col-span-3",
  state: "sm:col-span-3",
  country: "sm:col-span-3",
  years_experience: "sm:col-span-3",
  horse_name: "sm:col-span-4",
  horse_age: "sm:col-span-2",
  horse_breed: "sm:col-span-3",
};

/* The solo sheet starts a "Horse details" section at the horse name. */
const HORSE_KEYS: ReadonlySet<PaperRiderKey> = new Set(["horse_name", "horse_age", "horse_breed"]);

function Field({
  id,
  definition,
  value,
  error,
  note,
  className = "",
  onChange,
  onBlur,
}: {
  id: string;
  definition: PaperFieldDefinition;
  value: string;
  error: string | null;
  note?: string;
  className?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  // Only the parents' names are optional on their own. The email has its own
  // note, and the location boxes need at least one of the four.
  const optional = definition.key === "father_name" || definition.key === "mother_name";

  const describedBy = [error ? `${id}-error` : null, note ? `${id}-note` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <label htmlFor={id} className="block">
        <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          {definition.label}
          {optional && (
            <span className="ml-1 normal-case tracking-normal text-brown/60">(optional)</span>
          )}
        </span>
        <span lang="pa" className="block text-sm text-brown/70">
          {definition.punjabi}
        </span>
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        type={definition.kind === "email" ? "email" : definition.kind === "phone" ? "tel" : "text"}
        inputMode={definition.kind === "integer" ? "numeric" : undefined}
        maxLength={definition.maxLength}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${inputClassName} ${error ? "border-red-700" : "border-bronze/40"}`}
      />
      {note && (
        <p id={`${id}-note`} className="mt-2 text-sm leading-6 text-brown/75">
          {note}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const EMAIL_NOTE = `Optional. If the rider has no email, leave it blank: a placeholder address on ${PAPER_EMAIL_DOMAIN} is stored instead, no email is ever sent to it, and the dashboard shows "No email (paper entry)". Give the rider their code from the next screen.`;

function SectionTitle({ english, punjabi }: { english: string; punjabi: string }) {
  return (
    <h3 className="flex flex-wrap items-baseline gap-x-3 font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
      {english}
      <span lang="pa" className="text-base normal-case tracking-normal text-brown/70">
        {punjabi}
      </span>
    </h3>
  );
}

function RiderFields({
  idPrefix,
  errorPrefix,
  rider,
  spans,
  splitHorse,
  errorFor,
  onChange,
  onBlur,
}: {
  idPrefix: string;
  errorPrefix: string;
  rider: PaperRiderInput;
  spans: Record<PaperRiderKey, string>;
  splitHorse: boolean;
  errorFor: (key: string) => string | null;
  onChange: (key: PaperRiderKey, value: string) => void;
  onBlur: (key: string) => void;
}) {
  const renderField = (definition: PaperFieldDefinition<PaperRiderKey>) => {
    const errorKey = `${errorPrefix}${definition.key}`;

    return (
      <Field
        key={definition.key}
        id={`${idPrefix}${definition.key}`}
        definition={definition}
        value={rider[definition.key]}
        error={errorFor(errorKey)}
        note={definition.kind === "email" ? EMAIL_NOTE : undefined}
        className={spans[definition.key]}
        onChange={(value) => onChange(definition.key, value)}
        onBlur={() => onBlur(errorKey)}
      />
    );
  };

  const duplicateCheck = (
    <div key="duplicates" className="sm:col-span-12">
      <DuplicateNotice name={rider.full_name} phone={rider.phone} email={rider.email} />
    </div>
  );

  const riderPart = PAPER_RIDER_FIELDS.filter((field) => !splitHorse || !HORSE_KEYS.has(field.key));
  const horsePart = splitHorse ? PAPER_RIDER_FIELDS.filter((field) => HORSE_KEYS.has(field.key)) : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-12">
        {riderPart.flatMap((definition) =>
          // Right after the email box: by then the name, phone and email
          // have all been typed, which is everything the check uses.
          definition.key === "email" ? [renderField(definition), duplicateCheck] : [renderField(definition)]
        )}
      </div>

      {horsePart.length > 0 && (
        <div className="mt-8 space-y-5">
          <SectionTitle english="Horse details" punjabi="ਘੋੜੇ ਦੇ ਵੇਰਵੇ" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-12">{horsePart.map(renderField)}</div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

export default function PaperEntryPanel() {
  const [mode, setMode] = useState<Mode>("solo");
  const [solo, setSolo] = useState<PaperSoloInput>(emptySoloInput);
  const [team, setTeam] = useState<PaperTeamInput>(emptyTeamInput);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const validation = useMemo(
    () => (mode === "solo" ? validatePaperSolo(solo) : validatePaperTeam(team)),
    [mode, solo, team]
  );
  const errors = validation.ok ? {} : validation.errors;

  const errorFor = (key: string) =>
    (attempted || touched.has(key)) && errors[key] ? errors[key] : null;

  const markTouched = (key: string) =>
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));

  const switchMode = (next: Mode) => {
    if (next === mode) {
      return;
    }

    // Each mode keeps what was typed into it; only the error display resets.
    setMode(next);
    setAttempted(false);
    setTouched(new Set());
    setServerError(null);
  };

  const updateSoloRider = (key: PaperRiderKey | PaperContactKey, value: string) =>
    setSolo((current) => ({ ...current, [key]: value }));

  const updateTeamField = (key: "team_name" | PaperContactKey, value: string) =>
    setTeam((current) => ({ ...current, [key]: value }));

  const updateTeamRider = (index: number, key: PaperRiderKey, value: string) =>
    setTeam((current) => ({
      ...current,
      riders: current.riders.map((rider, riderIndex) =>
        riderIndex === index ? { ...rider, [key]: value } : rider
      ),
    }));

  const focusFirstError = (keys: string[]) => {
    const first = keys[0];

    if (!first) {
      return;
    }

    document.getElementById(`paper-${mode}-${first}`)?.focus();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);

    if (!validation.ok) {
      setServerError(validation.firstError);
      focusFirstError(Object.keys(validation.errors));
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/paper-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: mode, registration: mode === "solo" ? solo : team }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setServerError(readError(body) ?? "Could not save the registration. Try again.");
        return;
      }

      const result = readCreated(body);

      if (!result) {
        setServerError(
          "The registration was saved, but the confirmation codes could not be shown. Search for the rider on the dashboard before entering the form again."
        );
        return;
      }

      setCreated(result);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setServerError("Could not reach the server. Check the connection and retry.");
    } finally {
      setSubmitting(false);
    }
  };

  const enterAnother = () => {
    if (mode === "solo") {
      setSolo(emptySoloInput());
    } else {
      setTeam(emptyTeamInput());
    }

    setCreated(null);
    setAttempted(false);
    setTouched(new Set());
    setServerError(null);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    // After the form re-renders.
    window.setTimeout(() => {
      document
        .getElementById(mode === "solo" ? "paper-solo-full_name" : "paper-team-team_name")
        ?.focus();
    }, 0);
  };

  if (created) {
    const isSolo = created.type === "solo";

    return (
      <div ref={topRef} className="scroll-mt-24 space-y-6">
        <p className="rounded-lg border-l-4 border-green-700 bg-green-50 px-4 py-3 text-green-900">
          {isSolo
            ? "Registration saved. Write this code in the Office use only box on the paper form."
            : `Team saved${created.team_name ? `: ${created.team_name}` : ""}. Write each rider's code in the Office use only box on the paper form.`}
        </p>

        <ul className={isSolo ? "space-y-4" : "grid gap-4 md:grid-cols-2"}>
          {created.riders.map((rider, index) => (
            <li key={rider.id} className="rounded-lg border border-bronze/30 bg-sand p-6">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-ink">
                {isSolo ? "Confirmation code" : `${riderLabel(index)} — confirmation code`}
              </p>
              <p className="mt-1 font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
                {rider.full_name}
              </p>
              <p
                className={`mt-4 select-all break-all font-mono font-bold tracking-[0.12em] text-ink ${
                  isSolo ? "text-6xl sm:text-8xl" : "text-4xl sm:text-5xl"
                }`}
              >
                {rider.confirmation_code}
              </p>
              <p className="mt-4 text-sm leading-6 text-brown/80">
                {rider.has_email
                  ? `The code is also being emailed to ${rider.email}.`
                  : "No email on file — give the rider this code yourself."}
              </p>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={enterAnother}
          className="rounded-lg bg-bronze-deep px-8 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
        >
          Enter Another
        </button>
      </div>
    );
  }

  return (
    <div ref={topRef} className="scroll-mt-24">
      <form onSubmit={submit} noValidate className="space-y-8">
        <fieldset>
          <legend className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
            Which form is it?
          </legend>
          <div className="mt-3 inline-flex rounded-lg border border-bronze/40 bg-cream p-1">
            {(["solo", "team"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => switchMode(option)}
                aria-pressed={mode === option}
                className={`rounded-md px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.12em] transition-colors ${
                  mode === option ? "bg-bronze-deep text-cream" : "text-brown hover:bg-sand"
                }`}
              >
                {option === "solo" ? "Solo rider" : `Team of ${TEAM_SIZE}`}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "solo" ? (
          <>
            <section className="space-y-5 rounded-lg border border-bronze/20 bg-sand p-5 sm:p-6">
              <SectionTitle english="Rider details" punjabi="ਸਵਾਰ ਦੇ ਵੇਰਵੇ" />
              <RiderFields
                idPrefix="paper-solo-"
                errorPrefix=""
                rider={solo}
                spans={SOLO_SPANS}
                splitHorse
                errorFor={errorFor}
                onChange={updateSoloRider}
                onBlur={markTouched}
              />
            </section>

            <section className="space-y-5 rounded-lg border border-bronze/20 bg-sand p-5 sm:p-6">
              <SectionTitle english="Emergency contact" punjabi="ਐਮਰਜੈਂਸੀ ਸੰਪਰਕ" />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-12">
                {PAPER_EMERGENCY_FIELDS.map((definition) => (
                  <Field
                    key={definition.key}
                    id={`paper-solo-${definition.key}`}
                    definition={definition}
                    value={solo[definition.key]}
                    error={errorFor(definition.key)}
                    className={definition.key === "emergency_contact_name" ? "sm:col-span-7" : "sm:col-span-5"}
                    onChange={(value) => updateSoloRider(definition.key, value)}
                    onBlur={() => markTouched(definition.key)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="space-y-5 rounded-lg border border-bronze/20 bg-sand p-5 sm:p-6">
              <SectionTitle english="Team details" punjabi="ਟੀਮ ਦੇ ਵੇਰਵੇ" />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-12">
                <Field
                  id="paper-team-team_name"
                  definition={PAPER_TEAM_NAME_FIELD}
                  value={team.team_name}
                  error={errorFor("team_name")}
                  className="sm:col-span-12"
                  onChange={(value) => updateTeamField("team_name", value)}
                  onBlur={() => markTouched("team_name")}
                />
                {PAPER_TEAM_EMERGENCY_FIELDS.map((definition) => (
                  <Field
                    key={definition.key}
                    id={`paper-team-${definition.key}`}
                    definition={definition}
                    value={team[definition.key]}
                    error={errorFor(definition.key)}
                    className={definition.key === "emergency_contact_name" ? "sm:col-span-7" : "sm:col-span-5"}
                    onChange={(value) => updateTeamField(definition.key, value)}
                    onBlur={() => markTouched(definition.key)}
                  />
                ))}
              </div>
            </section>

            {team.riders.map((rider, index) => (
              <section
                key={index}
                className="space-y-5 rounded-lg border border-bronze/20 bg-sand p-5 sm:p-6"
              >
                <SectionTitle
                  english={index === 0 ? "Rider 1 — team leader" : `Rider ${index + 1}`}
                  punjabi={index === 0 ? "ਸਵਾਰ 1 — ਟੀਮ ਲੀਡਰ" : `ਸਵਾਰ ${index + 1}`}
                />
                <RiderFields
                  idPrefix={`paper-team-riders.${index}.`}
                  errorPrefix={`riders.${index}.`}
                  rider={rider}
                  spans={TEAM_SPANS}
                  splitHorse={false}
                  errorFor={errorFor}
                  onChange={(key, value) => updateTeamRider(index, key, value)}
                  onBlur={markTouched}
                />
              </section>
            ))}
          </>
        )}

        {serverError && (
          <p
            className="rounded-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 text-red-900"
            role="alert"
          >
            {serverError}
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-bronze/20 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-brown/75">
            Check every box against the paper before saving. The rider is registered as soon as
            you save.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded-lg bg-bronze-deep px-8 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze disabled:opacity-50"
          >
            {submitting ? "Saving…" : mode === "solo" ? "Save Registration" : "Save Team"}
          </button>
        </div>
      </form>
    </div>
  );
}
