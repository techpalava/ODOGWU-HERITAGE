import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STAFF_PREVIEW_CLAIM_KEY,
  normalizeStaffPreviewEntitlement,
  resolveStaffPreviewAuthorization,
  type StaffPreviewEntitlementV1,
  type StaffPreviewTimestamp,
} from "./src/security/staffPreviewEntitlement";
import {
  StaffPreviewEntitlementError,
  createStaffPreviewEntitlementService,
  type StaffPreviewAuthAdmin,
  type StaffPreviewAuthUser,
  type StaffPreviewEntitlementStore,
} from "./src/server/staffPreviewEntitlement";

class TestTimestamp implements StaffPreviewTimestamp {
  constructor(private readonly milliseconds: number) {}
  toMillis() {
    return this.milliseconds;
  }
}

class MemoryEntitlementStore implements StaffPreviewEntitlementStore {
  private values = new Map<string, unknown>();
  private queue = Promise.resolve();

  seed(uid: string, value: unknown) {
    this.values.set(uid, value);
  }

  async read(uid: string) {
    return this.values.get(uid) ?? null;
  }

  async transact(
    uid: string,
    transition: (current: unknown | null) => StaffPreviewEntitlementV1,
  ) {
    let result!: StaffPreviewEntitlementV1;
    const operation = this.queue.then(() => {
      result = transition(this.values.get(uid) ?? null);
      this.values.set(uid, result);
    });
    this.queue = operation.catch(() => undefined);
    await operation;
    return result;
  }
}

class MemoryAuth implements StaffPreviewAuthAdmin {
  readonly users = new Map<string, StaffPreviewAuthUser>();
  readonly revokedUids: string[] = [];
  failNextClaimWrite = false;
  failNextTokenRevocation = false;
  blockActiveClaimWrite: Promise<void> | null = null;
  activeClaimWriteStarted: (() => void) | null = null;

  async getUser(uid: string) {
    const user = this.users.get(uid);
    if (!user) throw new Error("user-not-found");
    return {
      ...user,
      customClaims: { ...(user.customClaims || {}) },
    };
  }

  async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
    if (this.failNextClaimWrite) {
      this.failNextClaimWrite = false;
      throw new Error("claim-write-failed");
    }
    const previewClaim = claims[STAFF_PREVIEW_CLAIM_KEY];
    if (previewClaim && this.blockActiveClaimWrite) {
      this.activeClaimWriteStarted?.();
      await this.blockActiveClaimWrite;
    }
    const user = this.users.get(uid);
    if (!user) throw new Error("user-not-found");
    this.users.set(uid, { ...user, customClaims: { ...claims } });
  }

  async revokeRefreshTokens(uid: string) {
    if (this.failNextTokenRevocation) {
      this.failNextTokenRevocation = false;
      throw new Error("token-revocation-failed");
    }
    this.revokedUids.push(uid);
  }
}

const UID = "preview-staff-uid";

const createHarness = () => {
  const auth = new MemoryAuth();
  auth.users.set(UID, {
    uid: UID,
    customClaims: { admin: true, unrelatedScope: "preserve-me" },
  });
  const store = new MemoryEntitlementStore();
  let tick = Date.parse("2026-08-15T12:00:00.000Z");
  const service = createStaffPreviewEntitlementService({
    auth,
    store,
    now: () => new TestTimestamp((tick += 1_000)),
  });
  return { auth, store, service };
};

const expectCode = async (
  promise: Promise<unknown>,
  code: StaffPreviewEntitlementError["code"],
) => {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof StaffPreviewEntitlementError);
    assert.equal(error.code, code);
    return true;
  });
};

