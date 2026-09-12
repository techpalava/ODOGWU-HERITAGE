import type { GuestDesignDraft, OrderContext } from "../types";
import type { AuthenticatedFutureDraftRepository } from "./authenticatedFutureDraftService";
import type { FutureDesignStudioDraftInspectionResult } from "../utils/designStudioDraftPersistence";
import {
  canonicalOrderIdentitiesMatch,
  getCanonicalOrderIdentity,
  getPersistedDraftOrderIdentity,
  type CanonicalOrderIdentity,
} from "../utils/orderContextIdentity";

export type HomepageMutableDraftSource = "guest" | "authenticated";

/**
 * All pending replacement handles are bound to the exact auth/storage session
 * which observed them. Guest storage is still a session: signing in or out
 * advances its auth epoch and invalidates the old handle.
 */
export type HomepageDraftInspectionSession = Readonly<{
  authEpoch: number;
  storageKind: HomepageMutableDraftSource;
  ownerKey: string;
  isCurrent(): boolean;
}>;

type HomepageMutableDraftBase = Readonly<{
  draft: GuestDesignDraft;
  orderIdentity: CanonicalOrderIdentity;
  inspectionSession: HomepageDraftInspectionSession;
}>;

/** A pending decision contains the exact storage handle that preflight read. */
export type LoadedHomepageMutableDraft =
  | (HomepageMutableDraftBase &
      Readonly<{
        source: "guest";
        guestStorageSource: "future_v1" | "legacy";
        guestFingerprint: string;
      }>)
  | (HomepageMutableDraftBase &
      Readonly<{
        source: "authenticated";
        authenticatedOwnerUid: string;
        authenticatedAuthEpoch: number;
        authenticatedRevision: number;
      }>);

export type HomepageDraftInspectionResult =
  | Readonly<{ status: "empty" }>
  | Readonly<{ status: "valid"; existing: LoadedHomepageMutableDraft }>
  | Readonly<{ status: "invalid"; reason: string }>
  | Readonly<{ status: "unavailable"; reason: string }>;

export type HomepageDraftDiscardResult =
  | Readonly<{ status: "discarded" }>
  | Readonly<{
      status: "blocked";
      reason: string;
      /** A clear committed before a later guard rejected fresh entry. */
      clearCompleted?: boolean;
    }>;

/**
 * The destructive authority owns this guard rather than trusting a caller's
 * earlier check. It is deliberately read at each destructive boundary.
 */
export type HomepageDraftDiscardAuthorization =
  | Readonly<{ status: "authorized" }>
  | Readonly<{ status: "stale" }>
  | Readonly<{ status: "target_unavailable" }>;

export interface HomepageGuestDraftAuthority {
  inspect(): FutureDesignStudioDraftInspectionResult;
  clear(): void;
  readonly inspectionSession: HomepageDraftInspectionSession;
}

export interface HomepageAuthenticatedDraftAuthority {
  readonly repository: Pick<AuthenticatedFutureDraftRepository, "load" | "clear">;
  readonly ownerUid: string;
  readonly authEpoch: number;
  readonly inspectionSession: HomepageDraftInspectionSession;
  /** Checks the current UI identity immediately before a destructive call. */
  isCurrent(): boolean;
}

export type HomepageDraftEntryDecision =
  | Readonly<{ kind: "start_fresh" }>
  | Readonly<{ kind: "resume_existing" }>
  | Readonly<{ kind: "replacement_required" }>;

