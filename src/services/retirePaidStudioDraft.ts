import { auth } from "./firebase";
import {
  createFirebaseAuthenticatedFutureDraftRepository,
  type AuthenticatedFutureDraftRepository,
} from "./authenticatedFutureDraftService";
import { GuestOrderSessionService } from "./guestOrderSessionService";
import { useAppStore } from "../store/useAppStore";

/**
 * Set when a recorded V2 payment retires the Studio draft. Autosave must not
 * write that draft back while the confirmation screen is still mounted.
 * The next Studio session (identity reset on entry) clears this.
 */
let retiredUntilNextStudioSession = false;

export const isStudioFutureDesignDraftRetired = (): boolean =>
  retiredUntilNextStudioSession;

export const allowNextStudioFutureDesignDraftSession = (): void => {
  retiredUntilNextStudioSession = false;
};

const createLiveAuthenticatedStudioDraftRepository = () => {
  const firebaseUser = auth.currentUser;
  const storedCustomer = useAppStore.getState().currentUser;
  const customer =
    storedCustomer ??
    (firebaseUser && !firebaseUser.isAnonymous
      ? {
          name: firebaseUser.displayName || "Customer",
          ownerUid: firebaseUser.uid,
          email: firebaseUser.email ?? undefined,
        }
      : null);
  return createFirebaseAuthenticatedFutureDraftRepository({
    customer,
    authResolved: true,
    firebaseUser,
  });
};

const clearAuthenticatedStudioDraft = async (
  repository: Pick<AuthenticatedFutureDraftRepository, "clear">,
  expectedRevision: number | null,
): Promise<void> => {
  try {
    const cleared = await repository.clear(expectedRevision);
    if (cleared.status !== "conflict" || !cleared.currentRecord) return;
    if (cleared.currentRecord.lifecycleStatus === "cleared") return;
    if (cleared.currentRecord.revision === expectedRevision) return;
    await repository.clear(cleared.currentRecord.revision);
  } catch {
    // The local draft is already gone. A cloud failure must not undo payment.
  }
};

/**
 * Same retirement Start another order and Cancel Order use: drop the guest V1
 * draft, unpark the Studio bag flag, and clear the authenticated cloud draft.
 * `clear(null)` conflicts once a cloud revision exists, so a conflict retries
 * once with that revision. Add to cart must not call this.
 */
export const retireStudioFutureDesignDraft = ({
  repository,
  expectedRevision = null,
}: {
  repository?: Pick<AuthenticatedFutureDraftRepository, "clear"> | null;
  expectedRevision?: number | null;
} = {}): Promise<void> => {
  retiredUntilNextStudioSession = true;
  GuestOrderSessionService.clearFutureDesignDraft();
  useAppStore.getState().setStudioParkedInFutureOrderV2Cart(false);
  const resolved =
    repository ?? createLiveAuthenticatedStudioDraftRepository();
  return clearAuthenticatedStudioDraft(resolved, expectedRevision);
};
