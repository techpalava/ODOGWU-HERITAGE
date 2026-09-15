import type { User } from "firebase/auth";
import type { FutureOrderMasterOrderV2 } from "../utils/futureOrderV2Storage.js";
import {
  parsePersistFutureOrderV2Result,
  type PersistFutureOrderV2Result,
} from "../utils/futureOrderV2PersistenceContract.js";
import type { FutureOrderV2PricingAuthorityInputV1 } from "../utils/futureOrderV2PricingAuthority.js";
import type {
  GroupRoleOrderIdentity,
  PersonalizedGroupAuthority,
} from "../utils/orderContextIdentity.js";
import { auth } from "./firebase";

export * from "../utils/futureOrderV2PersistenceContract.js";

export const FUTURE_ORDER_V2_PERSISTENCE_ENDPOINT =
  "/api/orders/persist-future-order-v2" as const;

export type FutureOrderV2PersistenceClientErrorCode =
  | "AUTH_REQUIRED"
  | "PRIVATE_BATCH_UNAUTHORIZED"
  | "PERSISTENCE_UNAVAILABLE"
  | "INVALID_RESPONSE";

export class FutureOrderV2PersistenceClientError extends Error {
  readonly code: FutureOrderV2PersistenceClientErrorCode;

  constructor(code: FutureOrderV2PersistenceClientErrorCode, message: string) {
    super(message);
    this.name = "FutureOrderV2PersistenceClientError";
    this.code = code;
  }
}

export interface FutureOrderV2ClientIdentity {
  readonly uid: string;
  readonly isAnonymous: boolean;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

/** Client-side continuation guard for a PRIVATE group route. */
export interface PrivateBatchPersistenceCapability {
  readonly generation: number;
  /** Exact listener lifecycle that established this capability. */
  readonly discoveryLifecycleId: number;
  readonly uid: string;
  readonly orderType: "Group Organizer" | "Group Member";
  readonly batchId: string;
  isCurrent(): boolean;
}

/**
 * A PRIVATE capability is deliberately acquired after Firebase has refreshed
 * its token. A forced refresh emits onIdTokenChanged, which invalidates the
 * preceding access generation before private discovery is rebuilt.
 */
export interface PrivateBatchPersistenceCapabilityFactory {
  /** Capture the lifecycle that existed before `getIdToken(true)`. */
  captureDiscoveryAnchor(): Readonly<{
    authSessionId: number;
    discoveryLifecycleId: number | null;
    uid: string | null;
  }>;
  /**
   * Wait for the discovery cycle that follows exactly one forced token
   * refresh. It must return undefined for denied, failed, or superseded
   * discovery; callers fail closed instead of reusing old authority.
   */
  ensurePostRefreshCapability(request: {
    readonly uid: string;
    readonly identity: GroupRoleOrderIdentity;
    readonly anchor: Readonly<{
      authSessionId: number;
      discoveryLifecycleId: number | null;
      uid: string | null;
    }>;
  }): Promise<PrivateBatchPersistenceCapability | undefined>;
}

export type PersistFutureOrderV2ClientResult = PersistFutureOrderV2Result & {
  /** Present only when a PRIVATE discovery capability established this call. */
  readonly privateBatchCapability?: PrivateBatchPersistenceCapability;
  /** Final source-complete authority used by a personalized request. */
  readonly personalizedGroupAuthority?: Extract<
    PersonalizedGroupAuthority,
    { status: "FINAL_PUBLIC" | "FINAL_PRIVATE" }
  >;
};

export type PersonalizedGroupAuthorityResolver = (
  identity: GroupRoleOrderIdentity,
) => PersonalizedGroupAuthority;

interface FutureOrderV2HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: Pick<Headers, "get">;
  json(): Promise<unknown>;
}

export interface FutureOrderV2PersistenceClientDependencies {
  getCurrentUser(): FutureOrderV2ClientIdentity | null;
  fetch(input: string, init: RequestInit): Promise<FutureOrderV2HttpResponse>;
}

const invalidResponse = (): FutureOrderV2PersistenceClientError =>
  new FutureOrderV2PersistenceClientError(
    "INVALID_RESPONSE",
    "The secure future order service returned an invalid response.",
  );

const readJsonResponse = async (
  response: FutureOrderV2HttpResponse,
): Promise<unknown> => {
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    throw invalidResponse();
  }
  try {
    return await response.json();
  } catch {
    throw invalidResponse();
  }
};

