import assert from "node:assert/strict";
import type { CanonicalPhysicalGarmentType } from "./src/types";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import {
  assignCatalogDesignStyleToGarmentOccurrence,
  assignUploadedDesignStyleToGarmentOccurrence,
  clearGarmentDesignStyleAssignment,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  getGarmentScopedDesignStyleAssignment,
  reconcileGarmentScopedDesignStyleAssignmentLedger,
  removeExactGarmentDesignStyleAssignment,
  validateGarmentScopedDesignStyleAssignmentLedger,
  type CatalogDesignStyleAuthorityFacts,
  type CatalogDesignStyleAssignmentInput,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
  type GarmentScopedDesignStyleValidationAuthority,
  type UploadedDesignStyleAssignmentInput,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import {
  createPhysicalGarmentOccurrenceIdentityToken,
  getPhysicalGarmentOccurrenceGeneration,
  reconcilePhysicalGarmentOccurrenceIdentityState,
} from "./src/utils/physicalGarmentOccurrenceIdentity";

const occurrence = (
  garmentKey: string,
  garmentType: CanonicalPhysicalGarmentType,
  occurrenceGeneration: number,
  sourceRole: "main" | "additional" = "main",
): PhysicalGarmentOccurrence => ({
  garmentKey,
  garmentType,
  occurrenceGeneration,
  sourceRole,
  fabricUnits: 1,
});

const targetFor = (
  value: PhysicalGarmentOccurrence,
): GarmentDesignStyleAssignmentTarget => ({
  garmentKey: value.garmentKey,
  occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: value.garmentKey,
    generation: value.occurrenceGeneration!,
  }),
});

const catalogSource = (
  styleId: string,
  eligibilityFingerprint = `${styleId}:eligibility:v1`,
  adaptabilityConfirmationFingerprint?: string,
): CatalogDesignStyleAssignmentInput => ({
  sourceKey: `catalog:${styleId}`,
  catalogStyleId: styleId,
  eligibilityFingerprint,
  ...(adaptabilityConfirmationFingerprint
    ? { adaptabilityConfirmationFingerprint }
    : {}),
});

const eligibleCatalogStyle = (
  styleId: string,
  occurrenceTokens: readonly string[],
  options: {
    eligibilityFingerprint?: string;
    displayRevision?: string;
    availability?: CatalogDesignStyleAuthorityFacts["availability"];
  } = {},
): CatalogDesignStyleAuthorityFacts => ({
  styleId,
  sourceKey: `catalog:${styleId}`,
  availability: options.availability || "available",
  eligibilityFingerprint:
    options.eligibilityFingerprint || `${styleId}:eligibility:v1`,
  displayRevision: options.displayRevision,
  occurrenceEligibilityByToken: Object.fromEntries(
    occurrenceTokens.map((token) => [token, { status: "eligible" as const }]),
  ),
});

const validationAuthority = ({
  styles = [],
  catalogueState = "ready",
  uploadedSourcesByKey = {},
  unresolvedLegacyScalar = false,
}: {
  styles?: readonly CatalogDesignStyleAuthorityFacts[];
  catalogueState?: GarmentScopedDesignStyleValidationAuthority["catalogueState"];
  uploadedSourcesByKey?: GarmentScopedDesignStyleValidationAuthority["uploadedSourcesByKey"];
  unresolvedLegacyScalar?: boolean;
} = {}): GarmentScopedDesignStyleValidationAuthority => ({
  catalogueState,
  catalogStylesById: Object.fromEntries(
    styles.map((style) => [style.styleId, style]),
  ),
  uploadedSourcesByKey,
  unresolvedLegacyScalar,
});

const assignCatalog = ({
  ledger,
  activeOccurrences,
  target,
  styleId,
  eligibilityFingerprint,
  adaptabilityConfirmationFingerprint,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  styleId: string;
  eligibilityFingerprint?: string;
  adaptabilityConfirmationFingerprint?: string;
}): GarmentScopedDesignStyleAssignmentLedgerV2 => {
  const result = assignCatalogDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences,
    target,
    source: catalogSource(
      styleId,
      eligibilityFingerprint,
      adaptabilityConfirmationFingerprint,
    ),
  });
  assert.equal(result.status, "applied");
  return result.ledger;
};

