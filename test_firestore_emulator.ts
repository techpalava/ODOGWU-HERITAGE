import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";

const PROJECT_ID = "demo-odogwu-future-drafts";
const COLLECTION = "futureDesignStudioDrafts";
const STAFF_PREVIEW_COLLECTION = "staffPreviewEntitlements";
const STYLE_COLLECTION = "styles";
const OWNER_UID = "future-draft-owner";
const OTHER_UID = "different-future-draft-owner";

const testEnvironment = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    host: "127.0.0.1",
    port: 8088,
    rules: readFileSync("firestore.rules", "utf8"),
  },
});

const signedIn = (uid: string): RulesTestContext =>
  testEnvironment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    firebase: { sign_in_provider: "password" },
  });

const anonymous = (): RulesTestContext =>
  testEnvironment.authenticatedContext("anonymous-user", {
    firebase: { sign_in_provider: "anonymous" },
  });

const admin = (): RulesTestContext =>
  testEnvironment.authenticatedContext("design-style-admin", {
    admin: true,
    firebase: { sign_in_provider: "password" },
  });

const reference = (context: RulesTestContext, ownerUid = OWNER_UID) =>
  doc(context.firestore(), COLLECTION, ownerUid);

const staffPreviewReference = (
  context: RulesTestContext,
  ownerUid = OWNER_UID,
) => doc(context.firestore(), STAFF_PREVIEW_COLLECTION, ownerUid);

const styleReference = (
  context: RulesTestContext,
  styleId = "strict-style-1",
) => doc(context.firestore(), STYLE_COLLECTION, styleId);

const validStyleRecord = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: "strict-style-1",
  lifecycle: "published",
  publicRevision: 1,
  eligibilityRevision: 1,
  eligibilityFingerprint: "style-eligibility-v1-test",
  presentation: {
    name: "Strict Style",
    description: "Published through the strict Admin contract.",
    image: "https://example.test/style.webp",
    displayOrder: 1,
    gender: "unisex",
    outfitType: "Senator Set",
    garmentComposition: "2-Piece Set",
    fabricCategory: "Any",
    options: [],
    designCategories: [],
    detectedColors: { main: "", secondary: "" },
    constructionDetails: [],
    customDetailConfiguration: {
      supportedGarmentGroups: ["shirt", "trousers"],
      requiredSelectionGroups: ["shirt_construction"],
      enabled: true,
    },
    includedDesignFeatures: {
      hasMonogram: false,
      hasEmbroidery: false,
      hasMonogramTrimming: false,
    },
    monogramCuffEligible: false,
    embroideryProminence: "standard",
    defaultGarmentDetails: {},
  },
  eligibility: {
    garmentTypes: ["shirt", "trouser"],
    demographics: ["male", "female"],
    adaptability: {
      mode: "exact_only",
      garmentTypes: [],
      demographics: [],
    },
  },
  referenceComposition: {
    status: "known",
    garmentTypes: ["shirt", "trouser"],
  },
  ...overrides,
});

const seedStyle = async (
  record: Record<string, unknown> = validStyleRecord(),
  styleId = "strict-style-1",
) => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(styleReference(context, styleId), record);
  });
};

const validDraft = (overrides: Record<string, unknown> = {}) => ({
  journeySchemaVersion: 1,
  currentStageId: "custom_details",
  currentStep: 4,
  updatedAt: "2026-08-15T10:00:00.000Z",
  ...overrides,
});

const activeCreate = (
  overrides: Record<string, unknown> = {},
  draftOverrides: Record<string, unknown> = {},
) => ({
  schemaVersion: 1,
  lifecycleStatus: "active",
  revision: 1,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  draft: validDraft(draftOverrides),
  ...overrides,
});

