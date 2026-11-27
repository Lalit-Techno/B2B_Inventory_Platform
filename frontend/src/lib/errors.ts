import { ApiError } from "@/lib/api";

/** One readable line for a failed request; validation errors list what is wrong. */
export function errorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong. Try again.";
  if (Array.isArray(e.details) && e.details.every((d) => typeof d === "string") && e.details.length) {
    return e.details.join(". ");
  }
  return e.message;
}
