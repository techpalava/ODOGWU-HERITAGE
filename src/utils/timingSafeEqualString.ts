import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for server secrets.
 * Unequal lengths are rejected without throwing or leaking timing via early return
 * that still compares equal-length buffers of the longer length padded safely.
 */
export const timingSafeEqualString = (
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean => {
  if (
    typeof provided !== "string" ||
    typeof expected !== "string" ||
    provided.length === 0 ||
    expected.length === 0
  ) {
    return false;
  }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Compare against self-sized buffers so length differences do not short-circuit
    // in a way that throws; result is always false when lengths differ.
    const padA = Buffer.alloc(Math.max(a.length, b.length));
    const padB = Buffer.alloc(Math.max(a.length, b.length));
    a.copy(padA);
    b.copy(padB);
    timingSafeEqual(padA, padB);
    return false;
  }
  return timingSafeEqual(a, b);
};
