/* A registration is a rider; the account is the person who entered it.

   An account may enter several riders, so every one of those registrations
   carries the same account id. Only one of them, if any, is the account
   holder's *own*: the one whose email is the account's, and whose full name
   is the account's too. Photos, the account sync and the account page all
   ask this one question before treating an account's details as a rider's.

   Reads may relax the name; writes never do. A read (which photo to show,
   where an admin upload goes, which entry the account page calls "your
   registration", whose code is emailed) may pass `onlyRegistration` when the
   account has entered exactly one registration, so an administrator
   correcting the spelling of a rider's name does not cut them off from it.
   A write onto registration rows (the account sync, the paper claim, moving
   a paper photo onto the account) never does: a parent who does not ride may
   enter their child as the account's only registration under the parent's
   email, and the child's details must not be overwritten with the parent's.
   Rows with no account id (team riders) always need the name.

   No imports on purpose, so the tests can load it directly. */

export type RiderIdentity = {
  email?: unknown;
  full_name?: unknown;
  phone?: unknown;
};

/* Lower-case, trimmed, runs of whitespace collapsed to one space. Anything
   that is not text counts as empty. */
export const normaliseIdentityText = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";

/* True when the registration's email equals the account's and, unless a
   read says this is the account's only registration, its full name does too. An empty email
   or (when required) name never matches, so a half-filled account can never
   claim a rider. */
export const isOwnRegistration = (
  registration: RiderIdentity,
  account: RiderIdentity,
  { onlyRegistration = false }: { onlyRegistration?: boolean } = {}
) => {
  const email = normaliseIdentityText(registration.email);

  if (email === "" || email !== normaliseIdentityText(account.email)) {
    return false;
  }

  if (onlyRegistration) {
    return true;
  }

  const fullName = normaliseIdentityText(registration.full_name);
  return fullName !== "" && fullName === normaliseIdentityText(account.full_name);
};

/* How two phones are compared for a duplicate: by their digits once there are
   enough of them to be a number, otherwise as typed. The same rule as
   phone_digits / paper_registration_phone_key in the database. */
export const phoneDigitsKey = (value: unknown) => {
  const phone = typeof value === "string" ? value : "";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 ? digits : phone.trim().toLowerCase();
};

/* A true duplicate: the same full name with the same email or the same
   phone. Riders may share an email or a phone (a family, a club contact), so
   neither alone is a match. Says which contact matched, or null. The database
   enforces the same rule per table (20261108120000_shared_contact_details). */
export const sameRiderMatch = (
  first: RiderIdentity,
  second: RiderIdentity
): "email" | "phone" | null => {
  const name = normaliseIdentityText(first.full_name);

  if (name === "" || name !== normaliseIdentityText(second.full_name)) {
    return null;
  }

  const email = normaliseIdentityText(first.email);

  if (email !== "" && email === normaliseIdentityText(second.email)) {
    return "email";
  }

  const phone = phoneDigitsKey(first.phone);
  return phone !== "" && phone === phoneDigitsKey(second.phone) ? "phone" : null;
};
