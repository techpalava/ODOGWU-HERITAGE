import assert from "node:assert/strict";
import { Firestore } from "@google-cloud/firestore";
import {
  PrivateBatchInviteError,
  createPrivateBatchInvite,
  hashPrivateBatchInviteToken,
  redeemPrivateBatchInvite,
  revokePrivateBatchInvite,
  type PrivateBatchCollectionReference,
  type PrivateBatchDocumentReference,
  type PrivateBatchDocumentSnapshot,
  type PrivateBatchInviteStore,
  type PrivateBatchInviteTransaction,
} from "./src/server/privateBatchInvites";
import {
  createPrivateBatchInviteHandler,
  redeemPrivateBatchInviteHandler,
  revokePrivateBatchInviteHandler,
} from "./src/server/privateBatchInviteHttp";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";

const GROUP_ID = "private_batch_123456";
const NOW = new Date("2026-09-12T10:00:00.000Z");
const TOKEN_A = "a".repeat(43);
const TOKEN_B = "b".repeat(43);
const TOKEN_C = "c".repeat(43);
const TOKEN_D = "d".repeat(43);
const TOKEN_E = "e".repeat(43);
const TOKEN_F = "f".repeat(43);

class MemoryReference implements PrivateBatchDocumentReference {
  constructor(
    readonly id: string,
    readonly path: string,
  ) {}

  collection(name: string): PrivateBatchCollectionReference {
    return new MemoryCollection(`${this.path}/${name}`);
  }
}

class MemoryCollection implements PrivateBatchCollectionReference {
  constructor(readonly path: string) {}

  doc(id: string): PrivateBatchDocumentReference {
    return new MemoryReference(id, `${this.path}/${id}`);
  }
}

class MemorySnapshot implements PrivateBatchDocumentSnapshot {
  constructor(
    readonly exists: boolean,
    private readonly value: unknown,
  ) {}

  data(): unknown {
    return this.value;
  }
}

class MemoryStore implements PrivateBatchInviteStore {
  readonly values = new Map<string, Record<string, unknown>>();
  private transactionQueue: Promise<void> = Promise.resolve();

  collection(name: string): PrivateBatchCollectionReference {
    return new MemoryCollection(name);
  }

  private async executeTransaction<T>(
    operation: (transaction: PrivateBatchInviteTransaction) => Promise<T>,
  ): Promise<T> {
    const pendingCreates = new Map<string, Record<string, unknown>>();
    const pendingUpdates = new Map<string, Record<string, unknown>>();
    const read = (reference: PrivateBatchDocumentReference) => {
      const pending = pendingCreates.get((reference as MemoryReference).path);
      const stored = pending || this.values.get((reference as MemoryReference).path);
      return new MemorySnapshot(Boolean(stored), stored ? structuredClone(stored) : null);
    };
    const result = await operation({
      get: async (reference) => read(reference),
      create: (reference, data) => {
        const path = (reference as MemoryReference).path;
        assert.equal(this.values.has(path) || pendingCreates.has(path), false, `duplicate create ${path}`);
        pendingCreates.set(path, structuredClone(data));
      },
      update: (reference, data) => {
        const path = (reference as MemoryReference).path;
        const existing = pendingUpdates.get(path) || {};
        pendingUpdates.set(path, { ...existing, ...structuredClone(data) });
      },
    });
    pendingCreates.forEach((value, path) => this.values.set(path, value));
    pendingUpdates.forEach((patch, path) => {
      const current = this.values.get(path);
      assert.ok(current, `update requires ${path}`);
      this.values.set(path, { ...current, ...patch });
    });
    return result;
  }

  runTransaction<T>(
    operation: (transaction: PrivateBatchInviteTransaction) => Promise<T>,
  ): Promise<T> {
    // This adapter models Firestore's serializable transaction commitment for
    // concurrent security tests instead of letting independent in-memory
    // callbacks race against stale snapshots.
    const scheduled = this.transactionQueue.then(() =>
      this.executeTransaction(operation),
    );
    this.transactionQueue = scheduled.then(
      () => undefined,
      () => undefined,
    );
    return scheduled;
  }

  seed(path: string, value: Record<string, unknown>) {
    this.values.set(path, structuredClone(value));
  }

  value(path: string) {
    return this.values.get(path);
  }
}

