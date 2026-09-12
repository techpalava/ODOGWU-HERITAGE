import type { Batch, CustomGroup, GuestDesignDraft, OrderContext } from "../types";
import { CapacityService } from "../services/CapacityService";

export type CanonicalOrderIdentity =
  | Readonly<{ orderType: "Individual" }>
  | Readonly<{ orderType: "Community"; batchId: string }>
  | Readonly<{ orderType: "Group Organizer"; batchId: string }>
  | Readonly<{ orderType: "Group Member"; batchId: string }>;

export type PrivateBatchAccessRole = "owner" | "member" | "admin";

export type PrivateBatchAccessById = Readonly<
  Record<string, PrivateBatchAccessRole | undefined>
>;

export type GroupRoleOrderIdentity = Extract<
  CanonicalOrderIdentity,
  { orderType: "Group Organizer" | "Group Member" }
>;

/**
 * Persistence uses this visibility result before deciding whether a Group
 * Organizer/Member route needs a Private Batch capability. A missing or
 * malformed canonical group is deliberately indistinguishable from UNKNOWN.
 */
type PersonalizedGroupVisibility =
  | "PUBLIC"
  | "PRIVATE"
  | "UNKNOWN";

/**
 * The one authority contract for personalized persistence and Studio
 * continuations. A PUBLIC document observed while its owner/member/admin
 * discovery is incomplete is intentionally not FINAL_PUBLIC.
 */
export type PersonalizedGroupAuthority =
  | Readonly<{
      status: "PENDING_REDISCOVERY";
      discoveryLifecycleId: number | null;
    }>
  | Readonly<{
      status: "FINAL_PUBLIC";
      visibility: "PUBLIC";
      discoveryLifecycleId: number;
    }>
  | Readonly<{
      status: "FINAL_PRIVATE";
      visibility: "PRIVATE";
      discoveryLifecycleId: number;
    }>
  | Readonly<{
      status: "FINAL_MISSING";
      discoveryLifecycleId: number;
    }>;

export type GroupOrderIdentityResolution =
  | Readonly<{
      status: "public";
      group: CustomGroup;
      context: OrderContext;
    }>
  | Readonly<{
      status: "private_authorized";
      group: CustomGroup;
      context: OrderContext;
    }>
  | Readonly<{
      status: "private_unauthorized";
      group: CustomGroup;
      context: null;
    }>
  | Readonly<{ status: "unavailable"; group: null; context: null }>;

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isGroupRoleOrderIdentity = (
  identity: CanonicalOrderIdentity | null | undefined,
): identity is GroupRoleOrderIdentity =>
  identity?.orderType === "Group Organizer" ||
  identity?.orderType === "Group Member";

const resolvePersonalizedGroupVisibility = ({
  identity,
  groups,
}: {
  identity: GroupRoleOrderIdentity;
  groups: readonly CustomGroup[];
}): PersonalizedGroupVisibility => {
  const group = groups.find((candidate) => candidate.batchId === identity.batchId);
  return group?.visibility === "PUBLIC" || group?.visibility === "PRIVATE"
    ? group.visibility
    : "UNKNOWN";
};

export const resolvePersonalizedGroupAuthority = ({
  identity,
  groups,
  privateAccessReady,
  discoveryLifecycleId,
}: {
  identity: GroupRoleOrderIdentity;
  groups: readonly CustomGroup[];
  privateAccessReady: boolean;
  discoveryLifecycleId: number | null;
}): PersonalizedGroupAuthority => {
  // Source-complete discovery, not the last visible record, is the terminal
  // boundary. This prevents a stale PUBLIC callback from becoming usable
  // while the matching private source is still pending.
  if (!privateAccessReady || discoveryLifecycleId === null) {
    return {
      status: "PENDING_REDISCOVERY",
      discoveryLifecycleId,
    };
  }
  const visibility = resolvePersonalizedGroupVisibility({ identity, groups });
  if (visibility === "PUBLIC") {
    return {
      status: "FINAL_PUBLIC",
      visibility,
      discoveryLifecycleId,
    };
  }
  if (visibility === "PRIVATE") {
    return {
      status: "FINAL_PRIVATE",
      visibility,
      discoveryLifecycleId,
    };
  }
  return {
    status: "FINAL_MISSING",
    discoveryLifecycleId,
  };
};