// Single occurrence: one authoritative assignment satisfies the exact set.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const shirtTarget = targetFor(shirt);
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target: shirtTarget,
    styleId: "style-a",
  });
  const validation = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [shirt],
    authority: validationAuthority({
      styles: [eligibleCatalogStyle("style-a", [shirtTarget.occurrenceToken])],
    }),
  });
  assert.equal(validation.status, "complete");
  assert.equal(validation.isComplete, true);
  assert.deepEqual(validation.validOccurrenceTokens, [
    shirtTarget.occurrenceToken,
  ]);
}

// Different styles remain occurrence-specific, and replacement touches one entry.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const skirt = occurrence("base:skirt", "skirt", 2);
  const bumShorts = occurrence("base:bum_shorts", "bum_shorts", 3);
  const active = [shirt, skirt, bumShorts];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(shirt),
    styleId: "style-a",
  });
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(skirt),
    styleId: "style-b",
  });
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(bumShorts),
    styleId: "style-c",
  });
  const shirtBefore = getGarmentScopedDesignStyleAssignment(ledger, shirt.garmentKey);
  const bumShortsBefore = getGarmentScopedDesignStyleAssignment(
    ledger,
    bumShorts.garmentKey,
  );
  const skirtBefore = getGarmentScopedDesignStyleAssignment(ledger, skirt.garmentKey);
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(skirt),
    styleId: "style-d",
  });
  assert.strictEqual(
    getGarmentScopedDesignStyleAssignment(ledger, shirt.garmentKey),
    shirtBefore,
  );
  assert.strictEqual(
    getGarmentScopedDesignStyleAssignment(ledger, bumShorts.garmentKey),
    bumShortsBefore,
  );
  assert.notStrictEqual(
    getGarmentScopedDesignStyleAssignment(ledger, skirt.garmentKey),
    skirtBefore,
  );
  assert.equal(
    getGarmentScopedDesignStyleAssignment(ledger, skirt.garmentKey)
      ?.assignmentRevision,
    2,
  );
}

// One style may be selected independently for two exact occurrences.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const skirt = occurrence("base:skirt", "skirt", 2);
  const active = [shirt, skirt];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(shirt),
    styleId: "style-shared",
  });
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(skirt),
    styleId: "style-shared",
  });
  assert.equal(Object.keys(ledger.assignmentsByGarmentKey).length, 2);
  assert.notEqual(
    ledger.assignmentsByGarmentKey[shirt.garmentKey]?.occurrenceToken,
    ledger.assignmentsByGarmentKey[skirt.garmentKey]?.occurrenceToken,
  );
  const authority = eligibleCatalogStyle("style-shared", [
    targetFor(shirt).occurrenceToken,
    targetFor(skirt).occurrenceToken,
  ]);
  assert.equal(
    validateGarmentScopedDesignStyleAssignmentLedger({
      ledger,
      activeOccurrences: active,
      authority: validationAuthority({ styles: [authority] }),
    }).isComplete,
    true,
  );
}

// Repeated garment types retain independent keys, tokens, replacement, and clear.
{
  const baseShirt = occurrence("base:shirt", "shirt", 1);
  const shirtOne = occurrence("additional:shirt:1", "shirt", 2, "additional");
  const shirtTwo = occurrence("additional:shirt:2", "shirt", 3, "additional");
  const active = [baseShirt, shirtOne, shirtTwo];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  for (const [index, garment] of active.entries()) {
    ledger = assignCatalog({
      ledger,
      activeOccurrences: active,
      target: targetFor(garment),
      styleId: `shirt-style-${index + 1}`,
    });
  }
  const baseBefore = ledger.assignmentsByGarmentKey[baseShirt.garmentKey];
  const shirtTwoBefore = ledger.assignmentsByGarmentKey[shirtTwo.garmentKey];
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(shirtOne),
    styleId: "shirt-style-replacement",
  });
  assert.strictEqual(
    ledger.assignmentsByGarmentKey[baseShirt.garmentKey],
    baseBefore,
  );
  assert.strictEqual(
    ledger.assignmentsByGarmentKey[shirtTwo.garmentKey],
    shirtTwoBefore,
  );
  const cleared = clearGarmentDesignStyleAssignment({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: active,
    target: targetFor(shirtOne),
  });
  assert.equal(cleared.status, "applied");
  assert.equal(
    cleared.ledger.assignmentsByGarmentKey[shirtOne.garmentKey],
    undefined,
  );
  assert.strictEqual(
    cleared.ledger.assignmentsByGarmentKey[baseShirt.garmentKey],
    baseBefore,
  );
  assert.strictEqual(
    cleared.ledger.assignmentsByGarmentKey[shirtTwo.garmentKey],
    shirtTwoBefore,
  );
}

