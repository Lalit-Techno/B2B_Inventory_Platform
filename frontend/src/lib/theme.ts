// Tenant branding: hex colour -> CSS variables. Brand colours are used only through these variables.

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever is more readable on `hex`. */
export function readableTextOn(hex: string): "#000000" | "#ffffff" {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#000000") ? "#ffffff" : "#000000";
}

/** Returns style variables for a tenant's primary colour; falls back to the default when invalid. */
export function brandVars(primary: string | undefined): Record<string, string> {
  if (!primary || !/^#[0-9A-Fa-f]{6}$/.test(primary)) return {};
  return { "--brand": primary, "--brand-foreground": readableTextOn(primary) };
}