/**
 * Simulates Firestore rerunning a transaction callback without committing the
 * first attempt. The clock is advanced between attempts to prove the invite
 * service reads time inside, rather than before, runTransaction.
 */
class RetryOnceStore implements PrivateBatchInviteStore {
  constructor(
    private readonly base: MemoryStore,
    private readonly beforeRetry: () => void,
  ) {}

  collection(name: string): PrivateBatchCollectionReference {
    return this.base.collection(name);
  }

  async runTransaction<T>(
    operation: (transaction: PrivateBatchInviteTransaction) => Promise<T>,
  ): Promise<T> {
    await operation({
      get: async (reference) => {
        const path = (reference as MemoryReference).path;
        const value = this.base.value(path);
        return new MemorySnapshot(Boolean(value), value ? structuredClone(value) : null);
      },
      create: () => undefined,
      update: () => undefined,
    });
    this.beforeRetry();
    return this.base.runTransaction(operation);
  }
}

const groupPath = `customGroups/${GROUP_ID}`;
const invitePath = (token: string) => `privateBatchInvites/${hashPrivateBatchInviteToken(token)}`;
const memberPath = (uid: string) => `${groupPath}/privateBatchMembers/${uid}`;

const store = new MemoryStore();
store.seed(groupPath, {
  schemaVersion: 1,
  batchId: GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "owner-a",
  currentMembers: 1,
  maxParticipants: 3,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});

const issued = await createPrivateBatchInvite({
  store,
  authenticatedUid: "owner-a",
  groupId: GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  now: () => NOW,
  createToken: () => TOKEN_A,
});
assert.equal(issued.inviteToken, TOKEN_A);
assert.equal(store.value(invitePath(TOKEN_A))?.groupId, GROUP_ID);
assert.equal(store.value(invitePath(TOKEN_A))?.inviteToken, undefined);

assert.deepEqual(
  await redeemPrivateBatchInvite({
    store,
    authenticatedUid: "owner-a",
    inviteToken: TOKEN_A,
    now: () => NOW,
  }),
  { status: "ORGANIZER", groupId: GROUP_ID },
);
assert.equal(store.value(invitePath(TOKEN_A))?.redemptionCount, 0);

assert.deepEqual(
  await redeemPrivateBatchInvite({
    store,
    authenticatedUid: "member-a",
    inviteToken: TOKEN_A,
    now: () => NOW,
  }),
  { status: "JOINED", groupId: GROUP_ID },
);
assert.equal(store.value(memberPath("member-a"))?.memberUid, "member-a");
assert.equal(store.value(groupPath)?.currentMembers, 2);
assert.equal(store.value(invitePath(TOKEN_A))?.status, "exhausted");
assert.deepEqual(
  await redeemPrivateBatchInvite({
    store,
    authenticatedUid: "member-a",
    inviteToken: TOKEN_A,
    now: () => NOW,
  }),
  { status: "ALREADY_MEMBER", groupId: GROUP_ID },
);

await assert.rejects(
  () =>
    redeemPrivateBatchInvite({
      store,
      authenticatedUid: "intruder",
      inviteToken: TOKEN_A,
      now: () => NOW,
    }),
  (error: unknown) => error instanceof PrivateBatchInviteError && error.code === "PRIVATE_BATCH_INVITE_INVALID",
);

await createPrivateBatchInvite({
  store,
  authenticatedUid: "owner-a",
  groupId: GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  now: () => NOW,
  createToken: () => TOKEN_B,
});
await revokePrivateBatchInvite({
  store,
  authenticatedUid: "owner-a",
  inviteToken: TOKEN_B,
});
await assert.rejects(
  () =>
    redeemPrivateBatchInvite({
      store,
      authenticatedUid: "member-b",
      inviteToken: TOKEN_B,
      now: () => NOW,
    }),
  (error: unknown) => error instanceof PrivateBatchInviteError && error.code === "PRIVATE_BATCH_INVITE_REVOKED",
);

