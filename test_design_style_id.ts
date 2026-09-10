import assert from "node:assert/strict";
import {
  DESIGN_STYLE_ID_PREFIX,
  DesignStyleIdGenerationError,
  getDesignStyleSequence,
  getNextDesignStyleId,
} from "./src/utils/designStyleId";

assert.equal(DESIGN_STYLE_ID_PREFIX, "ODGH");
assert.equal(getDesignStyleSequence("ODG-042"), 42);
assert.equal(getDesignStyleSequence("odgh-043"), 43);
assert.equal(getDesignStyleSequence("historical-style-1"), null);
assert.equal(getDesignStyleSequence("ODG-000"), null);

assert.equal(getNextDesignStyleId([]), "ODGH-001");
assert.equal(
  getNextDesignStyleId(["ODG-042", "ODGH-009", "historical-style-1"]),
  "ODGH-043",
);

const maxSafeSequence = Number.MAX_SAFE_INTEGER;
assert.equal(
  getNextDesignStyleId([`ODGH-${maxSafeSequence - 1}`]),
  `ODGH-${maxSafeSequence}`,
);
assert.throws(
  () => getNextDesignStyleId([`ODGH-${maxSafeSequence}`]),
  (error: unknown) =>
    error instanceof DesignStyleIdGenerationError &&
    error.code === "SEQUENCE_EXHAUSTED",
);

const unsafeSequenceId = `ODGH-${maxSafeSequence + 1}`;
assert.equal(getDesignStyleSequence(unsafeSequenceId), null);
assert.throws(
  () => getNextDesignStyleId([unsafeSequenceId]),
  (error: unknown) =>
    error instanceof DesignStyleIdGenerationError &&
    error.code === "UNSAFE_EXISTING_SEQUENCE",
  "Unsafe textual IDs must block generation rather than reset to ODGH-001.",
);
assert.throws(
  () => getNextDesignStyleId(["ODGH-001", unsafeSequenceId]),
  DesignStyleIdGenerationError,
);

console.log("PASS: Design Style IDs retain ODG history and generate ODGH IDs");
