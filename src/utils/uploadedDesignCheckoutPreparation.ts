import type {
  CartItem,
  ImmutableUploadedOrderDesignReference,
} from "../types";
import { UploadedDesignTransferClientError } from "../services/customerDesignOrderTransfer";
import type {
  FirebaseCheckoutIdentity,
  TrustedUploadedDesignTransferClient,
  UploadedDesignOwnershipClaim,
} from "../services/customerDesignOrderTransfer";
import {
  buildDepositCheckoutIdFromPrepareKey,
  buildDepositPrepareKey,
} from "./depositOrderFingerprint";

export interface PreparedUploadedDesignReference {
  sourceKey: string;
  designReferenceId: string;
  orderReference: ImmutableUploadedOrderDesignReference;
}

interface PendingOwnershipClaim extends UploadedDesignOwnershipClaim {
  sourceKey: string;
  designReferenceId: string;
  ownerUid: string;
}

interface CheckoutPreparationSession {
  cartKey: string;
  prepareRequestId: string;
  checkoutId: string;
  orderIdsByItemId: Record<string, string>;
  claimsByItemId: Record<string, PendingOwnershipClaim>;
  preparedByItemId: Record<string, PreparedUploadedDesignReference>;
  pendingTransfersByItemId: Record<
    string,
    Promise<PreparedUploadedDesignReference>
  >;
}

const getUploadedItems = (items: readonly CartItem[]): CartItem[] =>
  items.filter((item) => item.cartDesignSource?.kind === "uploaded");

const getCartKey = (
  items: readonly CartItem[],
  prepareRequestId: string,
): string =>
  [
    prepareRequestId,
    ...items
      .map((item) => {
        const source = item.cartDesignSource;
        return source?.kind === "uploaded"
          ? `${item.id}:${source.sourceKey}:${source.uploadReference.designReferenceId}:${source.uploadReference.ownerUid}`
          : `${item.id}:catalog`;
      })
      .sort(),
  ].join("|");

let activeSession: CheckoutPreparationSession | null = null;

const getSession = (
  items: readonly CartItem[],
  identity: FirebaseCheckoutIdentity,
  prepareRequestId: string,
): CheckoutPreparationSession => {
  const cartKey = getCartKey(items, prepareRequestId);
  if (activeSession?.cartKey === cartKey) return activeSession;

  const prepareKey = buildDepositPrepareKey(identity.uid, prepareRequestId);
  const checkoutId = buildDepositCheckoutIdFromPrepareKey(prepareKey);
  activeSession = {
    cartKey,
    prepareRequestId,
    checkoutId,
    orderIdsByItemId: Object.fromEntries(
      items.map((item) => [item.id, `${checkoutId}-${item.id}`]),
    ),
    claimsByItemId: {},
    preparedByItemId: {},
    pendingTransfersByItemId: {},
  };
  return activeSession;
};

const getUploadedSource = (item: CartItem) => {
  if (item.cartDesignSource?.kind !== "uploaded") {
    throw new Error("Only uploaded cart items can be prepared for transfer.");
  }
  return item.cartDesignSource;
};

const matchesPreparedReference = (
  prepared: PreparedUploadedDesignReference | undefined,
  item: CartItem,
): prepared is PreparedUploadedDesignReference => {
  const source = item.cartDesignSource;
  return Boolean(
    prepared &&
      source?.kind === "uploaded" &&
      prepared.sourceKey === source.sourceKey &&
      prepared.designReferenceId === source.uploadReference.designReferenceId,
  );
};

export const createAnonymousUploadedDesignClaims = async ({
  items,
  identity,
  client,
  prepareRequestId,
}: {
  items: readonly CartItem[];
  identity: FirebaseCheckoutIdentity;
  client: TrustedUploadedDesignTransferClient;
  prepareRequestId: string;
}): Promise<void> => {
  const session = getSession(items, identity, prepareRequestId);
  for (const item of getUploadedItems(items)) {
    const source = getUploadedSource(item);
    if (source.uploadReference.ownerUid !== identity.uid) {
      continue;
    }
    const existing = session.claimsByItemId[item.id];
    if (
      existing?.sourceKey === source.sourceKey &&
      existing.designReferenceId === source.uploadReference.designReferenceId
    ) {
      continue;
    }
    const claim = await client.createOwnershipClaim(
      source.uploadReference,
      identity,
    );
    session.claimsByItemId[item.id] = {
      ...claim,
      sourceKey: source.sourceKey,
      designReferenceId: source.uploadReference.designReferenceId,
      ownerUid: source.uploadReference.ownerUid,
    };
  }
};

export const prepareUploadedDesignOrderReferences = async ({
  items,
  identity,
  client,
  prepareRequestId,
}: {
  items: readonly CartItem[];
  identity: FirebaseCheckoutIdentity;
  client: TrustedUploadedDesignTransferClient;
  prepareRequestId: string;
}): Promise<{
  checkoutId: string;
  prepareRequestId: string;
  preparedByItemId: Record<string, PreparedUploadedDesignReference>;
}> => {
  const session = getSession(items, identity, prepareRequestId);
  for (const item of getUploadedItems(items)) {
    if (matchesPreparedReference(session.preparedByItemId[item.id], item)) {
      continue;
    }
    const pendingTransfer = session.pendingTransfersByItemId[item.id];
    if (pendingTransfer) {
      await pendingTransfer;
      continue;
    }
    const source = getUploadedSource(item);
    const claim = session.claimsByItemId[item.id];
    if (source.uploadReference.ownerUid !== identity.uid && !claim) {
      throw new UploadedDesignTransferClientError(
        "CLAIM_INVALID",
        "A secure uploaded-design authorization needs to be refreshed.",
      );
    }
    const transfer = client
      .transferUploadedDesign({
        orderId: session.orderIdsByItemId[item.id],
        draftReference: source.uploadReference,
        ...(source.uploadReference.ownerUid !== identity.uid && claim
          ? { ownershipClaimToken: claim.claimToken }
          : {}),
        identity,
      })
      .then((orderReference) => {
        const preparedReference = {
          sourceKey: source.sourceKey,
          designReferenceId: source.uploadReference.designReferenceId,
          orderReference,
        };
        session.preparedByItemId[item.id] = preparedReference;
        return preparedReference;
      });
    session.pendingTransfersByItemId[item.id] = transfer;
    try {
      await transfer;
    } finally {
      delete session.pendingTransfersByItemId[item.id];
    }
  }

  return {
    checkoutId: session.checkoutId,
    prepareRequestId: session.prepareRequestId,
    preparedByItemId: { ...session.preparedByItemId },
  };
};

export const clearUploadedDesignCheckoutPreparation = (): void => {
  activeSession = null;
};

export const __resetUploadedDesignCheckoutPreparationForTests = (): void => {
  activeSession = null;
};