store.seed(invitePath(TOKEN_C), {
  schemaVersion: 1,
  groupId: GROUP_ID,
  createdByUid: "owner-a",
  createdAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2026-09-11T00:00:00.000Z",
  maxRedemptions: 1,
  redemptionCount: 0,
  status: "active",
});
await assert.rejects(
  () =>
    redeemPrivateBatchInvite({
      store,
      authenticatedUid: "member-c",
      inviteToken: TOKEN_C,
      now: () => NOW,
    }),
  (error: unknown) => error instanceof PrivateBatchInviteError && error.code === "PRIVATE_BATCH_INVITE_EXPIRED",
);

await assert.rejects(
  () =>
    createPrivateBatchInvite({
      store,
      authenticatedUid: "owner-a",
      groupId: GROUP_ID,
      expiresAt: "2026-10-01T00:00:00.000Z",
      maxRedemptions: 2,
      now: () => NOW,
      createToken: () => "d".repeat(43),
    }),
  (error: unknown) => error instanceof PrivateBatchInviteError && error.code === "PRIVATE_BATCH_CAPACITY_REACHED",
);

await assert.rejects(
  () =>
    redeemPrivateBatchInvite({
      store,
      authenticatedUid: "member-x",
      inviteToken: "x".repeat(43),
      now: () => NOW,
    }),
  (error: unknown) => error instanceof PrivateBatchInviteError && error.code === "PRIVATE_BATCH_INVITE_INVALID",
);

