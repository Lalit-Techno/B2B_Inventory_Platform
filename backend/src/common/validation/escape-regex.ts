/** Makes user text safe to put inside a RegExp (no injection, no catastrophic patterns from input). */
export const escapeRegex = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