// Adding a garment preserves prior assignments and creates one missing requirement.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const trouser = occurrence(
    "additional:trouser:1",
    "trouser",
    2,
    "additional",
  );
  const shirtTarget = targetFor(shirt);
  const trouserTarget = targetFor(trouser);
  const completeLedger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target: shirtTarget,
    styleId: "style-a",
  });
  const reconciled = reconcileGarmentScopedDesignStyleAssignmentLedger({
    ledger: completeLedger,
    activeOccurrences: [shirt, trouser],
  });
  assert.equal(reconciled.status, "unchanged");
  assert.strictEqual(reconciled.ledger, completeLedger);
  const validation = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger: reconciled.ledger,
    activeOccurrences: [shirt, trouser],
    authority: validationAuthority({
      styles: [eligibleCatalogStyle("style-a", [shirtTarget.occurrenceToken])],
    }),
  });
  assert.equal(validation.status, "incomplete");
  assert.deepEqual(validation.missingOccurrenceTokens, [
    trouserTarget.occurrenceToken,
  ]);
  assert.equal(
    validation.occurrencesByGarmentKey[shirt.garmentKey]?.status,
    "valid",
  );
}

// Exact removal prunes one assignment and leaves survivor identity untouched.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const skirt = occurrence("base:skirt", "skirt", 2);
  const active = [shirt, skirt];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(shirt),
    styleId: "style-a",
  });
  ledger = assignCatalog({
    ledger,
    activeOccurrences: active,
    target: targetFor(skirt),
    styleId: "style-b",
  });
  const shirtAssignment = ledger.assignmentsByGarmentKey[shirt.garmentKey];
  const reconciled = reconcileGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [shirt],
  });
  assert.equal(reconciled.status, "reconciled");
  assert.deepEqual(
    reconciled.removed.map(({ garmentKey, reason }) => ({ garmentKey, reason })),
    [{ garmentKey: skirt.garmentKey, reason: "ORPHANED" }],
  );
  assert.strictEqual(
    reconciled.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    shirtAssignment,
  );
  const removed = removeExactGarmentDesignStyleAssignment({
    ledger,
    expectedLedgerRevision: ledger.revision,
    target: targetFor(skirt),
  });
  assert.equal(removed.status, "applied");
  assert.strictEqual(
    removed.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    shirtAssignment,
  );
  assert.equal(
    removed.ledger.assignmentsByGarmentKey[skirt.garmentKey],
    undefined,
  );
}