{
  const { auth, store, service } = createHarness();
  const granted = await service.grant(UID);
  assert.equal(granted.status, "complete");
  assert.equal(granted.entitlement.status, "active");
  assert.equal(granted.entitlement.revision, 1);
  const claims = auth.users.get(UID)?.customClaims || {};
  assert.equal(claims.admin, true);
  assert.equal(claims.unrelatedScope, "preserve-me");
  assert.deepEqual(claims[STAFF_PREVIEW_CLAIM_KEY], {
    schemaVersion: 1,
    entitlementRevision: 1,
  });
  const stored = await store.read(UID);
  assert.equal(normalizeStaffPreviewEntitlement(stored).valid, true);
  assert.equal(
    resolveStaffPreviewAuthorization({
      firebaseUid: UID,
      applicationUid: UID,
      isAnonymous: false,
      entitlement: stored,
      claim: claims[STAFF_PREVIEW_CLAIM_KEY],
    }).authorized,
    true,
  );
  const inspection = await service.inspect(UID);
  assert.equal(inspection.authorization.reason, "AUTHORIZED");
  assert.equal(inspection.entitlement?.revision, 1);
  assert.equal(inspection.claim?.entitlementRevision, 1);

  const secondGrant = await service.grant(UID);
  assert.equal(secondGrant.entitlement.revision, 2);
  assert.equal(
    (auth.users.get(UID)?.customClaims?.[STAFF_PREVIEW_CLAIM_KEY] as {
      entitlementRevision: number;
    }).entitlementRevision,
    2,
  );

  const revoked = await service.revoke(UID);
  assert.equal(revoked.status, "complete");
  assert.equal(revoked.entitlement.status, "revoked");
  assert.equal(revoked.entitlement.revision, 3);
  assert.equal(
    STAFF_PREVIEW_CLAIM_KEY in (auth.users.get(UID)?.customClaims || {}),
    false,
  );
  assert.equal(auth.users.get(UID)?.customClaims?.admin, true);
  assert.deepEqual(auth.revokedUids, [UID]);

  const regranted = await service.grant(UID);
  assert.equal(regranted.entitlement.status, "active");
  assert.equal(regranted.entitlement.revision, 4);
}

{
  const { auth, service } = createHarness();
  await service.grant(UID);
  const existing = auth.users.get(UID)!;
  auth.users.set(UID, { ...existing, disabled: true });
  const revoked = await service.revoke(UID);
  assert.equal(revoked.status, "complete");
  assert.equal(revoked.entitlement.status, "revoked");
  assert.equal(
    STAFF_PREVIEW_CLAIM_KEY in (auth.users.get(UID)?.customClaims || {}),
    false,
  );
}

{
  const { auth, service } = createHarness();
  await expectCode(service.grant(""), "INVALID_FIREBASE_UID");
  await expectCode(service.grant("missing-user"), "FIREBASE_USER_NOT_FOUND");
  auth.users.set("disabled-user", { uid: "disabled-user", disabled: true });
  await expectCode(service.grant("disabled-user"), "FIREBASE_USER_DISABLED");
  await expectCode(service.revoke(UID), "ENTITLEMENT_NOT_FOUND");
}

{
  const { store, service } = createHarness();
  store.seed(UID, { schemaVersion: 1, status: "active", revision: 1 });
  await expectCode(service.grant(UID), "ENTITLEMENT_MALFORMED");
  await expectCode(service.reconcile(UID), "ENTITLEMENT_MALFORMED");
}

{
  const { auth, store, service } = createHarness();
  auth.failNextClaimWrite = true;
  const result = await service.grant(UID);
  assert.equal(result.status, "partial_failure");
  assert.deepEqual(result.issues, ["CLAIM_SYNCHRONIZATION_FAILED"]);
  assert.equal((await store.read(UID) as { status: string }).status, "active");
  const decision = resolveStaffPreviewAuthorization({
    firebaseUid: UID,
    applicationUid: UID,
    isAnonymous: false,
    entitlement: await store.read(UID),
    claim: null,
  });
  assert.equal(decision.reason, "CLAIM_MISSING");
  assert.equal(decision.authorized, false);

  const reconciled = await service.reconcile(UID);
  assert.equal(reconciled.status, "complete");
  assert.equal(reconciled.entitlement.revision, 1);
  const reconciledAgain = await service.reconcile(UID);
  assert.equal(reconciledAgain.status, "complete");
  assert.equal(reconciledAgain.entitlement.revision, 1);
}

{
  const { auth, service } = createHarness();
  await service.grant(UID);
  auth.failNextTokenRevocation = true;
  const revoked = await service.revoke(UID);
  assert.equal(revoked.status, "partial_failure");
  assert.deepEqual(revoked.issues, ["TOKEN_REVOCATION_FAILED"]);
  assert.equal(revoked.entitlement.status, "revoked");
  assert.equal(
    STAFF_PREVIEW_CLAIM_KEY in (auth.users.get(UID)?.customClaims || {}),
    false,
  );
}

