import { createHash, randomBytes } from "node:crypto";
import { parseBatchDateBoundary } from "../utils/batchDateRange.js";
import {
  normalizeBatchStatus,
  REGISTRATION_OPEN_STATUSES,
} from "../utils/batchStatus.js";

export const PRIVATE_BATCH_INVITES_COLLECTION = "privateBatchInvites";

export type PrivateBatchInviteErrorCode =
  | "PRIVATE_BATCH_AUTH_REQUIRED"
  | "PRIVATE_BATCH_NOT_FOUND"
  | "PRIVATE_BATCH_OWNER_REQUIRED"
  | "PRIVATE_BATCH_INVITE_INVALID"
  | "PRIVATE_BATCH_INVITE_EXPIRED"
  | "PRIVATE_BATCH_INVITE_REVOKED"
  | "PRIVATE_BATCH_NOT_ACCEPTING_MEMBERS"
  | "PRIVATE_BATCH_CAPACITY_REACHED"
  | "PRIVATE_BATCH_MEMBERSHIP_INVALID";

export class PrivateBatchInviteError extends Error {
  readonly code: PrivateBatchInviteErrorCode;

  constructor(code: PrivateBatchInviteErrorCode, message: string) {
    super(message);
    this.name = "PrivateBatchInviteError";
    this.code = code;
  }
}

export interface PrivateBatchDocumentReference {
  readonly id: string;
  collection(name: string): PrivateBatchCollectionReference;
}

export interface PrivateBatchCollectionReference {
  doc(id: string): PrivateBatchDocumentReference;
}

export interface PrivateBatchDocumentSnapshot {
  readonly exists: boolean;
  data(): unknown;
}

export interface PrivateBatchInviteTransaction {
  get(reference: PrivateBatchDocumentReference): Promise<PrivateBatchDocumentSnapshot>;
  create(reference: PrivateBatchDocumentReference, data: Record<string, unknown>): void;
  update(reference: PrivateBatchDocumentReference, data: Record<string, unknown>): void;
}

export interface PrivateBatchInviteStore {
  collection(name: string): PrivateBatchCollectionReference;
  runTransaction<T>(
    operation: (transaction: PrivateBatchInviteTransaction) => Promise<T>,
  ): Promise<T>;
}

type InviteStatus = "active" | "revoked" | "exhausted";

interface PrivateBatchInviteRecord {
  readonly schemaVersion: 1;
  readonly groupId: string;
  readonly createdByUid: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly maxRedemptions: number;
  readonly redemptionCount: number;
  readonly status: InviteStatus;
}

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isSafeId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);

const parseFutureIso = (value: unknown, now: Date): string => {
  if (!hasText(value)) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_INVITE_INVALID",
      "An invite expiry time is required.",
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime()) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_INVITE_INVALID",
      "Invite expiry must be in the future.",
    );
  }
  return date.toISOString();
};

const parsePositiveInteger = (value: unknown, message: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new PrivateBatchInviteError("PRIVATE_BATCH_INVITE_INVALID", message);
  }
  return Number(value);
};

export const hashPrivateBatchInviteToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const generatePrivateBatchInviteToken = (): string =>
  randomBytes(32).toString("base64url");

const readGroup = (
  snapshot: PrivateBatchDocumentSnapshot,
  expectedGroupId: string,
): Record<string, unknown> => {
  const group = snapshot.exists ? snapshot.data() : null;
  if (
    !isRecord(group) ||
    group.visibility !== "PRIVATE" ||
    group.batchId !== expectedGroupId ||
    !isSafeId(group.batchId)
  ) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_NOT_FOUND",
      "The Private Batch is unavailable.",
    );
  }
  return group;
};

const readInvite = (snapshot: PrivateBatchDocumentSnapshot): PrivateBatchInviteRecord => {
  const invite = snapshot.exists ? snapshot.data() : null;
  if (
    !isRecord(invite) ||
    invite.schemaVersion !== 1 ||
    !isSafeId(invite.groupId) ||
    !hasText(invite.createdByUid) ||
    !hasText(invite.createdAt) ||
    !hasText(invite.expiresAt) ||
    !Number.isSafeInteger(invite.maxRedemptions) ||
    Number(invite.maxRedemptions) < 1 ||
    !Number.isSafeInteger(invite.redemptionCount) ||
    Number(invite.redemptionCount) < 0 ||
    !["active", "revoked", "exhausted"].includes(String(invite.status))
  ) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_INVITE_INVALID",
      "The Private Batch invitation is invalid.",
    );
  }
  return invite as unknown as PrivateBatchInviteRecord;
};

const requireAuthenticatedUid = (uid: string): void => {
  if (!hasText(uid)) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_AUTH_REQUIRED",
      "Firebase authentication is required.",
    );
  }
};

