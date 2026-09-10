import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  createAdminFutureOrderV2PersistenceAdapter,
  persistFutureOrderV2ForVerifiedIdentity,
} from "./src/server/futureOrderV2Persistence";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const PROJECT_ID = "demo-odogwu-future-order-v2";
const EMULATOR_HOST = "127.0.0.1:8088";
const OWNER_UID = "future-order-owner";
const OTHER_UID = "other-future-order-owner";

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, EMULATOR_HOST);
assert.match(PROJECT_ID, /^demo-/);

const testEnvironment = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    host: "127.0.0.1",
    port: 8088,
    rules: readFileSync("firestore.rules", "utf8"),
  },
});
const adminApp = initializeApp({ projectId: PROJECT_ID }, `future-order-v2-${Date.now()}`);
const adminDb = getAdminFirestore(adminApp);
const adminAdapter = createAdminFutureOrderV2PersistenceAdapter(adminDb);

const signedIn = (uid: string): RulesTestContext =>
  testEnvironment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    firebase: { sign_in_provider: "password" },
  });

const createEnvelope = (orderId: string, ownerUid = OWNER_UID) => {
  const result = createPersistedFutureOrderV2({
    masterOrder: createFutureOrderV2Fixture(orderId),
    owner: { uid: ownerUid, isAnonymous: false },
    customerOwnerUid: ownerUid,
    persistedAt: "2026-09-05T10:00:00.000Z",
  });
  if (result.status !== "valid") throw new Error("Expected a valid V2 envelope.");
  return result.value;
};

const persistAsOwner = (orderId: string, styleName?: string) =>
  persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: {
      masterOrder: createFutureOrderV2Fixture(orderId, styleName),
      customerOwnerUid: OWNER_UID,
    },
    adapter: adminAdapter,
  });

try {
  await testEnvironment.clearFirestore();

  const missingReference = doc(
    signedIn(OWNER_UID).firestore(),
    "orders",
    "client-missing-order",
  );
  await assertFails(getDoc(missingReference));

  const directOrderId = "direct-owner-create";
  const directReference = doc(
    signedIn(OWNER_UID).firestore(),
    "orders",
    directOrderId,
  );
  await assertSucceeds(
    setDoc(directReference, {
      ...createEnvelope(directOrderId),
      persistedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    getDoc(doc(signedIn(OTHER_UID).firestore(), "orders", directOrderId)),
  );
  await assertFails(getDocs(collection(signedIn(OWNER_UID).firestore(), "orders")));
  await assertFails(
    setDoc(
      directReference,
      { paymentStatus: "paid" },
      { merge: true },
    ),
  );

  const created = await persistAsOwner("admin-first-create");
  assert.equal(created.status, "created");
  const adminCreatedSnapshot = await adminDb
    .collection("orders")
    .doc("admin-first-create")
    .get();
  assert.equal(adminCreatedSnapshot.exists, true);
  assert.equal(adminCreatedSnapshot.data()?.ownerUid, OWNER_UID);
  assert.equal(typeof adminCreatedSnapshot.data()?.persistedAt?.toDate, "function");

  const identical = await persistAsOwner("admin-first-create");
  assert.equal(identical.status, "already_persisted");
  const originalAdminValue = adminCreatedSnapshot.data();
  const conflict = await persistAsOwner(
    "admin-first-create",
    "Conflicting immutable style",
  );
  assert.deepEqual(conflict, {
    status: "conflict",
    code: "ORDER_ID_PAYLOAD_CONFLICT",
  });
  assert.deepEqual(
    (await adminDb.collection("orders").doc("admin-first-create").get()).data(),
    originalAdminValue,
  );

  const identicalOrderId = "concurrent-identical";
  const identicalResults = await Promise.all([
    persistAsOwner(identicalOrderId),
    persistAsOwner(identicalOrderId),
  ]);
  assert.deepEqual(
    identicalResults.map((result) => result.status).sort(),
    ["already_persisted", "created"],
  );
  assert.equal(
    (await adminDb.collection("orders").doc(identicalOrderId).get()).exists,
    true,
  );

  const conflictingOrderId = "concurrent-conflict";
  const conflictingResults = await Promise.all([
    persistAsOwner(conflictingOrderId, "Concurrent style A"),
    persistAsOwner(conflictingOrderId, "Concurrent style B"),
  ]);
  assert.equal(
    conflictingResults.filter((result) => result.status === "created").length,
    1,
  );
  assert.equal(
    conflictingResults.filter(
      (result) =>
        result.status === "conflict" &&
        result.code === "ORDER_ID_PAYLOAD_CONFLICT",
    ).length,
    1,
  );
  const winningDocument = (
    await adminDb.collection("orders").doc(conflictingOrderId).get()
  ).data();
  const winningStyle =
    winningDocument?.masterOrder?.cartItem?.candidate?.occurrenceStyleSnapshots?.[0]
      ?.catalogue?.name;
  assert.ok(
    winningStyle === "Concurrent style A" ||
      winningStyle === "Concurrent style B",
  );

  console.log(
    "PASS: isolated emulator proves unchanged client rules and Admin V2 persistence concurrency",
  );
} finally {
  await testEnvironment.cleanup();
  await deleteApp(adminApp);
}
