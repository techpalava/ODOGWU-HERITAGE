import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  createAdminFutureOrderV2PersistenceAdapter,
  FutureOrderV2ServerError,
  persistFutureOrderV2ForVerifiedIdentity,
} from "./src/server/futureOrderV2Persistence";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("This authority regression requires the Firestore emulator.");
}

const projectId = "demo-odogwu-future-drafts";
const app = initializeApp({ projectId }, "private-batch-server-authority");
const db = getFirestore(app);
const adapter = createAdminFutureOrderV2PersistenceAdapter(db);
const NOW = new Date("2026-09-12T10:00:00.000Z");

const persist = (uid: string, orderId: string, orderIdentity: any) =>
  persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid, isAnonymous: false },
    request: {
      masterOrder: createFutureOrderV2Fixture(orderId, undefined, orderIdentity),
      customerOwnerUid: uid,
    },
    adapter,
    now: () => NOW,
  });

const expectPrivateDenied = (operation: Promise<unknown>) =>
  assert.rejects(
    operation,
    (error: unknown) =>
      error instanceof FutureOrderV2ServerError &&
      error.code === "PRIVATE_BATCH_UNAUTHORIZED",
  );

try {
  const privateId = "private_server_authority_123456";
  await db.collection("customGroups").doc(privateId).set({
    batchId: privateId,
    visibility: "PRIVATE",
    ownerUid: "user-a",
  });
  await db
    .collection("customGroups")
    .doc(privateId)
    .collection("privateBatchMembers")
    .doc("user-b")
    .set({ groupId: privateId, memberUid: "user-b", role: "member" });

  assert.equal(
    (await persist("user-a", "private-owner-allowed", {
      orderType: "Group Organizer",
      batchId: privateId,
    })).status,
    "created",
  );
  await expectPrivateDenied(
    persist("user-b", "private-owner-rejected", {
      orderType: "Group Organizer",
      batchId: privateId,
    }),
  );
  assert.equal(
    (await persist("user-b", "private-member-allowed", {
      orderType: "Group Member",
      batchId: privateId,
    })).status,
    "created",
  );
  await expectPrivateDenied(
    persist("user-c", "private-member-rejected", {
      orderType: "Group Member",
      batchId: privateId,
    }),
  );

  const publicId = "public_server_authority_123456";
  await db.collection("customGroups").doc(publicId).set({
    batchId: publicId,
    visibility: "PUBLIC",
    ownerUid: "public-owner",
  });
  assert.equal(
    (await persist("public-owner", "public-organizer-allowed", {
      orderType: "Group Organizer",
      batchId: publicId,
    })).status,
    "created",
  );
  assert.equal(
    (await persist("public-member", "public-member-allowed", {
      orderType: "Group Member",
      batchId: publicId,
    })).status,
    "created",
  );
  await expectPrivateDenied(
    persist("not-public-owner", "public-organizer-rejected", {
      orderType: "Group Organizer",
      batchId: publicId,
    }),
  );

  // Visibility is read from the stored group, not request payload/role. The
  // same public Member route becomes PRIVATE and now requires membership.
  await db.collection("customGroups").doc(publicId).update({ visibility: "PRIVATE" });
  await expectPrivateDenied(
    persist("public-member", "visibility-private-member-rejected", {
      orderType: "Group Member",
      batchId: publicId,
    }),
  );
  await assert.rejects(
    persist("user-a", "missing-group", {
      orderType: "Group Organizer",
      batchId: "missing_group_123456",
    }),
    (error: unknown) =>
      error instanceof FutureOrderV2ServerError &&
      error.code === "PRIVATE_BATCH_UNAVAILABLE",
  );
} finally {
  await deleteApp(app);
}

console.log("PASS: real Admin V2 group visibility, organizer, and member authority");
