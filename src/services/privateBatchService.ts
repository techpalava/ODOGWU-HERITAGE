import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import type { OrderContext } from "../types";
import { auth, db } from "./firebase";

export interface PrivateBatchBusinessLimits {
  readonly minParticipantsRequired: number;
  readonly maxParticipantsAllowed: number;
}

export interface PrivateBatchCreationInput {
  readonly batchName: string;
  readonly occasion: string;
  readonly description: string;
  readonly country: string;
  readonly city: string;
  readonly preferredDeliveryMonth: string;
  readonly expectedParticipants: number;
  readonly maxParticipants: number;
  readonly organizerName: string;
  readonly closingDate: string;
  readonly deliveryWindow: string;
  readonly pickupLocation?: string;
  readonly notes?: string;
  readonly status?: "DRAFT" | "OPEN";
}

export interface PrivateBatchCreationRecord extends DocumentData {
  readonly schemaVersion: 1;
  readonly batchId: string;
  readonly ownerUid: string;
  readonly organizerId: string;
  readonly organizer: string;
  readonly batchName: string;
  readonly occasion: string;
  readonly description: string;
  readonly country: string;
  readonly city: string;
  readonly preferredDeliveryMonth: string;
  readonly expectedParticipants: number;
  readonly maxParticipants: number;
  readonly visibility: "PRIVATE";
  readonly currentMembers: 1;
  readonly closingDate: string;
  readonly deliveryWindow: string;
  readonly status: "DRAFT" | "OPEN";
  readonly pickupLocation?: string;
  readonly notes?: string;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
}

export class PrivateBatchCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivateBatchCreationError";
  }
}

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isSafeCanonicalGroupId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);

const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const REQUIRED_TEXT_LIMITS = {
  batchName: 160,
  occasion: 160,
  description: 2000,
  country: 160,
  city: 160,
  preferredDeliveryMonth: 160,
  organizerName: 160,
  closingDate: 160,
  deliveryWindow: 160,
} as const;

const assertCreationInput = (
  input: PrivateBatchCreationInput,
  limits: PrivateBatchBusinessLimits,
) => {
  for (const [label, maximumLength] of Object.entries(REQUIRED_TEXT_LIMITS)) {
    const value = input[label as keyof typeof REQUIRED_TEXT_LIMITS];
    if (!hasText(value) || value.trim().length > maximumLength) {
      throw new PrivateBatchCreationError(
        `${label} is required and must be no longer than ${maximumLength} characters.`,
      );
    }
  }
  if (input.status !== undefined && input.status !== "DRAFT" && input.status !== "OPEN") {
    throw new PrivateBatchCreationError("Private Batch status is invalid.");
  }
  if (
    !isPositiveInteger(limits.minParticipantsRequired) ||
    !isPositiveInteger(limits.maxParticipantsAllowed) ||
    limits.minParticipantsRequired > limits.maxParticipantsAllowed
  ) {
    throw new PrivateBatchCreationError("Private Batch business limits are unavailable.");
  }
  if (
    !isPositiveInteger(input.expectedParticipants) ||
    !isPositiveInteger(input.maxParticipants) ||
    input.expectedParticipants < limits.minParticipantsRequired ||
    input.expectedParticipants > input.maxParticipants ||
    input.maxParticipants > limits.maxParticipantsAllowed
  ) {
    throw new PrivateBatchCreationError("Private Batch capacity is outside the configured limits.");
  }
};

export const buildPrivateBatchCreationRecord = ({
  groupId,
  ownerUid,
  input,
  limits,
  timestamps,
}: {
  groupId: string;
  ownerUid: string;
  input: PrivateBatchCreationInput;
  limits: PrivateBatchBusinessLimits;
  timestamps: Readonly<{ createdAt: unknown; updatedAt: unknown }>;
}): PrivateBatchCreationRecord => {
  if (!isSafeCanonicalGroupId(groupId)) {
    throw new PrivateBatchCreationError("A secure canonical Private Batch ID is required.");
  }
  if (!hasText(ownerUid)) {
    throw new PrivateBatchCreationError("Firebase authentication is required to create a Private Batch.");
  }
  assertCreationInput(input, limits);
  return {
    schemaVersion: 1,
    batchId: groupId,
    ownerUid,
    organizerId: ownerUid,
    organizer: input.organizerName.trim(),
    batchName: input.batchName.trim(),
    occasion: input.occasion.trim(),
    description: input.description.trim(),
    country: input.country.trim(),
    city: input.city.trim(),
    preferredDeliveryMonth: input.preferredDeliveryMonth.trim(),
    expectedParticipants: input.expectedParticipants,
    maxParticipants: input.maxParticipants,
    visibility: "PRIVATE",
    currentMembers: 1,
    closingDate: input.closingDate.trim(),
    deliveryWindow: input.deliveryWindow.trim(),
    status: input.status || "OPEN",
    ...(hasText(input.pickupLocation)
      ? { pickupLocation: input.pickupLocation.trim() }
      : {}),
    ...(hasText(input.notes) ? { notes: input.notes.trim() } : {}),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };
};

export interface PrivateBatchCreationDependencies {
  readonly getAuthenticatedUid: () => string | null;
  readonly createCanonicalGroupId: () => string;
  readonly write: (groupId: string, record: PrivateBatchCreationRecord) => Promise<void>;
  readonly serverTimestamp: () => unknown;
}

const defaultDependencies = (): PrivateBatchCreationDependencies => ({
  getAuthenticatedUid: () => {
    const user = auth.currentUser;
    return user && !user.isAnonymous ? user.uid : null;
  },
  createCanonicalGroupId: () => doc(collection(db, "customGroups")).id,
  write: async (groupId, record) => {
    await setDoc(doc(db, "customGroups", groupId), record);
  },
  serverTimestamp,
});

export interface CreatedPrivateBatch {
  readonly groupId: string;
  readonly orderContext: Readonly<OrderContext>;
}

/**
 * Foundation-only creation authority. It intentionally has no UI dependency;
 * the later customer setup flow can call this after collecting its input.
 */
export const createPrivateBatch = async ({
  input,
  limits,
  dependencies = defaultDependencies(),
}: {
  input: PrivateBatchCreationInput;
  limits: PrivateBatchBusinessLimits;
  dependencies?: PrivateBatchCreationDependencies;
}): Promise<CreatedPrivateBatch> => {
  const ownerUid = dependencies.getAuthenticatedUid();
  const groupId = dependencies.createCanonicalGroupId();
  const record = buildPrivateBatchCreationRecord({
    groupId,
    ownerUid: ownerUid || "",
    input,
    limits,
    timestamps: {
      createdAt: dependencies.serverTimestamp(),
      updatedAt: dependencies.serverTimestamp(),
    },
  });
  await dependencies.write(groupId, record);
  return {
    groupId,
    orderContext: {
      orderType: "Group Organizer",
      batchId: groupId,
      batchName: record.batchName,
      organizer: record.organizer,
      closingDate: record.closingDate,
      deliveryWindow: record.deliveryWindow,
      expectedParticipants: record.expectedParticipants,
      currentMembers: record.currentMembers,
      pickupLocation: record.pickupLocation,
      batchStatus: record.status,
      allowOrders: record.status === "OPEN",
    },
  };
};