export const getCanonicalOrderIdentity = (
  context: unknown,
): CanonicalOrderIdentity | null => {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return null;
  }
  const record = context as Pick<OrderContext, "orderType" | "batchId">;
  if (record.orderType === "Individual") {
    return { orderType: "Individual" };
  }
  if (
    (record.orderType === "Community" ||
      record.orderType === "Group Organizer" ||
      record.orderType === "Group Member") &&
    hasText(record.batchId)
  ) {
    return { orderType: record.orderType, batchId: record.batchId };
  }
  return null;
};

export const getPersistedDraftOrderIdentity = (
  draft: Pick<
    GuestDesignDraft,
    "batchType" | "batchId" | "privateBatchRole"
  > | null | undefined,
): CanonicalOrderIdentity | null => {
  if (!draft) return null;
  if (draft.batchType === "alone") {
    return { orderType: "Individual" };
  }
  if (draft.batchType === "community" && hasText(draft.batchId)) {
    return { orderType: "Community", batchId: draft.batchId };
  }
  if (draft.batchType === "personalized" && hasText(draft.batchId)) {
    if (draft.privateBatchRole === "organizer") {
      return { orderType: "Group Organizer", batchId: draft.batchId };
    }
    if (draft.privateBatchRole === "member") {
      return { orderType: "Group Member", batchId: draft.batchId };
    }
  }
  return null;
};

export const canonicalOrderIdentitiesMatch = (
  left: CanonicalOrderIdentity | null,
  right: CanonicalOrderIdentity | null,
): boolean =>
  Boolean(
    left &&
      right &&
      left.orderType === right.orderType &&
      (left.orderType === "Individual" ||
        (right.orderType !== "Individual" && left.batchId === right.batchId)),
  );

const toGroupOrderContext = (
  identity: GroupRoleOrderIdentity,
  group: CustomGroup,
): OrderContext => ({
  orderType: identity.orderType,
  batchId: identity.batchId,
  batchName: group.batchName,
  batchVisibility: group.visibility,
  organizer: group.organizer,
  closingDate: group.closingDate,
  deliveryWindow: group.deliveryWindow,
  expectedParticipants: group.expectedParticipants,
  currentMembers: group.currentMembers,
  pickupLocation: group.pickupLocation,
  batchStatus: group.status,
  allowOrders: group.status === "OPEN" || group.status === "ALMOST_FULL",
});

/**
 * Resolve the custom-group visibility before applying a role's authorization
 * model. Group Organizer/Member are legacy personalized roles shared by the
 * released PUBLIC route and the new PRIVATE route; the role alone is never a
 * privacy classification.
 */
export const resolveGroupOrderIdentity = ({
  identity,
  groups,
  viewerUid,
  accessById,
}: {
  identity: GroupRoleOrderIdentity;
  groups: readonly CustomGroup[];
  viewerUid: string | null | undefined;
  accessById: PrivateBatchAccessById | null | undefined;
}): GroupOrderIdentityResolution => {
  const group = groups.find(
    (candidate) => candidate.batchId === identity.batchId,
  );
  if (!group) return { status: "unavailable", group: null, context: null };

  if (group.visibility === "PUBLIC") {
    return {
      status: "public",
      group,
      context: toGroupOrderContext(identity, group),
    };
  }

  if (!viewerUid || !accessById) {
    return { status: "private_unauthorized", group, context: null };
  }

  const access = accessById[identity.batchId];
  const ownerAuthorized =
    access === "admin" ||
    (access === "owner" && group.ownerUid === viewerUid);
  const memberAuthorized = access === "admin" || access === "member";
  if (
    (identity.orderType === "Group Organizer" && !ownerAuthorized) ||
    (identity.orderType === "Group Member" && !memberAuthorized)
  ) {
    return { status: "private_unauthorized", group, context: null };
  }

  return {
    status: "private_authorized",
    group,
    context: toGroupOrderContext(identity, group),
  };
};

