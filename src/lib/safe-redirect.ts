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
