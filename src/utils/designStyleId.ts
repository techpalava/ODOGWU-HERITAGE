/**
 * New catalogue Design Style identifiers use the ODGH prefix.  The legacy ODG
 * prefix remains a valid persisted identifier; it is deliberately included in
 * sequence discovery so a new ID cannot restart at an ambiguous number.
 */
export const DESIGN_STYLE_ID_PREFIX = "ODGH" as const;

const DESIGN_STYLE_SEQUENCE_ID = /^(?:ODG|ODGH)-(\d+)$/i;

export class DesignStyleIdGenerationError extends Error {
  constructor(
    readonly code: "SEQUENCE_EXHAUSTED" | "UNSAFE_EXISTING_SEQUENCE",
  ) {
    super(
      code === "SEQUENCE_EXHAUSTED"
        ? "Design Style ID sequence has reached its safe integer limit."
        : "An existing Design Style ID has an unsafe numeric sequence.",
    );
    this.name = "DesignStyleIdGenerationError";
  }
}

const hasUnsafeDesignStyleSequence = (id: string): boolean => {
  const match = DESIGN_STYLE_SEQUENCE_ID.exec(id.trim());
  if (!match) return false;
  const sequence = Number(match[1]!);
  return !Number.isSafeInteger(sequence) && /^\d+$/.test(match[1]!);
};

export const getDesignStyleSequence = (id: string): number | null => {
  const match = DESIGN_STYLE_SEQUENCE_ID.exec(id.trim());
  if (!match) return null;
  const sequence = Number.parseInt(match[1]!, 10);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
};

/**
 * Uses the same catalogue-wide client-side allocation model as the existing
 * editor. Firestore remains the final uniqueness authority at publish time.
 */
export const getNextDesignStyleId = (existingIds: readonly string[]): string => {
  if (existingIds.some(hasUnsafeDesignStyleSequence)) {
    throw new DesignStyleIdGenerationError("UNSAFE_EXISTING_SEQUENCE");
  }

  const highestSequence = existingIds.reduce((highest, id) => {
    const sequence = getDesignStyleSequence(id);
    return sequence === null ? highest : Math.max(highest, sequence);
  }, 0);
  if (highestSequence >= Number.MAX_SAFE_INTEGER) {
    throw new DesignStyleIdGenerationError("SEQUENCE_EXHAUSTED");
  }
  const nextSequence = highestSequence + 1;

  return `${DESIGN_STYLE_ID_PREFIX}-${String(nextSequence).padStart(3, "0")}`;
};
