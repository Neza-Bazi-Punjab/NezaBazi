// Paper registration: the field list, validation and placeholder-email rules
// for riders an administrator keys in from the printed form.
//
// One module, four callers: the admin entry panel (browser), the admin route
// (server), the PDF form builder (run directly by Node) and the Resend client.
// So it stays free of `server-only`, React and the `@/` alias, and its own
// import carries the `.ts` extension Node's resolver needs.
//
// The bounds mirror the online paths exactly — src/app/register-team/submit
// and src/app/api/admin/registrations — and the database function
// admin_create_paper_registration enforces them again, so a change here must
// be made in supabase/migrations/20261025130000_paper_registrations.sql too.
import { MAX_EMAIL_LENGTH, isValidEmail } from "./email-address.ts";

/* Riders without an email address are stored under a generated placeholder
   on this domain, so the NOT NULL, UNIQUE and format constraints on the email
   columns, and the one-code-per-rider trigger that matches on email, keep
   working unchanged. The domain must never receive mail: a rider is linked to
   an account by a confirmed email address, and nobody can confirm one here. */
export const PAPER_EMAIL_DOMAIN = "paper.nezabazipunjab.com";
export const PAPER_EMAIL_DISPLAY = "No email (paper entry)";

export const TEAM_SIZE = 4;
export const NAME_MAX_LENGTH = 200;
export const PHONE_MAX_LENGTH = 30;
export const LOCATION_MAX_LENGTH = 200;

const domainOf = (email: string) => {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
};

/* True for the placeholder domain and anything beneath it. */
export const isPaperPlaceholderEmail = (email: string | null | undefined) => {
  if (typeof email !== "string") {
    return false;
  }

  const domain = domainOf(email.trim().toLowerCase());

  return domain === PAPER_EMAIL_DOMAIN || domain.endsWith(`.${PAPER_EMAIL_DOMAIN}`);
};

/* Every place that shows a registration's email renders a placeholder as
   this, never as the generated address. */
export const displayEmail = (email: string | null | undefined) => {
  if (isPaperPlaceholderEmail(email)) {
    return PAPER_EMAIL_DISPLAY;
  }

  return email ?? "";
};

// ---------------------------------------------------------------------------
// Field list. The printed sheet, the admin panel and the validation all read
// this, so the panel always asks for the fields in the order the sheet prints
// them and an administrator can read down the paper while typing.

export type PaperRiderKey =
  | "full_name"
  | "father_name"
  | "mother_name"
  | "age"
  | "phone"
  | "email"
  | "village_city"
  | "district"
  | "state"
  | "country"
  | "years_experience"
  | "horse_name"
  | "horse_age"
  | "horse_breed";

export type PaperFieldDefinition<Key extends string = string> = {
  key: Key;
  label: string;
  /* Gurmukhi label printed beneath the English one. */
  punjabi: string;
  kind: "text" | "integer" | "phone" | "email";
  required: boolean;
  maxLength: number;
  min?: number;
  max?: number;
};

