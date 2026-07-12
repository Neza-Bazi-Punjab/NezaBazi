export const syncAccountRegistrations = async () => {
  try {
    const response = await fetch("/api/account/profile", { method: "POST" });
    const result = (await response.json()) as { error?: string; warnings?: string[] };

    if (!response.ok) {
      console.error("Unable to sync account registration details", result.error);
    } else if (result.warnings && result.warnings.length > 0) {
      console.warn("Some registration details could not be synced", result.warnings);
    }
  } catch (error) {
    console.error("Unable to sync account registration details", error);
  }
};
