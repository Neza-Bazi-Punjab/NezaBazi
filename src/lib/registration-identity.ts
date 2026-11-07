/* A registration is a rider; the account is the person who entered it.

   An administrator may enter several riders from their own account, so every
   one of those registrations carries the administrator's account id. Only one
   of them, if any, is the account holder's *own*: the one whose email and full
   name are the account's. Photos, the account sync and the account page all
   ask this one question before treating an account's details as a rider's.

   No imports on purpose, so the tests can load it directly. */

export type RiderIdentity = {
  email?: unknown;
  full_name?: unknown;
};

/* Lower-case, trimmed, runs of whitespace collapsed to one space. Anything
   that is not text counts as empty. */
export const normaliseIdentityText = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";

/* True only when the registration's email and full name both equal the
   account's. An empty email or name never matches, so a half-filled account
   can never claim a rider. */
export const isOwnRegistration = (registration: RiderIdentity, account: RiderIdentity) => {
  const email = normaliseIdentityText(registration.email);
  const fullName = normaliseIdentityText(registration.full_name);

  return (
    email !== "" &&
    fullName !== "" &&
    email === normaliseIdentityText(account.email) &&
    fullName === normaliseIdentityText(account.full_name)
  );
};