export const PAPER_RIDER_FIELDS: readonly PaperFieldDefinition<PaperRiderKey>[] = [
  { key: "full_name", label: "Full name", punjabi: "ਪੂਰਾ ਨਾਮ", kind: "text", required: true, maxLength: NAME_MAX_LENGTH },
  { key: "father_name", label: "Father's name", punjabi: "ਪਿਤਾ ਦਾ ਨਾਮ", kind: "text", required: false, maxLength: NAME_MAX_LENGTH },
  { key: "mother_name", label: "Mother's name", punjabi: "ਮਾਤਾ ਦਾ ਨਾਮ", kind: "text", required: false, maxLength: NAME_MAX_LENGTH },
  { key: "age", label: "Age", punjabi: "ਉਮਰ", kind: "integer", required: true, maxLength: 3, min: 1, max: 120 },
  { key: "phone", label: "Phone number", punjabi: "ਫ਼ੋਨ ਨੰਬਰ", kind: "phone", required: true, maxLength: PHONE_MAX_LENGTH },
  { key: "email", label: "Email (if you have one)", punjabi: "ਈਮੇਲ (ਜੇ ਹੈ)", kind: "email", required: false, maxLength: MAX_EMAIL_LENGTH },
  { key: "village_city", label: "Village / city", punjabi: "ਪਿੰਡ / ਸ਼ਹਿਰ", kind: "text", required: false, maxLength: LOCATION_MAX_LENGTH },
  { key: "district", label: "District", punjabi: "ਜ਼ਿਲ੍ਹਾ", kind: "text", required: false, maxLength: LOCATION_MAX_LENGTH },
  { key: "state", label: "State", punjabi: "ਰਾਜ", kind: "text", required: false, maxLength: LOCATION_MAX_LENGTH },
  { key: "country", label: "Country", punjabi: "ਦੇਸ਼", kind: "text", required: false, maxLength: LOCATION_MAX_LENGTH },
  { key: "years_experience", label: "Years of tent-pegging experience", punjabi: "ਨੇਜ਼ਾਬਾਜ਼ੀ ਦਾ ਤਜਰਬਾ (ਸਾਲ)", kind: "integer", required: true, maxLength: 3, min: 0, max: 100 },
  { key: "horse_name", label: "Horse name", punjabi: "ਘੋੜੇ ਦਾ ਨਾਮ", kind: "text", required: true, maxLength: NAME_MAX_LENGTH },
  { key: "horse_age", label: "Horse age", punjabi: "ਘੋੜੇ ਦੀ ਉਮਰ", kind: "integer", required: true, maxLength: 2, min: 0, max: 60 },
  { key: "horse_breed", label: "Horse breed", punjabi: "ਘੋੜੇ ਦੀ ਨਸਲ", kind: "text", required: true, maxLength: NAME_MAX_LENGTH },
];

export type PaperContactKey = "emergency_contact_name" | "emergency_contact_phone";

export const PAPER_EMERGENCY_FIELDS: readonly PaperFieldDefinition<PaperContactKey>[] = [
  { key: "emergency_contact_name", label: "Emergency contact name", punjabi: "ਐਮਰਜੈਂਸੀ ਸੰਪਰਕ ਦਾ ਨਾਮ", kind: "text", required: true, maxLength: NAME_MAX_LENGTH },
  { key: "emergency_contact_phone", label: "Emergency contact phone", punjabi: "ਐਮਰਜੈਂਸੀ ਸੰਪਰਕ ਦਾ ਫ਼ੋਨ", kind: "phone", required: true, maxLength: PHONE_MAX_LENGTH },
];

/* A team has one emergency contact, on the team rather than on any rider. */
export const PAPER_TEAM_EMERGENCY_FIELDS: readonly PaperFieldDefinition<PaperContactKey>[] =
  PAPER_EMERGENCY_FIELDS.map((definition) => ({
    ...definition,
    label: `Team ${definition.label.toLowerCase()}`,
    punjabi: `ਟੀਮ ਦੇ ${definition.punjabi}`,
  }));

export const PAPER_TEAM_NAME_FIELD: PaperFieldDefinition<"team_name"> = {
  key: "team_name",
  label: "Team name",
  punjabi: "ਟੀਮ ਦਾ ਨਾਮ",
  kind: "text",
  required: true,
  maxLength: NAME_MAX_LENGTH,
};

/* The four location boxes on the sheet become the single `location` column
   the online forms fill, joined the same way LocationPicker joins them. */
export const PAPER_LOCATION_KEYS = ["village_city", "district", "state", "country"] as const;

export const riderLabel = (index: number) =>
  index === 0 ? "Rider 1 (team leader)" : `Rider ${index + 1}`;

// ---------------------------------------------------------------------------
// Input (as typed) and payload (what the database function receives).

export type PaperRiderInput = Record<PaperRiderKey, string>;
export type PaperContactInput = Record<PaperContactKey, string>;
export type PaperSoloInput = PaperRiderInput & PaperContactInput;
export type PaperTeamInput = PaperContactInput & {
  team_name: string;
  riders: PaperRiderInput[];
};

export type PaperRiderPayload = {
  full_name: string;
  father_name: string | null;
  mother_name: string | null;
  age: number;
  phone: string;
  email: string | null;
  village_city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  years_experience: number;
  horse_name: string;
  horse_age: number;
  horse_breed: string;
};

export type PaperSoloPayload = PaperRiderPayload & {
  emergency_contact_name: string;
  emergency_contact_phone: string;
};

export type PaperTeamPayload = {
  team_name: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  riders: PaperRiderPayload[];
};

/* Errors are keyed by field so the panel can show each one beside its box:
   `full_name` for a solo rider, `riders.2.phone` for a team rider, and
   `team_name` / `emergency_contact_*` for the team itself. */