// Remove/re-add ABA: the existing identity authority issues a new token.
{
  const garmentKey = "additional:shirt:1";
  const firstIdentity = reconcilePhysicalGarmentOccurrenceIdentityState({
    state: undefined,
    activeGarmentKeys: [garmentKey],
  });
  const generationOne = getPhysicalGarmentOccurrenceGeneration(
    firstIdentity,
    garmentKey,
  )!;
  const firstOccurrence = occurrence(
    garmentKey,
    "shirt",
    generationOne,
    "additional",
  );
  let ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [firstOccurrence],
    target: targetFor(firstOccurrence),
    styleId: "style-old",
  });
  const removedIdentity = reconcilePhysicalGarmentOccurrenceIdentityState({
    state: firstIdentity,
    activeGarmentKeys: [],
  });
  const readdedIdentity = reconcilePhysicalGarmentOccurrenceIdentityState({
    state: removedIdentity,
    activeGarmentKeys: [garmentKey],
  });
  const generationTwo = getPhysicalGarmentOccurrenceGeneration(
    readdedIdentity,
    garmentKey,
  )!;
  assert.ok(generationTwo > generationOne);
  const readdedOccurrence = occurrence(
    garmentKey,
    "shirt",
    generationTwo,
    "additional",
  );
  const staleValidation = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [readdedOccurrence],
    authority: validationAuthority(),
  });
  assert.equal(
    staleValidation.occurrencesByGarmentKey[garmentKey]?.status,
    "stale",
  );
  const replacementBeforeReconciliation =
    assignCatalogDesignStyleToGarmentOccurrence({
      ledger,
      expectedLedgerRevision: ledger.revision,
      activeOccurrences: [readdedOccurrence],
      target: targetFor(readdedOccurrence),
      source: catalogSource("style-new"),
    });
  assert.equal(replacementBeforeReconciliation.status, "rejected");
  if (replacementBeforeReconciliation.status !== "rejected") {
    throw new Error("Expected stale assignment evidence to block replacement.");
  }
  assert.equal(
    replacementBeforeReconciliation.reason,
    "STALE_ASSIGNMENT_PRESENT",
  );
  assert.strictEqual(replacementBeforeReconciliation.ledger, ledger);

  const reconciled = reconcileGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [readdedOccurrence],
  });
  assert.equal(reconciled.status, "reconciled");
  assert.deepEqual(reconciled.removed.map((item) => item.reason), [
    "STALE_OCCURRENCE_TOKEN",
  ]);
  assert.equal(
    reconciled.ledger.assignmentsByGarmentKey[garmentKey],
    undefined,
  );
  assert.equal(
    validateGarmentScopedDesignStyleAssignmentLedger({
      ledger: reconciled.ledger,
      activeOccurrences: [readdedOccurrence],
      authority: validationAuthority(),
    }).occurrencesByGarmentKey[garmentKey]?.status,
    "unassigned",
  );

  const staleCallback = assignCatalogDesignStyleToGarmentOccurrence({
    ledger: reconciled.ledger,
    expectedLedgerRevision: reconciled.ledger.revision,
    activeOccurrences: [readdedOccurrence],
    target: targetFor(firstOccurrence),
    source: catalogSource("style-stale"),
  });
  assert.equal(staleCallback.status, "rejected");
  if (staleCallback.status !== "rejected") {
    throw new Error("Expected the stale assignment callback to be rejected.");
  }
  assert.equal(staleCallback.reason, "OCCURRENCE_TOKEN_MISMATCH");

  ledger = assignCatalog({
    ledger: reconciled.ledger,
    activeOccurrences: [readdedOccurrence],
    target: targetFor(readdedOccurrence),
    styleId: "style-new",
  });
  const staleRemoval = removeExactGarmentDesignStyleAssignment({
    ledger,
    expectedLedgerRevision: ledger.revision,
    target: targetFor(firstOccurrence),
  });
  assert.equal(staleRemoval.status, "rejected");
  if (staleRemoval.status !== "rejected") {
    throw new Error("Expected the stale removal callback to be rejected.");
  }
  assert.equal(staleRemoval.reason, "OCCURRENCE_TOKEN_MISMATCH");
  assert.equal(
    ledger.assignmentsByGarmentKey[garmentKey]?.occurrenceToken,
    targetFor(readdedOccurrence).occurrenceToken,
  );
}

// Stale ledger revisions and wrong tokens fail closed without changing the ledger.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target: targetFor(shirt),
    styleId: "style-a",
  });
  const staleRevision = assignCatalogDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: 0,
    activeOccurrences: [shirt],
    target: targetFor(shirt),
    source: catalogSource("style-b"),
  });
  assert.equal(staleRevision.status, "rejected");
  assert.equal(staleRevision.reason, "STALE_LEDGER_REVISION");
  assert.strictEqual(staleRevision.ledger, ledger);

  const wrongToken = clearGarmentDesignStyleAssignment({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: [shirt],
    target: { ...targetFor(shirt), occurrenceToken: "wrong-token" },
  });
  assert.equal(wrongToken.status, "rejected");
  assert.equal(wrongToken.reason, "OCCURRENCE_TOKEN_MISMATCH");
  assert.strictEqual(wrongToken.ledger, ledger);
}

// Missing and orphan assignments cannot satisfy exact-set completion.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const skirt = occurrence("base:skirt", "skirt", 2);
  const shirtLedger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target: targetFor(shirt),
    styleId: "style-a",
  });
  const result = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger: shirtLedger,
    activeOccurrences: [skirt],
    authority: validationAuthority(),
  });
  assert.equal(result.isComplete, false);
  assert.deepEqual(result.orphanedAssignmentGarmentKeys, [shirt.garmentKey]);
  assert.deepEqual(result.missingOccurrenceTokens, [
    targetFor(skirt).occurrenceToken,
  ]);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "ORPHAN_ASSIGNMENT",
    ),
  );
}