const seedRecord = async ({
  ownerUid = OWNER_UID,
  revision = 1,
  lifecycleStatus = "active",
}: {
  ownerUid?: string;
  revision?: number;
  lifecycleStatus?: "active" | "cleared";
} = {}) => {
  const createdAt = Timestamp.fromDate(new Date("2026-08-15T10:00:00.000Z"));
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(reference(context, ownerUid), {
      schemaVersion: 1,
      lifecycleStatus,
      revision,
      createdAt,
      updatedAt: createdAt,
      ...(lifecycleStatus === "active" ? { draft: validDraft() } : {}),
    });
  });
  return createdAt;
};

const seedStaffPreviewEntitlement = async (ownerUid = OWNER_UID) => {
  const timestamp = Timestamp.fromDate(new Date("2026-08-15T10:00:00.000Z"));
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(staffPreviewReference(context, ownerUid), {
      schemaVersion: 1,
      capability: "design_studio_nine_stage_preview",
      status: "active",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      grantedAt: timestamp,
    });
  });
};

const updateEnvelope = ({
  createdAt,
  revision,
  lifecycleStatus = "active",
  updatedAt = serverTimestamp(),
  draft = validDraft(),
}: {
  createdAt: Timestamp;
  revision: unknown;
  lifecycleStatus?: "active" | "cleared" | string;
  updatedAt?: unknown;
  draft?: Record<string, unknown>;
}) => ({
  schemaVersion: 1,
  lifecycleStatus,
  revision,
  createdAt,
  updatedAt,
  ...(lifecycleStatus === "active" ? { draft } : {}),
});

let passed = 0;
const runCase = async (name: string, test: () => Promise<void>) => {
  await testEnvironment.clearFirestore();
  await test();
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")}: ${name}`);
};