// Lifecycle and closing-date checks are resolved inside each authoritative
// transaction, so changing a group after an invite exists cannot leave a
// usable enrollment capability behind.
store.seed(groupPath, {
  schemaVersion: 1,
  batchId: GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "owner-a",
  currentMembers: 1,
  maxParticipants: 3,
  status: "COMPLETED",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
await assert.rejects(
  () => createPrivateBatchInvite({
    store,
    authenticatedUid: "owner-a",
    groupId: GROUP_ID,
    expiresAt: "2026-10-01T00:00:00.000Z",
    now: () => NOW,
    createToken: () => TOKEN_D,
  }),
  (error: unknown) =>
    error instanceof PrivateBatchInviteError &&
    error.code === "PRIVATE_BATCH_NOT_ACCEPTING_MEMBERS",
);
store.seed(groupPath, {
  ...store.value(groupPath),
  status: "LOCKED",
});
await assert.rejects(
  () => createPrivateBatchInvite({
    store,
    authenticatedUid: "owner-a",
    groupId: GROUP_ID,
    expiresAt: "2026-10-01T00:00:00.000Z",
    now: () => NOW,
    createToken: () => TOKEN_D,
  }),
  (error: unknown) =>
    error instanceof PrivateBatchInviteError &&
    error.code === "PRIVATE_BATCH_NOT_ACCEPTING_MEMBERS",
);
store.seed(groupPath, {
  ...store.value(groupPath),
  status: "OPEN",
  closingDate: "2026-09-01",
});
store.seed(invitePath(TOKEN_D), {
  schemaVersion: 1,
  groupId: GROUP_ID,
  createdByUid: "owner-a",
  createdAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2026-10-01T00:00:00.000Z",
  maxRedemptions: 1,
  redemptionCount: 0,
  status: "active",
});
await assert.rejects(
  () => redeemPrivateBatchInvite({
    store,
    authenticatedUid: "member-expired-batch",
    inviteToken: TOKEN_D,
    now: () => NOW,
  }),
  (error: unknown) =>
    error instanceof PrivateBatchInviteError &&
    error.code === "PRIVATE_BATCH_NOT_ACCEPTING_MEMBERS",
);

// The clock must be evaluated inside every transaction callback. A retry that
// occurs after expiry/closing is not allowed to reuse the first attempt's
// valid timestamp.
const retryStore = new MemoryStore();
retryStore.seed(groupPath, {
  schemaVersion: 1,
  batchId: GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "owner-a",
  currentMembers: 1,
  maxParticipants: 3,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
await createPrivateBatchInvite({
  store: retryStore,
  authenticatedUid: "owner-a",
  groupId: GROUP_ID,
  expiresAt: "2026-09-13T00:00:00.000Z",
  now: () => NOW,
  createToken: () => "retry-redemption-token-aaaaaaaaaaaaaaaaaaaaaaaa".slice(0, 43),
});
const retryRedeemToken = "retry-redemption-token-aaaaaaaaaaaaaaaaaaaaaaaa".slice(0, 43);
let retryClock = NOW;
await assert.rejects(
  () =>
    redeemPrivateBatchInvite({
      store: new RetryOnceStore(retryStore, () => {
        retryClock = new Date("2026-10-01T00:00:00.000Z");
      }),
      authenticatedUid: "retry-member",
      inviteToken: retryRedeemToken,
      now: () => retryClock,
    }),
  (error: unknown) =>
    error instanceof PrivateBatchInviteError &&
    error.code === "PRIVATE_BATCH_INVITE_EXPIRED",
);
assert.equal(retryStore.value(memberPath("retry-member")), undefined);

const retryIssueStore = new MemoryStore();
retryIssueStore.seed(groupPath, {
  schemaVersion: 1,
  batchId: GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "owner-a",
  currentMembers: 1,
  maxParticipants: 3,
  status: "OPEN",
  closingDate: "2026-09-12",
  updatedAt: NOW,
});
let issueRetryClock = new Date("2026-09-12T10:00:00.000Z");
await assert.rejects(
  () =>
    createPrivateBatchInvite({
      store: new RetryOnceStore(retryIssueStore, () => {
        issueRetryClock = new Date("2026-09-13T10:00:00.000Z");
      }),
      authenticatedUid: "owner-a",
      groupId: GROUP_ID,
      expiresAt: "2026-10-01T00:00:00.000Z",
      now: () => issueRetryClock,
      createToken: () => "retry-issuance-token-aaaaaaaaaaaaaaaaaaaaaaaaaa".slice(0, 43),
    }),
  (error: unknown) =>
    error instanceof PrivateBatchInviteError &&
    error.code === "PRIVATE_BATCH_NOT_ACCEPTING_MEMBERS",
);

const concurrentStore = new MemoryStore();
concurrentStore.seed(groupPath, {
  schemaVersion: 1,
  batchId: GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "owner-a",
  currentMembers: 1,
  maxParticipants: 2,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
await createPrivateBatchInvite({
  store: concurrentStore,
  authenticatedUid: "owner-a",
  groupId: GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  now: () => NOW,
  createToken: () => TOKEN_E,
});
const concurrentRedemptions = await Promise.allSettled([
  redeemPrivateBatchInvite({
    store: concurrentStore,
    authenticatedUid: "concurrent-member-a",
    inviteToken: TOKEN_E,
    now: () => NOW,
  }),
  redeemPrivateBatchInvite({
    store: concurrentStore,
    authenticatedUid: "concurrent-member-b",
    inviteToken: TOKEN_E,
    now: () => NOW,
  }),
]);
assert.equal(
  concurrentRedemptions.filter((result) => result.status === "fulfilled").length,
  1,
);
assert.equal(concurrentStore.value(groupPath)?.currentMembers, 2);

const raceStore = new MemoryStore();
raceStore.seed(groupPath, {
  schemaVersion: 1,
  batchId: GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "owner-a",
  currentMembers: 1,
  maxParticipants: 3,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
await createPrivateBatchInvite({
  store: raceStore,
  authenticatedUid: "owner-a",
  groupId: GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  now: () => NOW,
  createToken: () => TOKEN_F,
});
const revokeThenRedeem = await Promise.allSettled([
  revokePrivateBatchInvite({
    store: raceStore,
    authenticatedUid: "owner-a",
    inviteToken: TOKEN_F,
  }),
  redeemPrivateBatchInvite({
    store: raceStore,
    authenticatedUid: "race-member",
    inviteToken: TOKEN_F,
    now: () => NOW,
  }),
]);
assert.equal(revokeThenRedeem[0]?.status, "fulfilled");
assert.equal(revokeThenRedeem[1]?.status, "rejected");
assert.equal(raceStore.value(memberPath("race-member")), undefined);

// Production-equivalent contention tests use the Firestore emulator's actual
// transaction/retry implementation, not MemoryStore's serialization queue.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Private Batch invite concurrency tests require the Firestore emulator.");
}
const emulatorDb = new Firestore({ projectId: "demo-odogwu-future-drafts" });
const emulatorStore = {
  collection: (name: string) => emulatorDb.collection(name),
  runTransaction: <T>(
    operation: (transaction: PrivateBatchInviteTransaction) => Promise<T>,
  ) => emulatorDb.runTransaction((transaction) => operation(transaction as unknown as PrivateBatchInviteTransaction)),
} satisfies PrivateBatchInviteStore;
const EMULATOR_GROUP_ID = "private_batch_emulator_123456";
const emulatorGroupPath = `customGroups/${EMULATOR_GROUP_ID}`;
const EMULATOR_CAPACITY_TOKEN_A = "capacity-emulator-a-token-aaaaaaaaaaaaaaaaaaaaaa".slice(0, 43);
const EMULATOR_CAPACITY_TOKEN_B = "capacity-emulator-b-token-bbbbbbbbbbbbbbbbbbbbbb".slice(0, 43);
await emulatorDb.doc(emulatorGroupPath).set({
  schemaVersion: 1,
  batchId: EMULATOR_GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "emulator-owner",
  currentMembers: 1,
  maxParticipants: 2,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
await createPrivateBatchInvite({
  store: emulatorStore,
  authenticatedUid: "emulator-owner",
  groupId: EMULATOR_GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  maxRedemptions: 1,
  now: () => NOW,
  createToken: () => EMULATOR_CAPACITY_TOKEN_A,
});
await createPrivateBatchInvite({
  store: emulatorStore,
  authenticatedUid: "emulator-owner",
  groupId: EMULATOR_GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  maxRedemptions: 1,
  now: () => NOW,
  createToken: () => EMULATOR_CAPACITY_TOKEN_B,
});
const emulatorRedemptions = await Promise.allSettled([
  redeemPrivateBatchInvite({
    store: emulatorStore,
    authenticatedUid: "emulator-member-a",
    inviteToken: EMULATOR_CAPACITY_TOKEN_A,
    now: () => NOW,
  }),
  redeemPrivateBatchInvite({
    store: emulatorStore,
    authenticatedUid: "emulator-member-b",
    inviteToken: EMULATOR_CAPACITY_TOKEN_B,
    now: () => NOW,
  }),
]);
assert.equal(
  emulatorRedemptions.filter((result) => result.status === "fulfilled").length,
  1,
);
const emulatorGroup = await emulatorDb.doc(emulatorGroupPath).get();
assert.equal(emulatorGroup.data()?.currentMembers, 2);
const emulatorMembers = await emulatorDb
  .collection(`${emulatorGroupPath}/privateBatchMembers`)
  .get();
assert.equal(emulatorMembers.size, 1);
const capacityLoser = emulatorRedemptions.find(
  (result): result is PromiseRejectedResult => result.status === "rejected",
);
assert.ok(capacityLoser?.reason instanceof PrivateBatchInviteError);
assert.equal(capacityLoser?.reason.code, "PRIVATE_BATCH_CAPACITY_REACHED");

const EMULATOR_RACE_GROUP_ID = "private_batch_race_123456";
const emulatorRaceGroupPath = `customGroups/${EMULATOR_RACE_GROUP_ID}`;
const EMULATOR_RACE_TOKEN = "revoke-race-emulator-token-aaaaaaaaaaaaaaaaaaaa".slice(0, 43);
await emulatorDb.doc(emulatorRaceGroupPath).set({
  schemaVersion: 1,
  batchId: EMULATOR_RACE_GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "race-owner",
  currentMembers: 1,
  maxParticipants: 3,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
await createPrivateBatchInvite({
  store: emulatorStore,
  authenticatedUid: "race-owner",
  groupId: EMULATOR_RACE_GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  now: () => NOW,
  createToken: () => EMULATOR_RACE_TOKEN,
});
const emulatorRace = await Promise.allSettled([
  revokePrivateBatchInvite({
    store: emulatorStore,
    authenticatedUid: "race-owner",
    inviteToken: EMULATOR_RACE_TOKEN,
  }),
  redeemPrivateBatchInvite({
    store: emulatorStore,
    authenticatedUid: "race-member",
    inviteToken: EMULATOR_RACE_TOKEN,
    now: () => NOW,
  }),
]);
assert.equal(emulatorRace[0]?.status, "fulfilled");
const emulatorRaceMember = await emulatorDb
  .doc(`${emulatorRaceGroupPath}/privateBatchMembers/race-member`)
  .get();
if (emulatorRace[1]?.status === "rejected") {
  assert.equal(emulatorRaceMember.exists, false);
} else {
  // This is the only permitted alternate commit order: redemption committed
  // before the revoke transaction. Its resulting membership is coherent.
  assert.equal(emulatorRaceMember.exists, true);
}
assert.equal(
  (
    await emulatorDb
      .doc(`privateBatchInvites/${hashPrivateBatchInviteToken(EMULATOR_RACE_TOKEN)}`)
      .get()
  ).data()?.status,
  "revoked",
);

// Controlled emulator-backed orderings establish both permitted outcomes.
// Revoke-first must leave every counter and membership untouched.
const REVOKE_WINS_TOKEN = "revoke-wins-emulator-token-aaaaaaaaaaaaaaaaaaaaaa".slice(0, 43);
const EMULATOR_REVOKE_WINS_GROUP_ID = "private_batch_revoke_wins_123456";
const emulatorRevokeWinsPath = `customGroups/${EMULATOR_REVOKE_WINS_GROUP_ID}`;
await emulatorDb.doc(emulatorRevokeWinsPath).set({
  schemaVersion: 1,
  batchId: EMULATOR_REVOKE_WINS_GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "race-owner",
  currentMembers: 1,
  maxParticipants: 3,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
await createPrivateBatchInvite({
  store: emulatorStore,
  authenticatedUid: "race-owner",
  groupId: EMULATOR_REVOKE_WINS_GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  now: () => NOW,
  createToken: () => REVOKE_WINS_TOKEN,
});
await revokePrivateBatchInvite({
  store: emulatorStore,
  authenticatedUid: "race-owner",
  inviteToken: REVOKE_WINS_TOKEN,
});
await assert.rejects(
  redeemPrivateBatchInvite({
    store: emulatorStore,
    authenticatedUid: "revoke-wins-member",
    inviteToken: REVOKE_WINS_TOKEN,
    now: () => NOW,
  }),
  (error: unknown) =>
    error instanceof PrivateBatchInviteError && error.code === "PRIVATE_BATCH_INVITE_REVOKED",
);
assert.equal(
  (await emulatorDb.doc(`${emulatorRevokeWinsPath}/privateBatchMembers/revoke-wins-member`).get()).exists,
  false,
);
assert.equal((await emulatorDb.doc(emulatorRevokeWinsPath).get()).data()?.currentMembers, 1);
assert.equal(
  (await emulatorDb.doc(`privateBatchInvites/${hashPrivateBatchInviteToken(REVOKE_WINS_TOKEN)}`).get())
    .data()?.redemptionCount,
  0,
);

// Redeem-first persists one coherent membership; a later revoke only revokes
// future use and never invents a contradictory counter or deletes the commit.
const REDEEM_WINS_TOKEN = "redeem-wins-emulator-token-bbbbbbbbbbbbbbbbbbbbbb".slice(0, 43);
const EMULATOR_REDEEM_WINS_GROUP_ID = "private_batch_redeem_wins_123456";
const emulatorRedeemWinsPath = `customGroups/${EMULATOR_REDEEM_WINS_GROUP_ID}`;
await emulatorDb.doc(emulatorRedeemWinsPath).set({
  schemaVersion: 1,
  batchId: EMULATOR_REDEEM_WINS_GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "race-owner",
  currentMembers: 1,
  maxParticipants: 3,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
await createPrivateBatchInvite({
  store: emulatorStore,
  authenticatedUid: "race-owner",
  groupId: EMULATOR_REDEEM_WINS_GROUP_ID,
  expiresAt: "2026-10-01T00:00:00.000Z",
  now: () => NOW,
  createToken: () => REDEEM_WINS_TOKEN,
});
assert.deepEqual(
  await redeemPrivateBatchInvite({
    store: emulatorStore,
    authenticatedUid: "redeem-wins-member",
    inviteToken: REDEEM_WINS_TOKEN,
    now: () => NOW,
  }),
  { status: "JOINED", groupId: EMULATOR_REDEEM_WINS_GROUP_ID },
);
await revokePrivateBatchInvite({
  store: emulatorStore,
  authenticatedUid: "race-owner",
  inviteToken: REDEEM_WINS_TOKEN,
});
assert.equal(
  (await emulatorDb.doc(`${emulatorRedeemWinsPath}/privateBatchMembers/redeem-wins-member`).get()).exists,
  true,
);
assert.equal((await emulatorDb.doc(emulatorRedeemWinsPath).get()).data()?.currentMembers, 2);
const redeemWinsInvite = await emulatorDb
  .doc(`privateBatchInvites/${hashPrivateBatchInviteToken(REDEEM_WINS_TOKEN)}`)
  .get();
assert.equal(redeemWinsInvite.data()?.status, "revoked");
assert.equal(redeemWinsInvite.data()?.redemptionCount, 1);

const createResponse = (): {
  response: HttpResponse;
  state: { status: number; headers: Record<string, string>; body: unknown };
} => {
  const state = { status: 200, headers: {} as Record<string, string>, body: null as unknown };
  const response: HttpResponse = {
    status(code) {
      state.status = code;
      return response;
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
      return response;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  return { response, state };
};

const httpRequest = (authorization?: string, body: unknown = {}): HttpRequest => ({
  method: "POST",
  headers: authorization ? { authorization } : {},
  body,
});

const httpStore = new MemoryStore();
httpStore.seed(groupPath, {
  schemaVersion: 1,
  batchId: GROUP_ID,
  visibility: "PRIVATE",
  ownerUid: "owner-a",
  currentMembers: 1,
  maxParticipants: 3,
  status: "OPEN",
  closingDate: "2026-09-30",
  updatedAt: NOW,
});
const logs: string[] = [];
const httpDependencies = {
  getServices: () => ({
    auth: {
      async verifyIdToken(token: string) {
        if (token === "owner-token") {
          return { uid: "owner-a", firebase: { sign_in_provider: "password" } };
        }
        if (token === "member-token") {
          return { uid: "http-member", firebase: { sign_in_provider: "password" } };
        }
        if (token === "intruder-token") {
          return { uid: "http-intruder", firebase: { sign_in_provider: "password" } };
        }
        throw new Error("untrusted token detail");
      },
    },
    db: httpStore,
  }),
  now: () => NOW,
  log: (message: string) => logs.push(message),
};
const issueHandler = createPrivateBatchInviteHandler(httpDependencies);
const redeemHandler = redeemPrivateBatchInviteHandler(httpDependencies);
const revokeHandler = revokePrivateBatchInviteHandler(httpDependencies);
const unauthenticatedIssue = createResponse();
await issueHandler(httpRequest(undefined, { groupId: GROUP_ID }), unauthenticatedIssue.response);
assert.equal(unauthenticatedIssue.state.status, 401);
const spoofedIssue = createResponse();
await issueHandler(
  httpRequest("Bearer intruder-token", {
    groupId: GROUP_ID,
    expiresAt: "2026-10-01T00:00:00.000Z",
    authenticatedUid: "owner-a",
  }),
  spoofedIssue.response,
);
assert.equal(spoofedIssue.state.status, 403);
const issuedHttp = createResponse();
await issueHandler(
  httpRequest("Bearer owner-token", {
    groupId: GROUP_ID,
    expiresAt: "2026-10-01T00:00:00.000Z",
  }),
  issuedHttp.response,
);
assert.equal(issuedHttp.state.status, 201);
const httpInviteToken = (issuedHttp.state.body as { inviteToken: string }).inviteToken;
const unauthenticatedRedeem = createResponse();
await redeemHandler(
  httpRequest(undefined, { inviteToken: httpInviteToken }),
  unauthenticatedRedeem.response,
);
assert.equal(unauthenticatedRedeem.state.status, 401);
const redeemedHttp = createResponse();
await redeemHandler(
  httpRequest("Bearer member-token", { inviteToken: httpInviteToken, uid: "owner-a" }),
  redeemedHttp.response,
);
assert.equal(redeemedHttp.state.status, 200);
const spoofedRevoke = createResponse();
await revokeHandler(
  httpRequest("Bearer intruder-token", { inviteToken: httpInviteToken, ownerUid: "owner-a" }),
  spoofedRevoke.response,
);
assert.equal(spoofedRevoke.state.status, 403);
const ownerRevoke = createResponse();
await revokeHandler(
  httpRequest("Bearer owner-token", { inviteToken: httpInviteToken }),
  ownerRevoke.response,
);
assert.equal(ownerRevoke.state.status, 200);
assert.equal(logs.join(" ").includes(httpInviteToken), false);

console.log("PASS: Private Batch server invite issuance, redemption, revocation, expiry, and capacity");