export type PaperValidationResult<Payload> =
  | { ok: true; payload: Payload }
  | { ok: false; errors: Record<string, string>; firstError: string };

export const emptyRiderInput = (): PaperRiderInput => ({
  full_name: "",
  father_name: "",
  mother_name: "",
  age: "",
  phone: "",
  email: "",
  village_city: "",
  district: "",
  state: "",
  country: "",
  years_experience: "",
  horse_name: "",
  horse_age: "",
  horse_breed: "",
});

export const emptySoloInput = (): PaperSoloInput => ({
  ...emptyRiderInput(),
  emergency_contact_name: "",
  emergency_contact_phone: "",
});

export const emptyTeamInput = (): PaperTeamInput => ({
  team_name: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  riders: Array.from({ length: TEAM_SIZE }, emptyRiderInput),
});

// ---------------------------------------------------------------------------
// Validation.

/* Same rule as the online forms: digits only, optional leading minus, then
   the bounds. "12.5", "1e2" and " " are all rejected. */
export const parseBoundedInt = (value: string, min: number, max: number) => {
  const trimmed = value.trim();

  if (trimmed === "" || !/^-?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
};

export const composeLocation = (parts: Partial<Record<PaperRiderKey, string | null>>) =>
  PAPER_LOCATION_KEYS.map((key) => (parts[key] ?? "").trim())
    .filter((part) => part !== "")
    .join(", ");

/* How two phone numbers are compared for duplicates, here and in the
   database function: by their digits when there are enough of them to be a
   number, so "98765 43210" and "98765-43210" are the same rider. */
export const phoneKey = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 ? digits : phone.trim().toLowerCase();
};

const blankToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

type FieldCheck = {
  definition: PaperFieldDefinition;
  value: string;
  errorKey: string;
  prefix: string;
  errors: Record<string, string>;
};

const checkText = ({ definition, value, errorKey, prefix, errors }: FieldCheck) => {
  const trimmed = value.trim();

  if (trimmed === "") {
    if (definition.required) {
      errors[errorKey] = `${prefix}${definition.label} is required.`;
    }

    return null;
  }

  if (trimmed.length > definition.maxLength) {
    errors[errorKey] = `${prefix}${definition.label} must be ${definition.maxLength} characters or fewer.`;
    return null;
  }

  return trimmed;
};

const checkInteger = ({ definition, value, errorKey, prefix, errors }: FieldCheck) => {
  const min = definition.min ?? 0;
  const max = definition.max ?? Number.MAX_SAFE_INTEGER;
  const parsed = parseBoundedInt(value, min, max);

  if (parsed === null) {
    errors[errorKey] =
      value.trim() === ""
        ? `${prefix}${definition.label} is required.`
        : `${prefix}${definition.label} must be a whole number from ${min} to ${max}.`;
  }

  return parsed;
};

const checkEmail = ({ value, errorKey, prefix, errors }: FieldCheck) => {
  const trimmed = value.trim().toLowerCase();

  if (trimmed === "") {
    return null;
  }

  if (isPaperPlaceholderEmail(trimmed)) {
    errors[errorKey] = `${prefix}Addresses on ${PAPER_EMAIL_DOMAIN} are reserved. Leave the email blank if the rider has none.`;
    return null;
  }

  if (!isValidEmail(trimmed)) {
    errors[errorKey] = `${prefix}Enter a valid email address, or leave it blank if the rider has none.`;
    return null;
  }

  return trimmed;
};