/**
 * Live Studio actions use this independently of persisted-draft hydration so
 * a later listener/auth change cannot leave a previously hydrated private
 * context authorized by stale rendered state.
 */
export const isPrivateBatchOrderIdentityAuthorized = ({
  identity,
  groups,
  viewerUid,
  accessById,
}: {
  identity: GroupRoleOrderIdentity;
  groups: readonly CustomGroup[];
  viewerUid: string | null | undefined;
  accessById: PrivateBatchAccessById | null | undefined;
}): boolean =>
  resolveGroupOrderIdentity({ identity, groups, viewerUid, accessById }).status ===
  "private_authorized";

export interface PersistedPrivateBatchHydrationAuthority {
  readonly groups: readonly CustomGroup[];
  readonly viewerUid: string | null | undefined;
  readonly accessById: PrivateBatchAccessById | null | undefined;
}

/**
 * Rebuilds a saved order context from its canonical identity. Community drafts
 * resolve live batch details by their retained ID only; they never fall back to
 * whichever batch is currently accepting homepage registrations.
 */
export const resolvePersistedDraftOrderContext = (
  draft: Pick<
    GuestDesignDraft,
    "batchType" | "batchId" | "batchName" | "privateBatchRole"
  > | null | undefined,
  batches: readonly Batch[],
  defaultPickupLocation: string,
  privateBatchAuthority?: PersistedPrivateBatchHydrationAuthority,
): OrderContext | null => {
  const identity = getPersistedDraftOrderIdentity(draft);
  if (!identity) return null;
  if (identity.orderType === "Individual") {
    return { orderType: "Individual" };
  }
  if (
    identity.orderType === "Group Organizer" ||
    identity.orderType === "Group Member"
  ) {
    if (!privateBatchAuthority) return null;
    const resolved = resolveGroupOrderIdentity({
      identity,
      groups: privateBatchAuthority.groups,
      viewerUid: privateBatchAuthority.viewerUid,
      accessById: privateBatchAuthority.accessById,
    });
    return resolved.status === "public" ||
      resolved.status === "private_authorized"
      ? resolved.context
      : null;
  }

  const liveBatch = batches.find((batch) => batch.id === identity.batchId);
  if (!liveBatch) {
    return {
      orderType: "Community",
      batchId: identity.batchId,
      ...(hasText(draft?.batchName) ? { batchName: draft.batchName } : {}),
    };
  }

  return {
    orderType: "Community",
    batchId: identity.batchId,
    batchName: liveBatch.name,
    closingDate: liveBatch.endDate,
    deliveryWindow: liveBatch.estimatedDelivery || "",
    expectedParticipants: CapacityService.getTargetCapacity(liveBatch),
    currentMembers: CapacityService.getReservedCapacity(liveBatch),
    allowOrders: liveBatch.allowOrders,
    batchStatus: liveBatch.status,
    pickupLocation: liveBatch.pickupLocation || defaultPickupLocation,
  };
};

/**
 * The Studio uses this before hydrating any persisted selections. It keeps the
 * context-less reload path on the saved identity and gives malformed canonical
 * drafts no route through the current registration batch.
 */
export const resolvePersistedDraftHydrationContext = (
  draft: Pick<
    GuestDesignDraft,
    "batchType" | "batchId" | "batchName" | "privateBatchRole"
  >,
  batches: readonly Batch[],
  defaultPickupLocation: string,
  privateBatchAuthority?: PersistedPrivateBatchHydrationAuthority,
):
  | Readonly<{ status: "valid"; identity: CanonicalOrderIdentity; context: OrderContext }>
  | Readonly<{ status: "invalid"; reason: "persisted_order_identity_invalid" }> => {
  const identity = getPersistedDraftOrderIdentity(draft);
  if (!identity) {
    return { status: "invalid", reason: "persisted_order_identity_invalid" };
  }
  const context = resolvePersistedDraftOrderContext(
    draft,
    batches,
    defaultPickupLocation,
    privateBatchAuthority,
  );
  if (!context) {
    return { status: "invalid", reason: "persisted_order_identity_invalid" };
  }
  return { status: "valid", identity, context };
};