// Eligibility changes require review; cosmetic revisions do not invalidate.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const target = targetFor(shirt);
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target,
    styleId: "style-a",
    eligibilityFingerprint: "eligibility-a",
  });
  const changedEligibility = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [shirt],
    authority: validationAuthority({
      styles: [
        eligibleCatalogStyle("style-a", [target.occurrenceToken], {
          eligibilityFingerprint: "eligibility-b",
        }),
      ],
    }),
  });
  assert.equal(changedEligibility.status, "needs_review");
  assert.equal(
    changedEligibility.occurrencesByGarmentKey[shirt.garmentKey]?.status,
    "needs_review",
  );
  assert.strictEqual(
    changedEligibility.occurrencesByGarmentKey[shirt.garmentKey]?.assignment,
    ledger.assignmentsByGarmentKey[shirt.garmentKey],
  );

  const cosmeticChange = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [shirt],
    authority: validationAuthority({
      styles: [
        eligibleCatalogStyle("style-a", [target.occurrenceToken], {
          eligibilityFingerprint: "eligibility-a",
          displayRevision: "renamed-and-new-image",
        }),
      ],
    }),
  });
  assert.equal(cosmeticChange.status, "complete");
}

// Adaptable assignments retain an exact confirmation fingerprint.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const target = targetFor(shirt);
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target,
    styleId: "style-adaptable",
    eligibilityFingerprint: "eligibility-a",
    adaptabilityConfirmationFingerprint: "confirmation-a",
  });
  const adaptableStyle: CatalogDesignStyleAuthorityFacts = {
    styleId: "style-adaptable",
    sourceKey: "catalog:style-adaptable",
    availability: "available",
    eligibilityFingerprint: "eligibility-a",
    occurrenceEligibilityByToken: {
      [target.occurrenceToken]: {
        status: "adaptable",
        requiredConfirmationFingerprint: "confirmation-b",
      },
    },
  };
  const result = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [shirt],
    authority: validationAuthority({ styles: [adaptableStyle] }),
  });
  assert.equal(result.status, "needs_review");
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "ADAPTABILITY_CONFIRMATION_REQUIRED",
    ),
  );
  const confirmedStyle: CatalogDesignStyleAuthorityFacts = {
    ...adaptableStyle,
    occurrenceEligibilityByToken: {
      [target.occurrenceToken]: {
        status: "adaptable",
        requiredConfirmationFingerprint: "confirmation-a",
      },
    },
  };
  assert.equal(
    validateGarmentScopedDesignStyleAssignmentLedger({
      ledger,
      activeOccurrences: [shirt],
      authority: validationAuthority({ styles: [confirmedStyle] }),
    }).status,
    "complete",
  );
}

// Loading/error preserve catalog evidence while denying completion.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target: targetFor(shirt),
    styleId: "style-a",
  });
  for (const catalogueState of ["loading", "error"] as const) {
    const result = validateGarmentScopedDesignStyleAssignmentLedger({
      ledger,
      activeOccurrences: [shirt],
      authority: validationAuthority({ catalogueState }),
    });
    assert.equal(result.status, "awaiting_validation");
    assert.equal(result.isComplete, false);
    assert.strictEqual(
      result.occurrencesByGarmentKey[shirt.garmentKey]?.assignment,
      ledger.assignmentsByGarmentKey[shirt.garmentKey],
    );
  }
}

// Disabled/unpublished catalog sources remain as evidence but are unavailable.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const target = targetFor(shirt);
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target,
    styleId: "style-a",
  });
  const result = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [shirt],
    authority: validationAuthority({
      styles: [
        eligibleCatalogStyle("style-a", [target.occurrenceToken], {
          availability: "unavailable",
        }),
      ],
    }),
  });
  assert.equal(result.status, "needs_review");
  assert.equal(
    result.occurrencesByGarmentKey[shirt.garmentKey]?.status,
    "unavailable",
  );
  assert.strictEqual(
    result.occurrencesByGarmentKey[shirt.garmentKey]?.assignment,
    ledger.assignmentsByGarmentKey[shirt.garmentKey],
  );
}

// Current authoritative incompatibility is occurrence-specific and fail-closed.
{
  const skirt = occurrence("base:skirt", "skirt", 1);
  const target = targetFor(skirt);
  const ledger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [skirt],
    target,
    styleId: "style-a",
  });
  const incompatibleStyle: CatalogDesignStyleAuthorityFacts = {
    ...eligibleCatalogStyle("style-a", []),
    occurrenceEligibilityByToken: {
      [target.occurrenceToken]: { status: "incompatible" },
    },
  };
  const result = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences: [skirt],
    authority: validationAuthority({ styles: [incompatibleStyle] }),
  });
  assert.equal(result.isComplete, false);
  assert.equal(
    result.occurrencesByGarmentKey[skirt.garmentKey]?.status,
    "incompatible",
  );
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "GARMENT_INCOMPATIBLE",
    ),
  );
}

