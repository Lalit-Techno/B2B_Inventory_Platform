const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** GSTIN: format + state code + mod-36 check character. */
export function isGstin(value: string): boolean {
  const v = value.trim().toUpperCase();
  if (!GSTIN_FORMAT.test(v)) return false;
  const state = Number(v.slice(0, 2));
  if (state < 1 || state > 99) return false;

  let total = 0;
  for (let i = 0; i < 14; i++) {
    const n = CHARSET.indexOf(v[i]) * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(n / 36) + (n % 36);
  }
  return CHARSET[(36 - (total % 36)) % 36] === v[14];
}

export const isPan = (v: string) =>
  /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.trim().toUpperCase());

export const isPincode = (v: string) => /^[1-9]\d{5}$/.test(v.trim());

/**
 * Indian mobile number in one canonical form, '+91' + 10 digits, or null if it is not one.
 * Accepts '9876543210', '098765 43210', '91 98765-43210', '+91 (98765) 43210' ...
 * Used for login, uniqueness and storage, so the same number is always the same string.
 */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s().-]/g, '');
  const m = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  return m ? `+91${m[1]}` : null;
}

export const isIndianPhone = (v: string) => normalizePhone(v) !== null;

export const isHexColour = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

/** GSTIN → state code (first 2 chars) and PAN (chars 3-12). */
export const gstinState = (gstin: string) => gstin.slice(0, 2);
export const gstinPan = (gstin: string) => gstin.slice(2, 12);

/** WCAG contrast ratio of a #RRGGBB colour against white (1 to 21). */
export function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}