const toValidDraft = ({
  source,
  draft,
  guestStorageSource,
  guestFingerprint,
  guestInspectionSession,
  authenticated,
  authenticatedRevision,
}: {
  source: HomepageMutableDraftSource;
  draft: GuestDesignDraft;
  guestStorageSource?: "future_v1" | "legacy";
  guestFingerprint?: string;
  guestInspectionSession?: HomepageDraftInspectionSession;
  authenticated?: HomepageAuthenticatedDraftAuthority | null;
  authenticatedRevision?: number;
}): HomepageDraftInspectionResult => {
  const orderIdentity = getPersistedDraftOrderIdentity(draft);
  if (!orderIdentity) {
    return { status: "invalid", reason: "persisted_order_identity_invalid" };
  }
  if (source === "guest") {
    if (!guestStorageSource || !guestFingerprint || !guestInspectionSession) {
      return { status: "unavailable", reason: "guest_draft_handle_unavailable" };
    }
    return {
      status: "valid",
      existing: {
        source: "guest",
        draft,
        orderIdentity,
        inspectionSession: guestInspectionSession,
        guestStorageSource,
        guestFingerprint,
      },
    };
  }
  if (!authenticated || !Number.isSafeInteger(authenticatedRevision)) {
    return { status: "unavailable", reason: "authenticated_draft_handle_unavailable" };
  }
  return {
    status: "valid",
      existing: {
      source: "authenticated",
      draft,
        orderIdentity,
        inspectionSession: authenticated.inspectionSession,
      authenticatedOwnerUid: authenticated.ownerUid,
      authenticatedAuthEpoch: authenticated.authEpoch,
      authenticatedRevision,
    },
  };
};

/** Classifies a validated entry without changing either persistence store. */
export const classifyHomepageDraftEntry = ({
  existing,
  clickedOrderContext,
}: {
  existing: LoadedHomepageMutableDraft | null;
  clickedOrderContext: OrderContext;
}): HomepageDraftEntryDecision => {
  if (!existing) return { kind: "start_fresh" };
  return canonicalOrderIdentitiesMatch(
    existing.orderIdentity,
    getCanonicalOrderIdentity(clickedOrderContext),
  )
    ? { kind: "resume_existing" }
    : { kind: "replacement_required" };
};

const inspectionFailure = (
  result: Exclude<HomepageDraftInspectionResult, { status: "valid" }>,
): HomepageDraftDiscardResult => ({
  status: "blocked",
  reason:
    result.status === "empty"
      ? "draft_handle_no_longer_exists"
      : result.reason,
});

const authorizationFailure = (
  authorization: Exclude<HomepageDraftDiscardAuthorization, { status: "authorized" }>,
  clearCompleted = false,
): HomepageDraftDiscardResult => ({
  status: "blocked",
  reason:
    authorization.status === "stale"
      ? "homepage_draft_operation_stale"
      : "homepage_draft_target_unavailable",
  ...(clearCompleted ? { clearCompleted: true } : {}),
});

/**
 * Coordinates the established one-draft guest and authenticated stores. It
 * never creates another draft identity; discard replaces the single mutable
 * draft only after the inspected handle still matches current storage.
 */
