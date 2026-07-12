export const escapeIlikePattern = (value: string) =>
  value.replace(/[\\%_*]/g, (character) => `\\${character}`);
