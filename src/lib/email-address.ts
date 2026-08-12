// RFC 5321 caps the local part at 64 characters and a full address at 254.
export const MAX_EMAIL_LENGTH = 254;

// Domain labels exclude "." so a label and the separator can never match the
// same character. The pattern this replaces — /^[^\s@]+@[^\s@]+\.[^\s@]+$/ —
// let them overlap, because [^\s@] matches a dot as well. A dotted address
// with a trailing invalid character then had O(n) split points to retry, each
// costing O(n), so validation went quadratic on attacker-supplied input
// (CodeQL js/polynomial-redos). Disjoint classes make the match deterministic.
const emailPattern = /^[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63})+$/;

export const isValidEmail = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }

  const email = value.trim();

  // Length is checked before the pattern so oversized input is rejected
  // without ever reaching the regex engine.
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) {
    return false;
  }

  return emailPattern.test(email);
};