export const createHomepageDraftReplacementService = ({
  guest,
  authenticated = null,
}: {
  guest: HomepageGuestDraftAuthority;
  authenticated?: HomepageAuthenticatedDraftAuthority | null;
}) => {
  const inspect = async (): Promise<HomepageDraftInspectionResult> => {
    if (authenticated) {
      if (!authenticated.inspectionSession.isCurrent()) {
        return { status: "unavailable", reason: "authenticated_inspection_session_changed" };
      }
      let cloud;
      try {
        cloud = await authenticated.repository.load();
      } catch {
        return { status: "unavailable", reason: "authenticated_draft_read_failed" };
      }
      if (cloud.status === "blocked") {
        return { status: "unavailable", reason: cloud.reason };
      }
      if (!authenticated.inspectionSession.isCurrent()) {
        return { status: "unavailable", reason: "authenticated_inspection_session_changed" };
      }
      if (cloud.status === "invalid") {
        return { status: "invalid", reason: cloud.reason };
      }
      if (cloud.status === "loaded" && cloud.record.lifecycleStatus === "active") {
        if (!cloud.record.draft) {
          return {
            status: "invalid",
            reason: "active_authenticated_draft_missing_payload",
          };
        }
        return toValidDraft({
          source: "authenticated",
          draft: cloud.record.draft,
          authenticated,
          authenticatedRevision: cloud.record.revision,
        });
      }
      if (cloud.status === "loaded" && cloud.record.lifecycleStatus === "cleared") {
        return { status: "empty" };
      }
    }

    let guestInspection: FutureDesignStudioDraftInspectionResult;
    try {
      if (!guest.inspectionSession.isCurrent()) {
        return { status: "unavailable", reason: "guest_inspection_session_changed" };
      }
      guestInspection = guest.inspect();
    } catch {
      return { status: "unavailable", reason: "guest_draft_read_failed" };
    }
    if (!guest.inspectionSession.isCurrent()) {
      return { status: "unavailable", reason: "guest_inspection_session_changed" };
    }
    if (guestInspection.status !== "valid") return guestInspection;
    return toValidDraft({
      source: "guest",
      draft: guestInspection.draft,
      guestStorageSource: guestInspection.source,
      guestFingerprint: guestInspection.fingerprint,
      guestInspectionSession: guest.inspectionSession,
    });
  };

  const revalidate = async (
    existing: LoadedHomepageMutableDraft,
  ): Promise<HomepageDraftInspectionResult> => {
    if (!existing.inspectionSession.isCurrent()) {
      return { status: "unavailable", reason: "inspection_session_changed" };
    }
    if (existing.source === "authenticated") {
      if (
        !authenticated ||
        authenticated.ownerUid !== existing.authenticatedOwnerUid ||
        authenticated.authEpoch !== existing.authenticatedAuthEpoch ||
        !authenticated.isCurrent()
      ) {
        return { status: "unavailable", reason: "authenticated_draft_handle_changed" };
      }
      const current = await inspect();
      if (!existing.inspectionSession.isCurrent()) {
        return { status: "unavailable", reason: "authenticated_draft_handle_changed" };
      }
      if (current.status !== "valid") return current;
      if (
        current.existing.source !== "authenticated" ||
        current.existing.authenticatedOwnerUid !== existing.authenticatedOwnerUid ||
        current.existing.authenticatedAuthEpoch !== existing.authenticatedAuthEpoch ||
        current.existing.authenticatedRevision !== existing.authenticatedRevision ||
        !canonicalOrderIdentitiesMatch(
          current.existing.orderIdentity,
          existing.orderIdentity,
        )
      ) {
        return { status: "invalid", reason: "authenticated_draft_handle_changed" };
      }
      return current;
    }

    const current = await inspect();
    if (!existing.inspectionSession.isCurrent()) {
      return { status: "unavailable", reason: "guest_draft_handle_changed" };
    }
    if (current.status !== "valid") return current;
    if (
      current.existing.source !== "guest" ||
      current.existing.guestStorageSource !== existing.guestStorageSource ||
      current.existing.guestFingerprint !== existing.guestFingerprint ||
      !canonicalOrderIdentitiesMatch(
        current.existing.orderIdentity,
        existing.orderIdentity,
      )
    ) {
      return { status: "invalid", reason: "guest_draft_handle_changed" };
    }
    return current;
  };

  const discard = async (
    existing: LoadedHomepageMutableDraft,
    getAuthorization: () => HomepageDraftDiscardAuthorization = () => ({
      status: "authorized",
    }),
  ): Promise<HomepageDraftDiscardResult> => {
    const verified = await revalidate(existing);
    const authorizationAfterRevalidate = getAuthorization();
    if (authorizationAfterRevalidate.status !== "authorized") {
      return authorizationFailure(authorizationAfterRevalidate);
    }
    if (verified.status !== "valid") return inspectionFailure(verified);
    if (!existing.inspectionSession.isCurrent()) {
      return { status: "blocked", reason: "inspection_session_changed" };
    }

    let clearCompleted = false;

    try {
      if (existing.source === "authenticated") {
        const authorizationBeforeAuthenticatedClear = getAuthorization();
        if (authorizationBeforeAuthenticatedClear.status !== "authorized") {
          return authorizationFailure(authorizationBeforeAuthenticatedClear);
        }
        if (!authenticated || !authenticated.isCurrent()) {
          return { status: "blocked", reason: "authenticated_draft_handle_changed" };
        }
        const cleared = await authenticated.repository.clear(
          existing.authenticatedRevision,
        );
        clearCompleted =
          cleared.status === "saved" &&
          cleared.record.lifecycleStatus === "cleared";
        const authorizationAfterAuthenticatedClear = getAuthorization();
        if (authorizationAfterAuthenticatedClear.status !== "authorized") {
          return authorizationFailure(
            authorizationAfterAuthenticatedClear,
            clearCompleted,
          );
        }
        if (!existing.inspectionSession.isCurrent() || !authenticated.isCurrent()) {
          return {
            status: "blocked",
            reason: "authenticated_draft_handle_changed",
            ...(clearCompleted ? { clearCompleted: true } : {}),
          };
        }
        if (
          cleared.status !== "saved" ||
          cleared.record.lifecycleStatus !== "cleared"
        ) {
          return {
            status: "blocked",
            reason:
              cleared.status === "blocked" || cleared.status === "invalid"
                ? cleared.reason
                : "authenticated_draft_clear_conflict",
          };
        }
      }

      // A stale guest copy must never rehydrate after either kind of discard.
      const authorizationBeforeGuestClear = getAuthorization();
      if (authorizationBeforeGuestClear.status !== "authorized") {
        return authorizationFailure(authorizationBeforeGuestClear, clearCompleted);
      }
      if (!existing.inspectionSession.isCurrent()) {
        return {
          status: "blocked",
          reason: "inspection_session_changed",
          ...(clearCompleted ? { clearCompleted: true } : {}),
        };
      }
      guest.clear();
      clearCompleted = true;
      const authorizationAfterGuestClear = getAuthorization();
      if (authorizationAfterGuestClear.status !== "authorized") {
        return authorizationFailure(authorizationAfterGuestClear, clearCompleted);
      }
      if (!existing.inspectionSession.isCurrent()) {
        return {
          status: "blocked",
          reason: "inspection_session_changed",
          clearCompleted,
        };
      }
    } catch {
      return {
        status: "blocked",
        reason: "draft_clear_failed",
        ...(clearCompleted ? { clearCompleted: true } : {}),
      };
    }

    let guestAfterClear: FutureDesignStudioDraftInspectionResult;
    try {
      guestAfterClear = guest.inspect();
    } catch {
      return {
        status: "blocked",
        reason: "guest_draft_clear_unconfirmed",
        ...(clearCompleted ? { clearCompleted: true } : {}),
      };
    }
    const authorizationAfterGuestInspection = getAuthorization();
    if (authorizationAfterGuestInspection.status !== "authorized") {
      return authorizationFailure(authorizationAfterGuestInspection, clearCompleted);
    }
    if (!existing.inspectionSession.isCurrent()) {
      return {
        status: "blocked",
        reason: "inspection_session_changed",
        ...(clearCompleted ? { clearCompleted: true } : {}),
      };
    }
    if (guestAfterClear.status !== "empty") {
      return {
        status: "blocked",
        reason: "guest_draft_clear_unconfirmed",
        ...(clearCompleted ? { clearCompleted: true } : {}),
      };
    }

    if (existing.source === "authenticated" && authenticated) {
      const confirmed = await authenticated.repository.load();
      const authorizationAfterAuthenticatedConfirmation = getAuthorization();
      if (authorizationAfterAuthenticatedConfirmation.status !== "authorized") {
        return authorizationFailure(
          authorizationAfterAuthenticatedConfirmation,
          clearCompleted,
        );
      }
      if (!existing.inspectionSession.isCurrent() || !authenticated.isCurrent()) {
        return {
          status: "blocked",
          reason: "authenticated_draft_handle_changed",
          ...(clearCompleted ? { clearCompleted: true } : {}),
        };
      }
      if (
        confirmed.status !== "loaded" ||
        confirmed.record.lifecycleStatus !== "cleared"
      ) {
        return {
          status: "blocked",
          reason: "authenticated_draft_clear_unconfirmed",
          ...(clearCompleted ? { clearCompleted: true } : {}),
        };
      }
    }

    return { status: "discarded" };
  };

  return { inspect, revalidate, discard };
};

