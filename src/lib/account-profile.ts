// Whether an account already carries the four rider details every registration
// needs: name, age, location and phone.
//
// Password signup collects all four up front, so those accounts are complete
// the moment they exist. Google sign-in cannot: the provider returns an email,
// a display name and an avatar, and nothing else. A Google account therefore
// arrives missing age, location and phone, and the registration form has to
// collect them rather than render them locked and empty.
//
// Shared by the browser and the server, so it carries no "server-only" import.
export type AccountProfileMetadata = {
  full_name?: unknown;
  age?: unknown;
  location?: unknown;
  phone?: unknown;
};

const hasText = (value: unknown) =>
  typeof value === "string" && value.trim() !== "";

// Deliberately the same bounds syncRegistrationProfileFromUser enforces. If the
// two ever drifted, an account could read as complete here and still be refused
// there, which would lock the rider out of the fields that would fix it.
const hasAge = (value: unknown) => {
  if (value == null || value === "") {
    return false;
  }

  const normalized = String(value).trim();

  if (!/^-?\d+$/.test(normalized)) {
    return false;
  }

  const parsed = Number(normalized);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 120;
};

export const isAccountProfileComplete = (
  metadata: AccountProfileMetadata | null | undefined
) =>
  hasText(metadata?.full_name) &&
  hasText(metadata?.location) &&
  hasText(metadata?.phone) &&
  hasAge(metadata?.age);