const parseServerError = (
  value: unknown,
): { readonly code: string; readonly error: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    typeof record.code !== "string" ||
    record.code.trim() !== record.code ||
    record.code.length === 0 ||
    typeof record.error !== "string" ||
    record.error.trim() !== record.error ||
    record.error.length === 0
  ) {
    return null;
  }
  return { code: record.code, error: record.error };
};

export const createFutureOrderV2PersistenceClient = (
  dependencies: FutureOrderV2PersistenceClientDependencies,
) => ({
  async persist({
    masterOrder,
    customerOwnerUid,
    pricingAuthorityInput,
    privateBatchCapabilityFactory,
    resolvePersonalizedGroupAuthority,
  }: {
    masterOrder: FutureOrderMasterOrderV2;
    customerOwnerUid: string;
    pricingAuthorityInput?: FutureOrderV2PricingAuthorityInputV1;
    privateBatchCapabilityFactory?: PrivateBatchPersistenceCapabilityFactory;
    resolvePersonalizedGroupAuthority?: PersonalizedGroupAuthorityResolver;
  }): Promise<PersistFutureOrderV2ClientResult> {
    const identity = dependencies.getCurrentUser();
    if (!identity || identity.isAnonymous) {
      throw new FutureOrderV2PersistenceClientError(
        "AUTH_REQUIRED",
        "A non-anonymous Firebase login is required to persist this order.",
      );
    }

    const orderIdentity = masterOrder.cartItem.candidate.orderIdentity;
    const groupOrderIdentity: GroupRoleOrderIdentity | undefined =
      orderIdentity?.orderType === "Group Organizer" ||
      orderIdentity?.orderType === "Group Member"
        ? orderIdentity
        : undefined;
    const resolveCurrentGroupAuthority = () =>
      groupOrderIdentity
        ? (resolvePersonalizedGroupAuthority?.(groupOrderIdentity) ?? {
            status: "FINAL_MISSING" as const,
            discoveryLifecycleId: 0,
          })
        : null;
    if (groupOrderIdentity && !privateBatchCapabilityFactory) {
      throw new FutureOrderV2PersistenceClientError(
        "PRIVATE_BATCH_UNAUTHORIZED",
        "A fresh personalized group discovery is required for this order.",
      );
    }
    let establishedGroupAuthority: Extract<
      PersonalizedGroupAuthority,
      { status: "FINAL_PUBLIC" | "FINAL_PRIVATE" }
    > | null = null;
    const assertCurrentAuthority = () => {
      if (!groupOrderIdentity) return;
      const currentAuthority = resolveCurrentGroupAuthority();
      if (
        !establishedGroupAuthority ||
        currentAuthority?.status !== establishedGroupAuthority.status ||
        currentAuthority.discoveryLifecycleId !==
          establishedGroupAuthority.discoveryLifecycleId
      ) {
        throw new FutureOrderV2PersistenceClientError(
          "PRIVATE_BATCH_UNAUTHORIZED",
          "The personalized discovery authority changed while this order was being prepared.",
        );
      }
    };

    const assertSameAuthenticatedIdentity = () => {
      const currentIdentity = dependencies.getCurrentUser();
      if (
        !currentIdentity ||
        currentIdentity.isAnonymous ||
        currentIdentity.uid !== identity.uid
      ) {
        throw new FutureOrderV2PersistenceClientError(
          "AUTH_REQUIRED",
          "The authenticated Firebase session changed while this order was being prepared.",
        );
      }
    };

    const assertPrivateBatchCapability = (
      privateBatchCapability: PrivateBatchPersistenceCapability | undefined,
    ) => {
      assertCurrentAuthority();
      assertSameAuthenticatedIdentity();
      if (establishedGroupAuthority?.status !== "FINAL_PRIVATE") return;
      const identityMatches =
        privateBatchCapability &&
        groupOrderIdentity?.orderType === privateBatchCapability.orderType &&
        groupOrderIdentity.batchId === privateBatchCapability.batchId;
      if (
        !identityMatches ||
        !privateBatchCapability ||
        customerOwnerUid !== privateBatchCapability.uid ||
        identity.uid !== privateBatchCapability.uid ||
        !privateBatchCapability.isCurrent()
      ) {
        throw new FutureOrderV2PersistenceClientError(
          "PRIVATE_BATCH_UNAUTHORIZED",
          "Private Batch authorization is no longer available for this order.",
        );
      }
    };

    let response: FutureOrderV2HttpResponse;
    let privateBatchCapability: PrivateBatchPersistenceCapability | undefined;
    try {
      const discoveryAnchor = groupOrderIdentity
        ? privateBatchCapabilityFactory!.captureDiscoveryAnchor()
        : null;
      const idToken = await identity.getIdToken(true);
      assertSameAuthenticatedIdentity();
      // Every personalized route, including one that currently appears
      // PUBLIC, must await the exact post-refresh source lifecycle. A PUBLIC
      // callback by itself is provisional while private discovery is pending.
      privateBatchCapability = groupOrderIdentity
        ? await privateBatchCapabilityFactory!.ensurePostRefreshCapability({
            uid: identity.uid,
            identity: groupOrderIdentity!,
            anchor: discoveryAnchor!,
          })
        : undefined;
      const currentAuthority = resolveCurrentGroupAuthority();
      if (currentAuthority?.status === "PENDING_REDISCOVERY") {
        throw new FutureOrderV2PersistenceClientError(
          "PRIVATE_BATCH_UNAUTHORIZED",
          "Personalized group discovery is still pending.",
        );
      }
      if (currentAuthority?.status === "FINAL_MISSING") {
        throw new FutureOrderV2PersistenceClientError(
          "PRIVATE_BATCH_UNAUTHORIZED",
          "The canonical personalized group is unavailable for this order.",
        );
      }
      if (currentAuthority?.status === "FINAL_PUBLIC" || currentAuthority?.status === "FINAL_PRIVATE") {
        establishedGroupAuthority = currentAuthority;
      }
      if (groupOrderIdentity && !establishedGroupAuthority) {
        throw new FutureOrderV2PersistenceClientError(
          "PRIVATE_BATCH_UNAUTHORIZED",
          "The personalized group did not reach a terminal authority state.",
        );
      }
      // Revalidate immediately before the HTTP request so a stale private
      // session cannot send the protected payload.
      assertPrivateBatchCapability(privateBatchCapability);
      response = await dependencies.fetch(
        FUTURE_ORDER_V2_PERSISTENCE_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            masterOrder,
            customerOwnerUid,
            pricingAuthorityInput,
          }),
        },
      );
    } catch (error) {
      if (error instanceof FutureOrderV2PersistenceClientError) throw error;
      throw new FutureOrderV2PersistenceClientError(
        "PERSISTENCE_UNAVAILABLE",
        "The secure future order service is temporarily unavailable.",
      );
    }

    // A server response from an earlier capability cannot publish success to
    // a later session. Server authorization remains independently enforced.
    assertPrivateBatchCapability(privateBatchCapability);
    const payload = await readJsonResponse(response);
    // JSON parsing is another asynchronous boundary; do not let a revoked
    // capability publish a parsed success after the response was received.
    assertPrivateBatchCapability(privateBatchCapability);
    const parsed = parsePersistFutureOrderV2Result(
      payload,
      masterOrder.orderId,
    );
    if (!parsed) {
      const serverError = parseServerError(payload);
      if (!serverError || response.ok) throw invalidResponse();
      if (response.status === 401 || response.status === 403) {
        throw new FutureOrderV2PersistenceClientError(
          "AUTH_REQUIRED",
          "A non-anonymous Firebase login is required to persist this order.",
        );
      }
      throw new FutureOrderV2PersistenceClientError(
        "PERSISTENCE_UNAVAILABLE",
        "The secure future order service is temporarily unavailable.",
      );
    }

    const expectedStatus =
      parsed.status === "created"
        ? 201
        : parsed.status === "already_persisted"
          ? 200
          : parsed.status === "conflict"
            ? 409
            : 400;
    if (
      response.status !== expectedStatus ||
      response.ok !== (expectedStatus < 400)
    ) {
      throw invalidResponse();
    }
    return {
      ...parsed,
      ...(privateBatchCapability ? { privateBatchCapability } : {}),
      ...(establishedGroupAuthority
        ? {
            personalizedGroupAuthority: establishedGroupAuthority,
          }
        : {}),
    };
  },
});

const futureOrderV2PersistenceClient = createFutureOrderV2PersistenceClient({
  getCurrentUser: () =>
    auth.currentUser as Pick<
      User,
      "uid" | "isAnonymous" | "getIdToken"
    > | null,
  fetch: (input, init) => fetch(input, init),
});

export const persistFutureOrderV2 = futureOrderV2PersistenceClient.persist;
