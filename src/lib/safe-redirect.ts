const safeRedirectOrigin = "https://neza-bazi.invalid";

export const getSafeRedirect = (value: string | null): string => {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  try {
    const url = new URL(value, safeRedirectOrigin);

    if (url.origin !== safeRedirectOrigin) {
      return "/";
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
};

/* Where a new account lands once signed up. Registration is for
   administrators only after the 2026 championship, so with nowhere better to
   go that is the home page (it used to be /register). */
export const getPostSignupRedirect = (value: string | null): string =>
  getSafeRedirect(value);