const validateRider = (
  input: PaperRiderInput,
  keyPrefix: string,
  messagePrefix: string,
  errors: Record<string, string>
): PaperRiderPayload | null => {
  const values: Partial<Record<PaperRiderKey, string | number | null>> = {};

  for (const definition of PAPER_RIDER_FIELDS) {
    const check: FieldCheck = {
      definition,
      value: input[definition.key],
      errorKey: `${keyPrefix}${definition.key}`,
      prefix: messagePrefix,
      errors,
    };

    if (definition.kind === "integer") {
      values[definition.key] = checkInteger(check);
    } else if (definition.kind === "email") {
      values[definition.key] = checkEmail(check);
    } else {
      values[definition.key] = checkText(check);
    }

    // The four location boxes are each optional but at least one is needed,
    // and together they fill one column. Checked after the last of them so
    // errors stay in the order of the sheet.
    if (definition.key === "country") {
      const location = composeLocation(input);
      const locationKey = `${keyPrefix}village_city`;

      if (location === "") {
        errors[locationKey] ??=
          `${messagePrefix}Enter the village or city, district, state or country.`;
      } else if (location.length > LOCATION_MAX_LENGTH) {
        errors[locationKey] ??=
          `${messagePrefix}The village, district, state and country together must be ${LOCATION_MAX_LENGTH} characters or fewer.`;
      }
    }
  }

  const hasErrors = Object.keys(errors).some((key) => key.startsWith(keyPrefix));

  if (hasErrors) {
    return null;
  }

  const text = (key: PaperRiderKey) => {
    const value = values[key];
    return typeof value === "string" ? value : null;
  };
  const number = (key: PaperRiderKey) => {
    const value = values[key];
    return typeof value === "number" ? value : 0;
  };

  return {
    full_name: text("full_name") ?? "",
    father_name: text("father_name"),
    mother_name: text("mother_name"),
    age: number("age"),
    phone: text("phone") ?? "",
    email: text("email"),
    village_city: blankToNull(input.village_city),
    district: blankToNull(input.district),
    state: blankToNull(input.state),
    country: blankToNull(input.country),
    years_experience: number("years_experience"),
    horse_name: text("horse_name") ?? "",
    horse_age: number("horse_age"),
    horse_breed: text("horse_breed") ?? "",
  };
};

const validateContact = (
  input: PaperContactInput,
  definitions: readonly PaperFieldDefinition<PaperContactKey>[],
  errors: Record<string, string>
) => {
  const values: Partial<Record<PaperContactKey, string | null>> = {};

  for (const definition of definitions) {
    values[definition.key] = checkText({
      definition,
      value: input[definition.key],
      errorKey: definition.key,
      prefix: "",
      errors,
    });
  }

  return {
    emergency_contact_name: values.emergency_contact_name ?? "",
    emergency_contact_phone: values.emergency_contact_phone ?? "",
  };
};

const finish = <Payload>(
  errors: Record<string, string>,
  payload: Payload | null
): PaperValidationResult<Payload> => {
  const messages = Object.values(errors);

  if (messages.length > 0 || payload === null) {
    return {
      ok: false,
      errors,
      firstError: messages[0] ?? "Check the form and try again.",
    };
  }

  return { ok: true, payload };
};

export const validatePaperSolo = (
  input: PaperSoloInput
): PaperValidationResult<PaperSoloPayload> => {
  const errors: Record<string, string> = {};
  const rider = validateRider(input, "", "", errors);
  const contact = validateContact(input, PAPER_EMERGENCY_FIELDS, errors);

  return finish(errors, rider ? { ...rider, ...contact } : null);
};

export const validatePaperTeam = (
  input: PaperTeamInput
): PaperValidationResult<PaperTeamPayload> => {
  const errors: Record<string, string> = {};
  const teamName = checkText({
    definition: PAPER_TEAM_NAME_FIELD,
    value: input.team_name,
    errorKey: "team_name",
    prefix: "",
    errors,
  });
  const contact = validateContact(input, PAPER_TEAM_EMERGENCY_FIELDS, errors);

  if (input.riders.length !== TEAM_SIZE) {
    errors.riders = `A team needs exactly ${TEAM_SIZE} riders, team leader first.`;
    return finish<PaperTeamPayload>(errors, null);
  }

  const riders: PaperRiderPayload[] = [];
  const seenEmails = new Map<string, number>();
  const seenPhones = new Map<string, number>();

  input.riders.forEach((riderInput, index) => {
    const label = `${riderLabel(index)}: `;
    const rider = validateRider(riderInput, `riders.${index}.`, label, errors);

    if (!rider) {
      return;
    }

    // Each rider must be a different person, exactly as the online wizard
    // requires: one email and one phone per rider.
    if (rider.email !== null) {
      const earlier = seenEmails.get(rider.email);

      if (earlier !== undefined) {
        errors[`riders.${index}.email`] = `${label}Same email as ${riderLabel(earlier).toLowerCase()}.`;
      } else {
        seenEmails.set(rider.email, index);
      }
    }

    const phone = phoneKey(rider.phone);
    const earlierPhone = seenPhones.get(phone);

    if (earlierPhone !== undefined) {
      errors[`riders.${index}.phone`] = `${label}Same phone number as ${riderLabel(earlierPhone).toLowerCase()}.`;
    } else {
      seenPhones.set(phone, index);
    }

    riders.push(rider);
  });

  return finish(
    errors,
    teamName !== null && riders.length === TEAM_SIZE
      ? { team_name: teamName, ...contact, riders }
      : null
  );
};