{
  const { auth, store, service } = createHarness();
  let releaseClaimWrite!: () => void;
  let activeClaimWriteStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    activeClaimWriteStarted = resolve;
  });
  auth.activeClaimWriteStarted = activeClaimWriteStarted;
  auth.blockActiveClaimWrite = new Promise<void>((resolve) => {
    releaseClaimWrite = resolve;
  });

  const staleGrant = service.grant(UID);
  await started;
  auth.blockActiveClaimWrite = null;
  const revoke = await service.revoke(UID);
  releaseClaimWrite();
  const staleGrantResult = await staleGrant;

  assert.equal(revoke.entitlement.status, "revoked");
  assert.equal(revoke.entitlement.revision, 2);
  assert.equal(staleGrantResult.status, "partial_failure");
  assert.ok(
    staleGrantResult.issues.includes(
      "ENTITLEMENT_CHANGED_DURING_SYNCHRONIZATION",
    ),
  );
  const staleClaim = auth.users.get(UID)?.customClaims?.[STAFF_PREVIEW_CLAIM_KEY];
  const decision = resolveStaffPreviewAuthorization({
    firebaseUid: UID,
    applicationUid: UID,
    isAnonymous: false,
    entitlement: await store.read(UID),
    claim: staleClaim ?? null,
  });
  assert.equal(decision.authorized, false);
  assert.equal(decision.reason, "ENTITLEMENT_REVOKED");
}

{
  const active = {
    schemaVersion: 1,
    capability: "design_studio_nine_stage_preview",
    status: "active",
    revision: 7,
    createdAt: new TestTimestamp(1),
    updatedAt: new TestTimestamp(2),
    grantedAt: new TestTimestamp(2),
  };
  const matchingClaim = { schemaVersion: 1, entitlementRevision: 7 };
  assert.equal(
    resolveStaffPreviewAuthorization({
      firebaseUid: UID,
      applicationUid: UID,
      isAnonymous: true,
      entitlement: active,
      claim: matchingClaim,
    }).reason,
    "ANONYMOUS_USER",
  );
  assert.equal(
    resolveStaffPreviewAuthorization({
      firebaseUid: UID,
      applicationUid: "another-uid",
      isAnonymous: false,
      entitlement: active,
      claim: matchingClaim,
    }).reason,
    "APPLICATION_UID_MISMATCH",
  );
  assert.equal(
    resolveStaffPreviewAuthorization({
      firebaseUid: UID,
      applicationUid: UID,
      isAnonymous: false,
      entitlement: active,
      claim: { schemaVersion: 1, entitlementRevision: 6 },
    }).reason,
    "CLAIM_REVISION_MISMATCH",
  );
  assert.equal(
    resolveStaffPreviewAuthorization({
      firebaseUid: UID,
      applicationUid: UID,
      isAnonymous: false,
      entitlement: { ...active, injected: true },
      claim: matchingClaim,
    }).reason,
    "ENTITLEMENT_MALFORMED",
  );
  const revoked = {
    ...active,
    status: "revoked",
    revision: 8,
    updatedAt: new TestTimestamp(3),
    revokedAt: new TestTimestamp(3),
  };
  assert.equal(
    resolveStaffPreviewAuthorization({
      firebaseUid: UID,
      applicationUid: UID,
      isAnonymous: false,
      entitlement: revoked,
      claim: matchingClaim,
    }).reason,
    "ENTITLEMENT_REVOKED",
  );
}

const securitySource = readFileSync(
  "src/security/staffPreviewEntitlement.ts",
  "utf8",
);
const serviceSource = readFileSync(
  "src/server/staffPreviewEntitlement.ts",
  "utf8",
);
const cliSource = readFileSync(
  "src/scripts/manageStaffPreviewEntitlement.ts",
  "utf8",
);
const appSource = readFileSync("src/App.tsx", "utf8");
assert.doesNotMatch(securitySource + serviceSource, /isAllowedAdminEmail|ALLOWED_ADMIN_EMAILS/);
assert.doesNotMatch(
  securitySource + serviceSource + cliSource,
  /gen-lang-client|FIREBASE_ADMIN_PRIVATE_KEY|@gmail\.com/i,
);
assert.match(cliSource, /inspect --project=<projectId> --uid=<firebaseUid>/);
assert.match(cliSource, /--confirm-project=<projectId>/);
assert.match(cliSource, /--confirm-uid=<firebaseUid>/);
assert.doesNotMatch(cliSource, /inspect <firebaseUid>/);
assert.doesNotMatch(appSource, /journeyMode=["{']*future_nine_stage/);

console.log("Staff preview entitlement foundation tests passed.");