const requireOwner = (group: Record<string, unknown>, uid: string): void => {
  if (group.ownerUid !== uid) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_OWNER_REQUIRED",
      "Only the Private Batch organizer can manage invitations.",
    );
  }
};

// Keep invite eligibility aligned with the repository's normalized batch
// lifecycle and Nigeria-business-day closing-date semantics. A malformed or
// missing deadline fails closed rather than creating a permanent invite path.
const requireBatchAcceptsMembers = (
  group: Record<string, unknown>,
  currentTime: Date,
): void => {
  const normalizedStatus = normalizeBatchStatus(
    typeof group.status === "string" ? group.status : "",
  );
  const closingDate =
    typeof group.closingDate === "string"
      ? parseBatchDateBoundary(group.closingDate, "end")
      : null;
  if (
    !REGISTRATION_OPEN_STATUSES.includes(normalizedStatus as never) ||
    !closingDate ||
    currentTime > closingDate
  ) {
    throw new PrivateBatchInviteError(
      "PRIVATE_BATCH_NOT_ACCEPTING_MEMBERS",
      "This Private Batch is not accepting new members.",
    );
  }
};

const groupReference = (store: PrivateBatchInviteStore, groupId: string) =>
  store.collection("customGroups").doc(groupId);

const membershipReference = (
  store: PrivateBatchInviteStore,
  groupId: string,
  uid: string,
) => groupReference(store, groupId).collection("privateBatchMembers").doc(uid);

const inviteReference = (store: PrivateBatchInviteStore, token: string) =>
  store.collection(PRIVATE_BATCH_INVITES_COLLECTION).doc(hashPrivateBatchInviteToken(token));

export const createPrivateBatchInvite = async ({
  store,
  authenticatedUid,
  groupId,
  expiresAt,
  maxRedemptions = 1,
  now = () => new Date(),
  createToken = generatePrivateBatchInviteToken,
}: {
  store: PrivateBatchInviteStore;
  authenticatedUid: string;
  groupId: string;
  expiresAt: string;
  maxRedemptions?: number;
  now?: () => Date;
  createToken?: () => string;
}): Promise<Readonly<{ inviteToken: string; groupId: string; expiresAt: string }>> => {
  requireAuthenticatedUid(authenticatedUid);
  if (!isSafeId(groupId)) {
    throw new PrivateBatchInviteError("PRIVATE_BATCH_NOT_FOUND", "The Private Batch is unavailable.");
  }
  const normalizedMaxRedemptions = parsePositiveInteger(
    maxRedemptions,
    "Invite redemption capacity must be at least one.",
  );
  const inviteToken = createToken();
  if (!hasText(inviteToken) || inviteToken.length < 43) {
    throw new PrivateBatchInviteError("PRIVATE_BATCH_INVITE_INVALID", "A secure invite token is required.");
  }

  let normalizedExpiry = "";
  await store.runTransaction(async (transaction) => {
    const group = readGroup(
      await transaction.get(groupReference(store, groupId)),
      groupId,
    );
    // Firestore may retry this callback. Obtain the clock inside the attempt
    // so a delayed retry cannot issue an invite for a batch that has closed.
    const currentTime = now();
    normalizedExpiry = parseFutureIso(expiresAt, currentTime);
    requireOwner(group, authenticatedUid);
    requireBatchAcceptsMembers(group, currentTime);
    const currentMembers = parsePositiveInteger(
      group.currentMembers,
      "The Private Batch member count is invalid.",
    );
    const maxParticipants = parsePositiveInteger(
      group.maxParticipants,
      "The Private Batch capacity is invalid.",
    );
    if (currentMembers >= maxParticipants || normalizedMaxRedemptions > maxParticipants - currentMembers) {
      throw new PrivateBatchInviteError(
        "PRIVATE_BATCH_CAPACITY_REACHED",
        "The Private Batch does not have enough remaining capacity for this invitation.",
      );
    }
    transaction.create(inviteReference(store, inviteToken), {
      schemaVersion: 1,
      groupId,
      createdByUid: authenticatedUid,
      createdAt: currentTime.toISOString(),
      expiresAt: normalizedExpiry,
      maxRedemptions: normalizedMaxRedemptions,
      redemptionCount: 0,
      status: "active",
    } satisfies PrivateBatchInviteRecord);
  });
  return { inviteToken, groupId, expiresAt: normalizedExpiry };
};

export const redeemPrivateBatchInvite = async ({
  store,
  authenticatedUid,
  inviteToken,
  now = () => new Date(),
}: {
  store: PrivateBatchInviteStore;
  authenticatedUid: string;
  inviteToken: string;
  now?: () => Date;
}): Promise<
  Readonly<{
    status: "ORGANIZER" | "JOINED" | "ALREADY_MEMBER";
    groupId: string;
  }>