// ---------------------------------------------------------------------------
// Request parsing for the admin route. Type guards only: unknown keys are
// ignored, numbers are accepted for the numeric boxes, anything else that is
// not a string makes the whole request invalid. Actor fields are never read —
// the route takes the administrator from the verified session.

const MAX_RAW_LENGTH = 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readField = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];

  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.length <= MAX_RAW_LENGTH) {
    return value;
  }

  return null;
};

const readRider = (value: unknown): PaperRiderInput | null => {
  if (!isRecord(value)) {
    return null;
  }

  const rider = emptyRiderInput();

  for (const definition of PAPER_RIDER_FIELDS) {
    const field = readField(value, definition.key);

    if (field === null) {
      return null;
    }

    rider[definition.key] = field;
  }

  return rider;
};

const readContact = (value: Record<string, unknown>): PaperContactInput | null => {
  const name = readField(value, "emergency_contact_name");
  const phone = readField(value, "emergency_contact_phone");

  if (name === null || phone === null) {
    return null;
  }

  return { emergency_contact_name: name, emergency_contact_phone: phone };
};

export type PaperRegistrationRequest =
  | { type: "solo"; input: PaperSoloInput }
  | { type: "team"; input: PaperTeamInput };

export const parsePaperRegistrationRequest = (
  body: unknown
): PaperRegistrationRequest | null => {
  if (!isRecord(body) || !isRecord(body.registration)) {
    return null;
  }

  const registration = body.registration;

  if (body.type === "solo") {
    const rider = readRider(registration);
    const contact = readContact(registration);

    return rider && contact ? { type: "solo", input: { ...rider, ...contact } } : null;
  }

  if (body.type === "team") {
    const teamName = readField(registration, "team_name");
    const contact = readContact(registration);
    const riders = registration.riders;

    if (teamName === null || contact === null || !Array.isArray(riders)) {
      return null;
    }

    if (riders.length !== TEAM_SIZE) {
      return null;
    }

    const parsedRiders: PaperRiderInput[] = [];

    for (const rider of riders) {
      const parsed = readRider(rider);

      if (!parsed) {
        return null;
      }

      parsedRiders.push(parsed);
    }

    return {
      type: "team",
      input: { team_name: teamName, ...contact, riders: parsedRiders },
    };
  }

  return null;
};

// ---------------------------------------------------------------------------
// The database function's result, checked before it reaches the browser.

export type PaperCreatedRider = {
  id: string;
  full_name: string;
  email: string;
  confirmation_code: string;
  is_leader: boolean;
};

export type PaperRegistrationResult = {
  type: "solo" | "team";
  registration_id: string;
  team_name: string | null;
  riders: PaperCreatedRider[];
};

const readCreatedRider = (value: unknown): PaperCreatedRider | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { id, full_name, email, confirmation_code, is_leader } = value;

  if (
    typeof id !== "string" ||
    typeof full_name !== "string" ||
    typeof email !== "string" ||
    typeof confirmation_code !== "string"
  ) {
    return null;
  }

  return {
    id,
    full_name,
    email,
    confirmation_code,
    is_leader: is_leader === true,
  };
};

export const parsePaperRegistrationResult = (
  value: unknown
): PaperRegistrationResult | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { type, registration_id, team_name, riders } = value;

  if (
    (type !== "solo" && type !== "team") ||
    typeof registration_id !== "string" ||
    !(team_name === null || team_name === undefined || typeof team_name === "string") ||
    !Array.isArray(riders)
  ) {
    return null;
  }

  const parsedRiders: PaperCreatedRider[] = [];

  for (const rider of riders) {
    const parsed = readCreatedRider(rider);

    if (!parsed) {
      return null;
    }

    parsedRiders.push(parsed);
  }

  if (parsedRiders.length !== (type === "solo" ? 1 : TEAM_SIZE)) {
    return null;
  }

  return {
    type,
    registration_id,
    team_name: typeof team_name === "string" ? team_name : null,
    riders: parsedRiders,
  };
};