try {
  await runCase("unauthenticated and anonymous reads are denied", async () => {
    await seedRecord();
    await assertFails(getDoc(reference(testEnvironment.unauthenticatedContext())));
    await assertFails(getDoc(reference(anonymous())));
  });

  await runCase("unauthenticated create is denied", async () => {
    await assertFails(
      setDoc(reference(testEnvironment.unauthenticatedContext()), activeCreate()),
    );
  });

  await runCase("unauthenticated update is denied", async () => {
    const createdAt = await seedRecord();
    await assertFails(
      setDoc(
        reference(testEnvironment.unauthenticatedContext()),
        updateEnvelope({ createdAt, revision: 2 }),
      ),
    );
  });

  await runCase("unauthenticated delete is denied", async () => {
    await seedRecord();
    await assertFails(
      deleteDoc(reference(testEnvironment.unauthenticatedContext())),
    );
  });

  await runCase("owner can create an active draft", async () => {
    await assertSucceeds(setDoc(reference(signedIn(OWNER_UID)), activeCreate()));
  });

  await runCase("owner can read their own draft", async () => {
    await seedRecord();
    const snapshot = await assertSucceeds(getDoc(reference(signedIn(OWNER_UID))));
    assert.equal(snapshot.exists(), true);
  });

  await runCase("owner can perform an exactly sequential update", async () => {
    const createdAt = await seedRecord();
    await assertSucceeds(
      setDoc(
        reference(signedIn(OWNER_UID)),
        updateEnvelope({ createdAt, revision: 2 }),
      ),
    );
  });

  await runCase("owner can write a cleared tombstone", async () => {
    const createdAt = await seedRecord();
    await assertSucceeds(
      setDoc(
        reference(signedIn(OWNER_UID)),
        updateEnvelope({
          createdAt,
          revision: 2,
          lifecycleStatus: "cleared",
        }),
      ),
    );
  });

  await runCase("cross-owner read is denied", async () => {
    await seedRecord();
    await assertFails(getDoc(reference(signedIn(OTHER_UID))));
  });

  await runCase("cross-owner update and clear are denied", async () => {
    const createdAt = await seedRecord();
    await assertFails(
      setDoc(
        reference(signedIn(OTHER_UID)),
        updateEnvelope({ createdAt, revision: 2 }),
      ),
    );
    await assertFails(
      setDoc(
        reference(signedIn(OTHER_UID)),
        updateEnvelope({
          createdAt,
          revision: 2,
          lifecycleStatus: "cleared",
        }),
      ),
    );
  });

  await runCase("user cannot create under another UID", async () => {
    await assertFails(
      setDoc(reference(signedIn(OTHER_UID), OWNER_UID), activeCreate()),
    );
  });

  await runCase("document deletion is denied to its owner", async () => {
    await seedRecord();
    await assertFails(deleteDoc(reference(signedIn(OWNER_UID))));
  });

  await runCase("unsupported schema version is denied", async () => {
    await assertFails(
      setDoc(reference(signedIn(OWNER_UID)), activeCreate({ schemaVersion: 2 })),
    );
  });

  await runCase("invalid lifecycle status is denied", async () => {
    await assertFails(
      setDoc(
        reference(signedIn(OWNER_UID)),
        activeCreate({ lifecycleStatus: "archived" }),
      ),
    );
  });

  await runCase("unexpected top-level envelope fields are denied", async () => {
    await assertFails(
      setDoc(
        reference(signedIn(OWNER_UID)),
        activeCreate({ injectedOwnerUid: OTHER_UID }),
      ),
    );
  });

  await runCase("create timestamps use request time and createdAt is immutable", async () => {
    const fixed = Timestamp.fromDate(new Date("2025-01-01T00:00:00.000Z"));
    await assertFails(
      setDoc(
        reference(signedIn(OWNER_UID)),
        activeCreate({ createdAt: fixed }),
      ),
    );
    const createdAt = await seedRecord();
    await assertFails(
      setDoc(
        reference(signedIn(OWNER_UID)),
        updateEnvelope({ createdAt: fixed, revision: 2 }),
      ),
    );
    assert.notEqual(createdAt.toMillis(), fixed.toMillis());
  });

  await runCase("updatedAt must equal request time on create and update", async () => {
    const fixed = Timestamp.fromDate(new Date("2025-01-01T00:00:00.000Z"));
    await assertFails(
      setDoc(
        reference(signedIn(OWNER_UID)),
        activeCreate({ updatedAt: fixed }),
      ),
    );
    const createdAt = await seedRecord();
    await assertFails(
      setDoc(
        reference(signedIn(OWNER_UID)),
        updateEnvelope({ createdAt, revision: 2, updatedAt: fixed }),
      ),
    );
  });

  await runCase("initial revision must be exactly one", async () => {
    await assertFails(
      setDoc(reference(signedIn(OWNER_UID)), activeCreate({ revision: 0 })),
    );
    await assertFails(
      setDoc(reference(signedIn(OWNER_UID)), activeCreate({ revision: 2 })),
    );
  });

  await runCase("updates require revision to increase by exactly one", async () => {
    const createdAt = await seedRecord({ revision: 4 });
    await assertSucceeds(
      setDoc(
        reference(signedIn(OWNER_UID)),
        updateEnvelope({ createdAt, revision: 5 }),
      ),
    );
  });

  await runCase("malformed revisions are denied", async () => {
    const invalidRevisions: unknown[] = [1, 3, 0, -1, "2", 2.5, null];
    for (const revision of invalidRevisions) {
      await testEnvironment.clearFirestore();
      const createdAt = await seedRecord();
      await assertFails(
        setDoc(
          reference(signedIn(OWNER_UID)),
          updateEnvelope({ createdAt, revision }),
        ),
      );
    }
  });

  await runCase("active records require an approved normalized draft marker", async () => {
    await assertFails(
      setDoc(reference(signedIn(OWNER_UID)), activeCreate({}, {
        journeySchemaVersion: 2,
      })),
    );
    await assertFails(
      setDoc(reference(signedIn(OWNER_UID)), activeCreate({}, {
        currentStageId: "unknown_stage",
      })),
    );
    await assertFails(
      setDoc(reference(signedIn(OWNER_UID)), activeCreate({ draft: {} })),
    );
  });

  await runCase("cleared records must not retain a draft payload", async () => {
    const createdAt = await seedRecord();
    await assertFails(
      setDoc(reference(signedIn(OWNER_UID)), {
        ...updateEnvelope({
          createdAt,
          revision: 2,
          lifecycleStatus: "cleared",
        }),
        draft: validDraft(),
      }),
    );
  });

  await runCase("client owner fields cannot redirect path ownership", async () => {
    await assertSucceeds(
      setDoc(
        reference(signedIn(OWNER_UID)),
        activeCreate({}, { ownerUid: OTHER_UID }),
      ),
    );
    await assertFails(getDoc(reference(signedIn(OTHER_UID), OWNER_UID)));
  });

  await runCase("owner can read only their staff preview entitlement", async () => {
    await seedStaffPreviewEntitlement();
    const snapshot = await assertSucceeds(
      getDoc(staffPreviewReference(signedIn(OWNER_UID))),
    );
    assert.equal(snapshot.exists(), true);
    await assertFails(
      getDoc(staffPreviewReference(signedIn(OTHER_UID), OWNER_UID)),
    );
    await assertFails(
      getDoc(
        staffPreviewReference(
          testEnvironment.authenticatedContext(OTHER_UID, {
            admin: true,
            firebase: { sign_in_provider: "password" },
          }),
          OWNER_UID,
        ),
      ),
    );
  });

  await runCase("anonymous and signed-out entitlement reads are denied", async () => {
    await seedStaffPreviewEntitlement();
    await assertFails(
      getDoc(staffPreviewReference(testEnvironment.unauthenticatedContext())),
    );
    await assertFails(getDoc(staffPreviewReference(anonymous())));
  });

  await runCase("staff preview entitlement listing is denied", async () => {
    await seedStaffPreviewEntitlement();
    await assertFails(
      getDocs(
        collection(
          signedIn(OWNER_UID).firestore(),
          STAFF_PREVIEW_COLLECTION,
        ),
      ),
    );
  });

  await runCase("owner cannot create a staff preview entitlement", async () => {
    const timestamp = Timestamp.fromDate(new Date("2026-08-15T10:00:00.000Z"));
    await assertFails(
      setDoc(staffPreviewReference(signedIn(OWNER_UID)), {
        schemaVersion: 1,
        capability: "design_studio_nine_stage_preview",
        status: "active",
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        grantedAt: timestamp,
      }),
    );
  });

  await runCase("owner cannot update, revoke, or delete an entitlement", async () => {
    await seedStaffPreviewEntitlement();
    const ownerReference = staffPreviewReference(signedIn(OWNER_UID));
    await assertFails(setDoc(ownerReference, { status: "revoked" }, { merge: true }));
    await assertFails(deleteDoc(ownerReference));
  });

  await runCase("public reads are limited to valid published Design Styles", async () => {
    await seedStyle();
    await seedStyle(
      validStyleRecord({
        id: "draft-style-1",
        lifecycle: "draft",
      }),
      "draft-style-1",
    );
    const unauthenticated = testEnvironment.unauthenticatedContext();
    await assertSucceeds(getDoc(styleReference(unauthenticated)));
    await assertFails(getDoc(styleReference(unauthenticated, "draft-style-1")));
    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(unauthenticated.firestore(), STYLE_COLLECTION),
          where("schemaVersion", "==", 1),
          where("lifecycle", "==", "published"),
        ),
      ),
    );
    assert.deepEqual(snapshot.docs.map((item) => item.id), ["strict-style-1"]);
  });

  await runCase("unbounded public Design Style listing is denied", async () => {
    await seedStyle();
    await assertFails(
      getDocs(
        collection(
          testEnvironment.unauthenticatedContext().firestore(),
          STYLE_COLLECTION,
        ),
      ),
    );
    await assertSucceeds(
      getDocs(collection(admin().firestore(), STYLE_COLLECTION)),
    );
  });

  await runCase("anonymous and non-admin Design Style writes are denied", async () => {
    await assertFails(
      setDoc(
        styleReference(testEnvironment.unauthenticatedContext()),
        validStyleRecord(),
      ),
    );
    await assertFails(setDoc(styleReference(anonymous()), validStyleRecord()));
    await assertFails(
      setDoc(styleReference(signedIn(OWNER_UID)), validStyleRecord()),
    );
  });

  await runCase("admin can create a strict Design Style record", async () => {
    await assertSucceeds(setDoc(styleReference(admin()), validStyleRecord()));
    const snapshot = await assertSucceeds(getDoc(styleReference(admin())));
    assert.equal(snapshot.data()?.lifecycle, "published");
  });

  await runCase("admin cannot write malformed, unknown, or mismatched style data", async () => {
    await assertFails(
      setDoc(
        styleReference(admin()),
        validStyleRecord({ id: "different-style-id" }),
      ),
    );
    await assertFails(
      setDoc(
        styleReference(admin()),
        validStyleRecord({ lifecycle: "deleted" }),
      ),
    );
    await assertFails(
      setDoc(
        styleReference(admin()),
        validStyleRecord({ injectedPrivateField: "unsafe" }),
      ),
    );
  });

  await runCase("Design Style updates enforce public and eligibility revisions", async () => {
    await seedStyle();
    const adminReference = styleReference(admin());
    await assertSucceeds(
      setDoc(
        adminReference,
        validStyleRecord({
          publicRevision: 2,
          presentation: {
            ...(validStyleRecord().presentation as Record<string, unknown>),
            name: "Cosmetic Rename",
          },
        }),
      ),
    );
    await assertFails(
      setDoc(
        adminReference,
        validStyleRecord({ publicRevision: 2 }),
      ),
    );
    await assertFails(
      setDoc(
        adminReference,
        validStyleRecord({
          publicRevision: 3,
          eligibility: {
            ...(validStyleRecord().eligibility as Record<string, unknown>),
            garmentTypes: ["dress"],
          },
        }),
      ),
    );
    await assertSucceeds(
      setDoc(
        adminReference,
        validStyleRecord({
          publicRevision: 3,
          eligibilityRevision: 2,
          eligibilityFingerprint: "style-eligibility-v1-updated",
          eligibility: {
            ...(validStyleRecord().eligibility as Record<string, unknown>),
            garmentTypes: ["dress"],
          },
        }),
      ),
    );
  });

  await runCase("admin can explicitly migrate a valid legacy style", async () => {
    await seedStyle(
      {
        id: "strict-style-1",
        name: "Legacy Style",
        fabricCapacityComposition: [
          { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
        ],
      },
      "strict-style-1",
    );
    await assertSucceeds(setDoc(styleReference(admin()), validStyleRecord()));
    await seedStyle(
      {
        id: "malformed-legacy-style",
        name: "Malformed legacy style",
      },
      "malformed-legacy-style",
    );
    await assertFails(
      setDoc(
        styleReference(admin(), "malformed-legacy-style"),
        validStyleRecord({ id: "malformed-legacy-style" }),
      ),
    );
    await seedStyle(
      {
        schemaVersion: 1,
        id: "malformed-v1-style",
        fabricCapacityComposition: [
          { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
        ],
      },
      "malformed-v1-style",
    );
    await assertFails(
      setDoc(
        styleReference(admin(), "malformed-v1-style"),
        validStyleRecord({ id: "malformed-v1-style" }),
      ),
    );
  });

  await runCase("Design Style hard deletion is denied even to admin", async () => {
    await seedStyle();
    await assertFails(deleteDoc(styleReference(admin())));
    const snapshot = await assertSucceeds(getDoc(styleReference(admin())));
    assert.equal(snapshot.exists(), true);
  });

  await runCase("representative unrelated collection rules are unchanged", async () => {
    const publicFabric = doc(
      testEnvironment.unauthenticatedContext().firestore(),
      "fabrics",
      "public-fabric",
    );
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "fabrics", "public-fabric"), {
        name: "Public fabric",
      });
    });
    await assertSucceeds(getDoc(publicFabric));
    await assertFails(setDoc(publicFabric, { name: "Tampered fabric" }));
  });

  assert.equal(passed, 37);
  console.log(`Firestore emulator security matrix passed (${passed}/37).`);
} finally {
  await testEnvironment.cleanup();
}