> => {
  requireAuthenticatedUid(authenticatedUid);
  if (!hasText(inviteToken) || inviteToken.length < 43) {
    throw new PrivateBatchInviteError("PRIVATE_BATCH_INVITE_INVALID", "The invitation is invalid.");
  }
  return store.runTransaction(async (transaction) => {
    const invite = readInvite(await transaction.get(inviteReference(store, inviteToken)));
    const group = readGroup(
      await transaction.get(groupReference(store, invite.groupId)),
      invite.groupId,
    );
    // This is intentionally after every authoritative read and inside the
    // callback. A retried transaction obtains a fresh deadline decision.
    const currentTime = now();
    if (invite.status === "revoked") {
      throw new PrivateBatchInviteError("PRIVATE_BATCH_INVITE_REVOKED", "This invitation has been revoked.");
    }
    if (new Date(invite.expiresAt).getTime() <= currentTime.getTime()) {
      throw new PrivateBatchInviteError("PRIVATE_BATCH_INVITE_EXPIRED", "This invitation has expired.");
    }
    if (group.ownerUid === authenticatedUid) {
      requireBatchAcceptsMembers(group, currentTime);
      return { status: "ORGANIZER" as const, groupId: invite.groupId };
    }

    const memberReference = membershipReference(store, invite.groupId, authenticatedUid);
    const existingMember = await transaction.get(memberReference);
    if (existingMember.exists) {
      const member = existingMember.data();
      if (
        isRecord(member) &&
        member.memberUid === authenticatedUid &&
        member.groupId === invite.groupId &&
        member.role === "member"
      ) {
        return { status: "ALREADY_MEMBER" as const, groupId: invite.groupId };
      }
      throw new PrivateBatchInviteError(
        "PRIVATE_BATCH_MEMBERSHIP_INVALID",
        "The existing Private Batch membership is invalid.",
      );
    }
    if (invite.status !== "active" || invite.redemptionCount >= invite.maxRedemptions) {
      throw new PrivateBatchInviteError("PRIVATE_BATCH_INVITE_INVALID", "This invitation is no longer valid.");
    }
    const currentMembers = parsePositiveInteger(
      group.currentMembers,
      "The Private Batch member count is invalid.",
    );
    const maxParticipants = parsePositiveInteger(
      group.maxParticipants,
      "The Private Batch capacity is invalid.",
    );
    if (currentMembers >= maxParticipants) {
      throw new PrivateBatchInviteError(
        "PRIVATE_BATCH_CAPACITY_REACHED",
        "This Private Batch has reached its member capacity.",
      );
    }
    // A successful concurrent redemption marks the group FULL. Report the
    // stable capacity outcome rather than treating that derived lifecycle
    // marker as an unrelated closed-batch failure on the retried transaction.
    requireBatchAcceptsMembers(group, currentTime);

    const nextMembers = currentMembers + 1;
    const nextRedemptions = invite.redemptionCount + 1;
    transaction.create(memberReference, {
      schemaVersion: 1,
      groupId: invite.groupId,
      memberUid: authenticatedUid,
      role: "member",
      joinedAt: currentTime,
      inviteId: hashPrivateBatchInviteToken(inviteToken),
    });
    transaction.update(groupReference(store, invite.groupId), {
      currentMembers: nextMembers,
      status: nextMembers >= maxParticipants ? "FULL" : group.status,
      updatedAt: currentTime,
    });
    transaction.update(inviteReference(store, inviteToken), {
      redemptionCount: nextRedemptions,
      status: nextRedemptions >= invite.maxRedemptions ? "exhausted" : "active",
    });
    return { status: "JOINED" as const, groupId: invite.groupId };
  });
};

export const revokePrivateBatchInvite = async ({
  store,
  authenticatedUid,
  inviteToken,
}: {
  store: PrivateBatchInviteStore;
  authenticatedUid: string;
  inviteToken: string;
}): Promise<Readonly<{ groupId: string; status: "REVOKED" }>> => {
  requireAuthenticatedUid(authenticatedUid);
  if (!hasText(inviteToken) || inviteToken.length < 43) {
    throw new PrivateBatchInviteError("PRIVATE_BATCH_INVITE_INVALID", "The invitation is invalid.");
  }
  return store.runTransaction(async (transaction) => {
    const invite = readInvite(await transaction.get(inviteReference(store, inviteToken)));
    const group = readGroup(
      await transaction.get(groupReference(store, invite.groupId)),
      invite.groupId,
    );
    requireOwner(group, authenticatedUid);
    transaction.update(inviteReference(store, inviteToken), { status: "revoked" });
    return { groupId: invite.groupId, status: "REVOKED" as const };
  });
};