// Uploaded assignment is occurrence-scoped; confirmation remains injected authority.
{
  const skirt = occurrence("base:skirt", "skirt", 1);
  const target = targetFor(skirt);
  const assigned = assignUploadedDesignStyleToGarmentOccurrence({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    expectedLedgerRevision: 0,
    activeOccurrences: [skirt],
    target,
    source: {
      sourceKey: "uploaded:source-a",
      uploadedSourceRef: "private-upload-reference-a",
    },
  });
  assert.equal(assigned.status, "applied");
  const pendingAuthority = validationAuthority({
    uploadedSourcesByKey: {
      "uploaded:source-a": {
        sourceKey: "uploaded:source-a",
        uploadedSourceRef: "private-upload-reference-a",
        status: "pending",
        eligibleOccurrenceTokens: [target.occurrenceToken],
      },
    },
  });
  assert.equal(
    validateGarmentScopedDesignStyleAssignmentLedger({
      ledger: assigned.ledger,
      activeOccurrences: [skirt],
      authority: pendingAuthority,
    }).status,
    "awaiting_validation",
  );
  const confirmedAuthority: GarmentScopedDesignStyleValidationAuthority = {
    ...pendingAuthority,
    uploadedSourcesByKey: {
      "uploaded:source-a": {
        ...pendingAuthority.uploadedSourcesByKey["uploaded:source-a"]!,
        status: "confirmed",
      },
    },
  };
  assert.equal(
    validateGarmentScopedDesignStyleAssignmentLedger({
      ledger: assigned.ledger,
      activeOccurrences: [skirt],
      authority: confirmedAuthority,
    }).status,
    "complete",
  );
}

// Malformed source shapes and unresolved scalar migration never fall back to V1.
{
  const shirt = occurrence("base:shirt", "shirt", 1);
  const target = targetFor(shirt);
  const validLedger = assignCatalog({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    activeOccurrences: [shirt],
    target,
    styleId: "style-a",
  });
  const malformedLedger = {
    ...validLedger,
    assignmentsByGarmentKey: {
      ...validLedger.assignmentsByGarmentKey,
      [shirt.garmentKey]: {
        ...validLedger.assignmentsByGarmentKey[shirt.garmentKey],
        uploadedSourceRef: "conflicting-source-shape",
      },
    },
  };
  const malformed = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger: malformedLedger,
    activeOccurrences: [shirt],
    authority: validationAuthority(),
  });
  assert.equal(malformed.status, "needs_review");
  assert.ok(
    malformed.diagnostics.some(
      (diagnostic) => diagnostic.code === "INVALID_SOURCE_SHAPE",
    ),
  );

  const conflictingUploadMutation =
    assignUploadedDesignStyleToGarmentOccurrence({
      ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
      expectedLedgerRevision: 0,
      activeOccurrences: [shirt],
      target,
      source: {
        sourceKey: "uploaded:source-a",
        uploadedSourceRef: "private-upload-reference-a",
        catalogStyleId: "style-a",
        eligibilityFingerprint: "eligibility-a",
      } as unknown as UploadedDesignStyleAssignmentInput,
    });
  assert.equal(conflictingUploadMutation.status, "rejected");
  if (conflictingUploadMutation.status !== "rejected") {
    throw new Error("Expected conflicting uploaded source fields to be rejected.");
  }
  assert.equal(
    conflictingUploadMutation.reason,
    "INVALID_SOURCE_IDENTITY",
  );
  assert.equal(conflictingUploadMutation.ledger.revision, 0);

  const migrationReview = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger: validLedger,
    activeOccurrences: [shirt],
    authority: validationAuthority({
      styles: [eligibleCatalogStyle("style-a", [target.occurrenceToken])],
      unresolvedLegacyScalar: true,
    }),
  });
  assert.equal(migrationReview.status, "needs_review");
  assert.equal(migrationReview.isComplete, false);
  assert.ok(
    migrationReview.diagnostics.some(
      (diagnostic) => diagnostic.code === "LEGACY_SCALAR_REVIEW_REQUIRED",
    ),
  );
}

console.log("Garment-scoped Design Style assignment domain tests passed.");
