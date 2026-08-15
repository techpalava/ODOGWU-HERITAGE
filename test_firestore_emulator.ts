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
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

const PROJECT_ID = "demo-odogwu-future-drafts";
const COLLECTION = "futureDesignStudioDrafts";
const STAFF_PREVIEW_COLLECTION = "staffPreviewEntitlements";
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

const reference = (context: RulesTestContext, ownerUid = OWNER_UID) =>
  doc(context.firestore(), COLLECTION, ownerUid);

const staffPreviewReference = (
  context: RulesTestContext,
  ownerUid = OWNER_UID,
) => doc(context.firestore(), STAFF_PREVIEW_COLLECTION, ownerUid);

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

  assert.equal(passed, 29);
  console.log(`Firestore emulator security matrix passed (${passed}/29).`);
} finally {
  await testEnvironment.cleanup();
}