export type HomepageDraftReplacementDiscardExecution =
  | Readonly<{ status: "discarded"; orderContext: OrderContext }>
  | Readonly<{
      status:
        | "stale"
        | "draft_unavailable"
        | "target_unavailable"
        | "target_unavailable_after_clear"
        | "clear_failed";
      reason?: string;
    }>;

/**
 * The App's destructive transition. The caller supplies a current-state target
 * resolver and an operation token; this keeps every asynchronous boundary
 * incapable of bootstrapping a fresh order after cancellation, session change,
 * or target change.
 */
export const executeHomepageDraftReplacementDiscard = async ({
  existing,
  authority,
  isOperationCurrent,
  getCurrentTarget,
}: {
  existing: LoadedHomepageMutableDraft;
  authority: ReturnType<typeof createHomepageDraftReplacementService>;
  isOperationCurrent: () => boolean;
  getCurrentTarget: () => Readonly<{ orderContext: OrderContext }> | null;
}): Promise<HomepageDraftReplacementDiscardExecution> => {
  const getAuthorization = (): HomepageDraftDiscardAuthorization => {
    if (!isOperationCurrent()) return { status: "stale" };
    return getCurrentTarget()
      ? { status: "authorized" }
      : { status: "target_unavailable" };
  };
  const authorizationToExecution = (
    authorization: Exclude<HomepageDraftDiscardAuthorization, { status: "authorized" }>,
    clearCompleted = false,
  ): HomepageDraftReplacementDiscardExecution =>
    authorization.status === "stale"
      ? { status: "stale" }
      : {
          status: clearCompleted
            ? "target_unavailable_after_clear"
            : "target_unavailable",
        };

  const initialAuthorization = getAuthorization();
  if (initialAuthorization.status !== "authorized") {
    return authorizationToExecution(initialAuthorization);
  }

  const verification = await authority.revalidate(existing);
  const authorizationAfterVerification = getAuthorization();
  if (authorizationAfterVerification.status !== "authorized") {
    return authorizationToExecution(authorizationAfterVerification);
  }
  if (verification.status !== "valid") {
    if (verification.status === "empty") {
      return { status: "draft_unavailable", reason: "draft_handle_no_longer_exists" };
    }
    return {
      status: "draft_unavailable",
      reason: verification.reason,
    };
  }

  const authorizationBeforeClear = getAuthorization();
  if (authorizationBeforeClear.status !== "authorized") {
    return authorizationToExecution(authorizationBeforeClear);
  }

  const cleared = await authority.discard(existing, getAuthorization);
  const authorizationAfterClear = getAuthorization();
  if (authorizationAfterClear.status !== "authorized") {
    return authorizationToExecution(
      authorizationAfterClear,
      cleared.status === "blocked" && Boolean(cleared.clearCompleted),
    );
  }
  if (cleared.status !== "discarded") {
    return { status: "clear_failed", reason: cleared.reason };
  }

  const targetAfterClear = getCurrentTarget();
  if (!isOperationCurrent()) return { status: "stale" };
  if (!targetAfterClear) return { status: "target_unavailable_after_clear" };
  return { status: "discarded", orderContext: targetAfterClear.orderContext };
};
